from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select

from backend.db import OrderItem, SessionLocal, User
from backend.main import app


def test_local_frontend_origins_can_preflight_order_requests() -> None:
    client = TestClient(app)
    for origin in ("http://localhost:5173", "http://127.0.0.1:5173"):
        response = client.options("/api/orders", headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type",
        })
        assert response.status_code == 200
        assert response.headers["access-control-allow-origin"] == origin


def test_personalization_order_and_review_loop() -> None:
    client = TestClient(app)
    email = f"foodfusion-{uuid4().hex}@example.com"
    signup = client.post("/api/auth/signup", json={
        "name": "Test customer",
        "email": email,
        "password": "secure-test-password",
    })
    assert signup.status_code == 200
    assert signup.json()["access_token"]
    with SessionLocal() as session:
        assert session.scalar(select(User).where(User.email == email)) is not None
    headers = {"Authorization": f"Bearer {signup.json()['access_token']}"}

    saved_preferences = client.put("/api/preferences", headers=headers, json={
        "diet": "Everything",
        "cuisines": ["Indian"],
        "min_budget": 100,
        "max_budget": 500,
        "spice": "Spicy",
        "meal": "Dinner",
        "health": "Both",
        "avoid": "",
    })
    assert saved_preferences.status_code == 200

    favorite = client.put("/api/favorites", headers=headers, json={
        "item_type": "food",
        "item_id": 15,
    })
    assert favorite.status_code == 200
    assert client.get("/api/favorites", headers=headers).json() == [
        {"item_type": "food", "item_id": 15},
    ]
    restaurant_favorite = client.put("/api/favorites", headers=headers, json={
        "item_type": "restaurant",
        "item_id": 9,
    })
    assert restaurant_favorite.status_code == 200
    saved_cart = client.put("/api/cart", headers=headers, json={
        "items": [{"id": 15, "quantity": 2}],
    })
    assert saved_cart.status_code == 200
    assert client.get("/api/cart", headers=headers).json() == [{"id": 15, "quantity": 2}]

    intent_search = client.post("/api/recommendations", headers=headers, json={
        "cuisine": ["Indian"],
        "diet": "Everything",
        "min_budget": 0,
        "max_budget": 500,
        "spice": "Spicy",
        "health": "Both",
        "query": "spicy chicken under ₹300",
    })
    assert intent_search.status_code == 200
    assert any(item["id"] == 15 for item in intent_search.json())
    chicken_search_matches = client.get("/api/catalog/foods", params={"query": "spicy chicken under ₹300"})
    assert {item["id"] for item in intent_search.json()} <= {item["id"] for item in chicken_search_matches.json()}

    created_order = client.post("/api/orders", headers=headers, json={
        "items": [{"id": 15, "quantity": 1}],
        "address": "14 Sample Street, Indiranagar",
        "location": "Indiranagar",
        "payment_method": "Cash on delivery",
    })
    assert created_order.status_code == 201
    order = created_order.json()
    assert order["total"] == 353
    assert order["items"][0]["restaurant"] == "Dum House"
    with SessionLocal() as session:
        assert session.query(OrderItem).filter_by(order_id=order["id"]).count() == 1
    assert client.get("/api/cart", headers=headers).json() == []
    assert client.get("/api/orders", headers=headers).json()[0]["id"] == order["id"]
    assert client.put("/api/cart", headers=headers, json={"items": []}).status_code == 200
    assert client.get("/api/cart", headers=headers).json() == []

    assert order["status"] == "placed"
    skipped_stage = client.patch(
        f"/api/orders/{order['id']}/status",
        headers=headers,
        json={"stage": 3},
    )
    assert skipped_stage.status_code == 409
    for stage in range(2, 7):
        delivered = client.patch(
            f"/api/orders/{order['id']}/status",
            headers=headers,
            json={"stage": stage},
        )
        assert delivered.status_code == 200
    assert delivered.json()["status"] == "delivered"
    review = client.post("/api/reviews", headers=headers, json={
        "order_id": order["id"],
        "item_id": 15,
        "rating": 5,
        "comment": "Great balance of spice and flavor.",
    })
    assert review.status_code == 201

    future_picks = client.post("/api/recommendations", headers=headers, json={
        "cuisine": ["Indian"],
        "diet": "Everything",
        "min_budget": 0,
        "max_budget": 500,
        "spice": "Spicy",
        "health": "Both",
    })
    assert future_picks.status_code == 200
    chicken_biryani = next(item for item in future_picks.json() if item["id"] == 15)
    assert "Learns from your saves, orders, and reviews" in chicken_biryani["reasons"]
    assert client.get("/api/reviews", headers=headers).json()[0]["order_id"] == order["id"]


def test_login_requires_registered_email_and_matching_password() -> None:
    client = TestClient(app)
    email = f"auth-{uuid4().hex}@example.com"
    password = "correct-horse-battery"
    signup = client.post("/api/auth/signup", json={
        "name": "Auth test customer",
        "email": email,
        "password": password,
    })
    assert signup.status_code == 200
    assert signup.json()["access_token"]

    missing_account = client.post("/api/auth/login", json={
        "email": f"missing-{uuid4().hex}@example.com",
        "password": password,
    })
    assert missing_account.status_code == 401
    assert missing_account.json()["detail"] == "Account not found. Please sign up first."

    wrong_password = client.post("/api/auth/login", json={
        "email": email,
        "password": "incorrect-password",
    })
    assert wrong_password.status_code == 401
    assert wrong_password.json()["detail"] == "Incorrect password. Please try again."

    valid_login = client.post("/api/auth/login", json={
        "email": email.upper(),
        "password": password,
    })
    assert valid_login.status_code == 200
    assert valid_login.json()["user"]["email"] == email
    assert valid_login.json()["user"]["id"] == signup.json()["user"]["id"]

    duplicate_signup = client.post("/api/auth/signup", json={
        "name": "Another customer",
        "email": email,
        "password": password,
    })
    assert duplicate_signup.status_code == 409
    assert "already exists" in duplicate_signup.json()["detail"]


def test_database_catalog_search_categories_and_restaurant_menu() -> None:
    client = TestClient(app)
    all_foods = client.get("/api/catalog/foods", params={"limit": 500})
    assert all_foods.status_code == 200
    assert len(all_foods.json()) >= 108

    search = client.get("/api/catalog/foods", params={"query": "chicken biryani", "max_price": 300})
    assert search.status_code == 200
    assert any(food["id"] == 15 for food in search.json())

    natural_search = client.get("/api/catalog/foods", params={
        "query": "Show me spicy vegetarian food under ₹250",
    })
    assert natural_search.status_code == 200
    assert natural_search.json()
    assert all(
        food["veg"] and food["spice"] == "Spicy" and food["price"] <= 250
        for food in natural_search.json()
    )

    natural_recommendations = client.post("/api/recommendations", json={
        "diet": "Everything",
        "min_budget": 0,
        "max_budget": 10000,
        "spice": "Medium",
        "health": "Both",
        "query": "Show me spicy vegetarian food under ₹250",
    })
    assert natural_recommendations.status_code == 200
    assert natural_recommendations.json()
    assert {item["id"] for item in natural_recommendations.json()} <= {food["id"] for food in natural_search.json()}

    vegan_recommendations = client.post("/api/recommendations", json={
        "diet": "Everything",
        "min_budget": 0,
        "max_budget": 10000,
        "spice": "Medium",
        "health": "Both",
        "query": "vegan",
    })
    assert vegan_recommendations.status_code == 200
    assert vegan_recommendations.json()
    vegan_catalog = client.get("/api/catalog/foods", params={"query": "vegan", "vegan": True})
    assert {item["id"] for item in vegan_recommendations.json()} <= {food["id"] for food in vegan_catalog.json()}

    categories = client.get("/api/catalog/categories")
    assert categories.status_code == 200
    assert all(category["item_count"] >= 3 for category in categories.json())
    assert any(category["name"] == "Biryani" and category["item_count"] >= 3 for category in categories.json())

    restaurants = client.get("/api/catalog/restaurants")
    assert restaurants.status_code == 200
    assert len(restaurants.json()) == 12
    assert {category["name"] for category in categories.json()} >= {"Biryani", "Breakfast", "Seafood", "Vegan", "Cakes"}

    menu = client.get("/api/catalog/restaurants/9/menu")
    assert menu.status_code == 200
    assert menu.json()["restaurant"]["name"] == "Cream & Crumb"
    assert menu.json()["menu"]


def test_recent_search_and_food_view_increase_recommendation_score() -> None:
    client = TestClient(app)
    email = f"signals-{uuid4().hex}@example.com"
    signup = client.post("/api/auth/signup", json={
        "name": "Signal test customer",
        "email": email,
        "password": "secure-test-password",
    })
    headers = {"Authorization": f"Bearer {signup.json()['access_token']}"}
    preferences = {
        "cuisine": [],
        "categories": [],
        "diet": "Everything",
        "min_budget": 0,
        "max_budget": 1000,
        "spice": "Medium",
        "health": "Both",
    }
    before = client.post("/api/recommendations", headers=headers, json=preferences)
    baseline_score = next(item["match"] for item in before.json() if item["id"] == 4)

    assert client.post("/api/events", headers=headers, json={
        "event_type": "search",
        "payload": {"query": "mango chia"},
    }).status_code == 201
    assert client.post("/api/events", headers=headers, json={
        "event_type": "view",
        "item_id": 4,
    }).status_code == 201

    after = client.post("/api/recommendations", headers=headers, json=preferences)
    updated_score = next(item["match"] for item in after.json() if item["id"] == 4)
    assert updated_score > baseline_score