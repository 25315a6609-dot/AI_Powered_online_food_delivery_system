import base64
import hashlib
import hmac
import os
import re
import secrets
import smtplib
from email.message import EmailMessage
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, or_, select, text
from sqlalchemy.exc import IntegrityError

from backend.auth import current_user, optional_user, token_for
from backend.db import BehaviorEvent, Category, FoodItem, Restaurant, SessionLocal, User, init_db
from backend.ml import predict_match
from backend.routes.customer import router as customer_router

app = FastAPI(title="FoodFusion AI API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.getenv("FOODFUSION_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(customer_router)
init_db()


def password_hash(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 310_000)
    return f"{base64.urlsafe_b64encode(salt).decode()}${base64.urlsafe_b64encode(digest).decode()}"


def password_matches(password: str, stored: str) -> bool:
    salt_text, digest_text = stored.split("$", 1)
    expected = password_hash(password, base64.urlsafe_b64decode(salt_text)).split("$", 1)[1]
    return hmac.compare_digest(expected, digest_text)


class RecommendationRequest(BaseModel):
    cuisine: list[str] = Field(default_factory=list)
    categories: list[str] = Field(default_factory=list)
    meal: Literal["Breakfast", "Lunch", "Dinner", "Snacks"] = "Dinner"
    avoid: str = Field(default="", max_length=300)
    diet: Literal["Vegetarian", "Everything", "Vegan"] = "Everything"
    min_budget: int = Field(default=0, ge=0)
    max_budget: int = Field(default=500, ge=0)
    spice: Literal["Mild", "Medium", "Spicy"] = "Medium"
    health: Literal["Healthy", "Regular", "Both"] = "Both"
    query: str = Field(default="", max_length=200)


class FoodRecommendation(BaseModel):
    id: int
    name: str
    cuisine: str
    restaurant: str
    price: int
    rating: float
    time: int
    match: int
    reasons: list[str]


class AuthRequest(BaseModel):
    name: str = Field(default="FoodFusion friend", min_length=2, max_length=80)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


class PaymentRequest(BaseModel):
    amount: int = Field(gt=0)
    currency: str = "inr"


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=32)
    password: str = Field(min_length=8, max_length=128)


def score(
    food: dict,
    preferences: RecommendationRequest,
    behavior_signal: int = 0,
) -> FoodRecommendation:
    value = 58
    reasons: list[str] = []
    if food["cuisine"] in preferences.cuisine:
        value += 14
        reasons.append(f"Matches {food['cuisine']} cuisine")
    if food["category"] in preferences.categories:
        value += 10
        reasons.append(f"Matches {food['category']} category")
    if food.get("meal") == preferences.meal:
        value += 5
        reasons.append(f"Fits your {preferences.meal.lower()} preference")
    if preferences.diet == "Everything" or (preferences.diet == "Vegetarian" and food["veg"]) or (preferences.diet == "Vegan" and food["vegan"]):
        value += 12
        reasons.append("Matches your diet")
    if food["price"] <= preferences.max_budget:
        value += 8
        reasons.append(f"Within ₹{preferences.max_budget}")
    if food["spice"] == preferences.spice:
        value += 6
        reasons.append(f"Matches {preferences.spice.lower()} spice")
    if preferences.health == "Both" or (preferences.health == "Healthy" and food["healthy"]) or (preferences.health == "Regular" and not food["healthy"]):
        value += 8
        reasons.append("Matches your health preference")
    value += round((food["rating"] - 4) * 8)
    value += behavior_signal
    if behavior_signal:
        reasons.append("Learns from your saves, orders, and reviews")
    model_match = predict_match(food, preferences)
    rule_match = min(99, max(35, value))
    combined_match = round((rule_match + model_match) / 2) if model_match is not None else rule_match
    return FoodRecommendation(
        id=food["id"],
        name=food["name"],
        cuisine=food["cuisine"],
        restaurant=food["restaurant"],
        price=food["price"],
        rating=food["rating"],
        time=food["time"],
        match=min(99, max(35, combined_match)),
        reasons=(reasons[:3] + ["Learns from your saves, orders, and reviews"])
        if behavior_signal
        else reasons[:4],
    )


def matches_request(food: dict, preferences: RecommendationRequest) -> bool:
    if not preferences.min_budget <= food["price"] <= preferences.max_budget:
        return False
    if preferences.diet == "Vegetarian" and not food["veg"]:
        return False
    if preferences.diet == "Vegan" and not food["vegan"]:
        return False
    if preferences.health == "Healthy" and not food["healthy"]:
        return False
    if preferences.health == "Regular" and food["healthy"]:
        return False
    excluded = [term.strip().lower() for term in re.split(r"[;,]", preferences.avoid) if term.strip()]
    if any(
        excluded_term in ingredient.lower()
        for excluded_term in excluded
        for ingredient in food.get("ingredients", [])
    ):
        return False
    query = preferences.query.lower()
    budget = re.search(r"(?:under|below|less than)\s*₹?\s*(\d+)", query)
    if budget and food["price"] > int(budget.group(1)):
        return False
    if "spicy" in query and food["spice"] != "Spicy":
        return False
    if "healthy" in query and not food["healthy"]:
        return False
    if "non-vegetarian" in query or "non vegetarian" in query:
        if food["veg"]:
            return False
    elif "vegetarian" in query and not food["veg"]:
        return False
    if "vegan" in query and not food["vegan"]:
        return False
    if ("fast" in query or "quick" in query) and food["time"] > 25:
        return False
    terms = re.sub(r"(?:under|below|less than)\s*₹?\s*\d+|₹\s*\d+|spicy|healthy|non[- ]vegetarian|vegetarian|vegan|fast|quick|cheap", " ", query)
    keywords = [term for term in re.findall(r"[a-z]+", terms) if term not in {"food", "dish", "please", "show", "me", "find", "some", "under"}]
    searchable = f"{food['name']} {food['restaurant']} {food['cuisine']} {food['category']}".lower()
    return all(keyword in searchable for keyword in keywords)


@app.get("/api/health")
def health() -> dict[str, str]:
    with SessionLocal() as session:
        session.execute(text("SELECT 1"))
    return {"status": "ok", "database": "connected", "service": "foodfusion-ai"}


def food_record(food: FoodItem, restaurant_name: str, category_name: str) -> dict:
    return {
        "id": food.id,
        "restaurant_id": food.restaurant_id,
        "name": food.name,
        "restaurant": restaurant_name,
        "cuisine": food.cuisine,
        "category": category_name,
        "price": food.price,
        "rating": food.rating,
        "time": food.time,
        "healthy": food.healthy,
        "veg": food.veg,
        "vegan": food.vegan,
        "spice": food.spice,
        "meal": food.meal,
        "ingredients": food.ingredients,
        "image": food.image,
        "available": food.available,
    }


@app.get("/api/catalog/categories")
def catalog_categories() -> list[dict]:
    with SessionLocal() as session:
        rows = session.execute(
            select(Category.name, func.count(FoodItem.id))
            .outerjoin(FoodItem, (FoodItem.category_id == Category.id) & FoodItem.available.is_(True))
            .group_by(Category.id, Category.name)
            .order_by(Category.name),
        ).all()
    return [{"name": name, "item_count": count} for name, count in rows]


@app.get("/api/catalog/foods")
def catalog_foods(
    query: str = Query(default="", max_length=200),
    category: str | None = None,
    cuisine: str | None = None,
    restaurant: str | None = None,
    vegetarian: bool | None = None,
    vegan: bool | None = None,
    healthy: bool | None = None,
    spice: Literal["Mild", "Medium", "Spicy"] | None = None,
    min_price: int = Query(default=0, ge=0),
    max_price: int = Query(default=10000, ge=0),
    min_rating: float = Query(default=0, ge=0, le=5),
    max_delivery_time: int = Query(default=240, ge=1, le=1440),
    sort: Literal["relevance", "rating", "price_low", "price_high", "fastest"] = "relevance",
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> list[dict]:
    normalized_query = query.lower()
    budget_match = re.search(r"(?:under|below|less than)\s*₹?\s*(\d+)", normalized_query)
    explicit_rupee_match = re.search(r"₹\s*(\d+)", normalized_query)
    query_budget = int(budget_match.group(1)) if budget_match else int(explicit_rupee_match.group(1)) if explicit_rupee_match else None
    if query_budget is not None:
        max_price = min(max_price, query_budget)
    if "vegan" in normalized_query:
        vegan = True
    elif "vegetarian" in normalized_query and "non-vegetarian" not in normalized_query:
        vegetarian = True
    if "spicy" in normalized_query and spice is None:
        spice = "Spicy"
    if healthy is None and "healthy" in normalized_query:
        healthy = True
    if "non-vegetarian" in normalized_query or "non vegetarian" in normalized_query:
        vegetarian = False
    if "quick" in normalized_query or "fast" in normalized_query:
        max_delivery_time = min(max_delivery_time, 25)
    statement = (
        select(FoodItem, Restaurant.name, Category.name)
        .join(Restaurant, FoodItem.restaurant_id == Restaurant.id)
        .join(Category, FoodItem.category_id == Category.id)
        .where(
            FoodItem.available.is_(True),
            Restaurant.available.is_(True),
            FoodItem.price >= min_price,
            FoodItem.price <= max_price,
            FoodItem.rating >= min_rating,
            Restaurant.delivery_minutes <= max_delivery_time,
        )
    )
    if category:
        statement = statement.where(Category.name.ilike(category))
    if cuisine:
        statement = statement.where(FoodItem.cuisine.ilike(f"%{cuisine}%"))
    if restaurant:
        statement = statement.where(Restaurant.name.ilike(f"%{restaurant}%"))
    if vegetarian is not None:
        statement = statement.where(FoodItem.veg.is_(vegetarian))
    if vegan is not None:
        statement = statement.where(FoodItem.vegan.is_(vegan))
    if healthy is not None:
        statement = statement.where(FoodItem.healthy.is_(healthy))
    if spice:
        statement = statement.where(FoodItem.spice == spice)
    searchable_query = re.sub(
        r"(?:under|below|less than)\s*₹?\s*\d+|₹\s*\d+|spicy|healthy|vegetarian|vegan|fast|quick|cheap|non[- ]vegetarian|show|me|food|dishes?",
        " ",
        normalized_query,
    )
    query_terms = [term for term in re.findall(r"[a-z]+", searchable_query) if len(term) > 1]
    for term in query_terms:
        pattern = f"%{term}%"
        statement = statement.where(or_(
            FoodItem.name.ilike(pattern),
            Restaurant.name.ilike(pattern),
            FoodItem.cuisine.ilike(pattern),
            Category.name.ilike(pattern),
        ))
    if sort == "rating":
        statement = statement.order_by(FoodItem.rating.desc(), FoodItem.id)
    elif sort == "price_low":
        statement = statement.order_by(FoodItem.price, FoodItem.id)
    elif sort == "price_high":
        statement = statement.order_by(FoodItem.price.desc(), FoodItem.id)
    elif sort == "fastest":
        statement = statement.order_by(FoodItem.time, FoodItem.id)
    else:
        statement = statement.order_by(FoodItem.rating.desc(), FoodItem.id)
    with SessionLocal() as session:
        rows = session.execute(statement.offset(offset).limit(limit)).all()
    return [food_record(food, restaurant_name, category_name) for food, restaurant_name, category_name in rows]


@app.get("/api/catalog/restaurants")
def catalog_restaurants() -> list[dict]:
    with SessionLocal() as session:
        rows = session.scalars(select(Restaurant).where(Restaurant.available.is_(True)).order_by(Restaurant.name)).all()
        menus = dict(session.execute(
            select(FoodItem.restaurant_id, func.count(FoodItem.id))
            .where(FoodItem.available.is_(True))
            .group_by(FoodItem.restaurant_id),
        ).all())
    return [{
        "id": restaurant.id,
        "name": restaurant.name,
        "cuisine": restaurant.cuisine,
        "rating": restaurant.rating,
        "delivery": restaurant.delivery_minutes,
        "fee": restaurant.delivery_fee,
        "distance": restaurant.distance,
        "image": restaurant.image,
        "description": restaurant.description,
        "location": restaurant.location,
        "price_range": restaurant.price_range,
        "available": restaurant.available,
        "menu_count": menus.get(restaurant.id, 0),
    } for restaurant in rows]


@app.get("/api/catalog/restaurants/{restaurant_id}/menu")
def restaurant_menu(restaurant_id: int) -> dict:
    with SessionLocal() as session:
        restaurant = session.get(Restaurant, restaurant_id)
        if not restaurant or not restaurant.available:
            raise HTTPException(status_code=404, detail="Restaurant not found")
        rows = session.execute(
            select(FoodItem, Category.name)
            .join(Category, FoodItem.category_id == Category.id)
            .where(FoodItem.restaurant_id == restaurant_id, FoodItem.available.is_(True))
            .order_by(Category.name, FoodItem.name),
        ).all()
        profile = {
            "id": restaurant.id,
            "name": restaurant.name,
            "cuisine": restaurant.cuisine,
            "rating": restaurant.rating,
            "delivery": restaurant.delivery_minutes,
            "fee": restaurant.delivery_fee,
            "distance": restaurant.distance,
            "image": restaurant.image,
            "description": restaurant.description,
            "location": restaurant.location,
            "price_range": restaurant.price_range,
            "available": restaurant.available,
        }
    return {"restaurant": profile, "menu": [food_record(food, profile["name"], category) for food, category in rows]}


@app.post("/api/recommendations", response_model=list[FoodRecommendation])
def recommendations(
    preferences: RecommendationRequest,
    user: User | None = Depends(optional_user),
) -> list[FoodRecommendation]:
    signals: dict[int, int] = {}
    recent_searches: list[str] = []
    saved_restaurants: set[int] = set()
    with SessionLocal() as session:
        if user:
            events = session.scalars(
                select(BehaviorEvent)
                .where(BehaviorEvent.user_id == user.id)
                .order_by(BehaviorEvent.created_at.desc())
                .limit(200),
            ).all()
            food_ids = set(session.scalars(select(FoodItem.id)).all())
            for event in events:
                if event.event_type == "search":
                    search_text = event.payload.get("query", "")
                    if isinstance(search_text, str) and search_text.strip():
                        recent_searches.append(search_text.lower())
                    continue
                if event.event_type == "save" and event.payload.get("item_type") == "restaurant":
                    if event.item_id is not None:
                        saved_restaurants.add(event.item_id)
                    continue
                if event.item_id not in food_ids:
                    continue
                if event.event_type in {"save", "add_to_cart", "order"}:
                    signals[event.item_id] = signals.get(event.item_id, 0) + 3
                elif event.event_type in {"view", "recommendation_click"}:
                    signals[event.item_id] = signals.get(event.item_id, 0) + 2
                elif event.event_type == "review":
                    rating = event.payload.get("rating", 3)
                    signals[event.item_id] = signals.get(event.item_id, 0) + (4 if rating >= 4 else -5 if rating <= 2 else 0)
        rows = session.execute(
            select(FoodItem, Restaurant.name, Category.name)
            .join(Restaurant, FoodItem.restaurant_id == Restaurant.id)
            .join(Category, FoodItem.category_id == Category.id)
            .where(FoodItem.available.is_(True), Restaurant.available.is_(True)),
        ).all()
    eligible = (
        food_record(food, restaurant_name, category_name)
        for food, restaurant_name, category_name in rows
        if matches_request(food_record(food, restaurant_name, category_name), preferences)
    )
    ranked = []
    for food in eligible:
        searchable = f"{food['name']} {food['restaurant']} {food['cuisine']} {food['category']}".lower()
        search_signal = min(6, sum(
            1 for search in recent_searches
            if any(term in searchable for term in search.split() if len(term) > 2)
        ))
        restaurant_signal = 2 if food["restaurant_id"] in saved_restaurants else 0
        behavior_signal = max(-12, min(12, signals.get(food["id"], 0) + search_signal + restaurant_signal))
        ranked.append(score(food, preferences, behavior_signal))
    return sorted(ranked, key=lambda item: item.match, reverse=True)


@app.post("/api/auth/signup", response_model=AuthResponse)
def signup(request: AuthRequest) -> AuthResponse:
    email = request.email.lower()
    with SessionLocal() as session:
        if session.scalar(select(User).where(User.email == email)):
            raise HTTPException(status_code=409, detail="An account with this email already exists. Please log in.")
        user = User(name=request.name, email=email, password_hash=password_hash(request.password))
        session.add(user)
        try:
            session.commit()
        except IntegrityError as error:
            session.rollback()
            raise HTTPException(status_code=409, detail="An account with this email already exists. Please log in.") from error
        session.refresh(user)
        user_id = user.id
        user_data = {"id": user.id, "name": user.name, "email": user.email}
    return AuthResponse(access_token=token_for(user_id), user=user_data)


@app.post("/api/auth/login", response_model=AuthResponse)
def login(request: AuthRequest) -> AuthResponse:
    with SessionLocal() as session:
        user = session.scalar(select(User).where(User.email == request.email.lower()))
        if not user:
            raise HTTPException(status_code=401, detail="Account not found. Please sign up first.")
        if not password_matches(request.password, user.password_hash):
            raise HTTPException(status_code=401, detail="Incorrect password. Please try again.")
        user_id = user.id
        user_data = {"id": user.id, "name": user.name, "email": user.email}
    return AuthResponse(access_token=token_for(user_id), user=user_data)


@app.get("/api/auth/me")
def me(user: User = Depends(current_user)) -> dict:
    return {"id": user.id, "name": user.name, "email": user.email, "created_at": user.created_at}


def send_reset_email(email: str, token: str) -> None:
    deliver_email(email, "Reset your FoodFusion password", f"Reset your password using this token: {token}")


def deliver_email(email: str, subject: str, body: str) -> None:
    host = os.getenv("SMTP_HOST")
    username = os.getenv("SMTP_USERNAME")
    password = os.getenv("SMTP_PASSWORD")
    sender = os.getenv("SMTP_FROM", username)
    if not host or not username or not password or not sender:
        raise HTTPException(status_code=503, detail="SMTP is not configured")
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = sender
    message["To"] = email
    message.set_content(body)
    try:
        with smtplib.SMTP_SSL(host, int(os.getenv("SMTP_PORT", "465"))) as smtp:
            smtp.login(username, password)
            smtp.send_message(message)
    except (OSError, smtplib.SMTPException) as error:
        raise HTTPException(status_code=503, detail="Email delivery is unavailable. Please try again later.") from error


@app.post("/api/auth/forgot-password")
def forgot_password(request: ForgotPasswordRequest) -> dict[str, str]:
    with SessionLocal() as session:
        user = session.scalar(select(User).where(User.email == request.email.lower()))
        if user:
            token = secrets.token_urlsafe(32)
            user.reset_token_hash = hashlib.sha256(token.encode()).hexdigest()
            user.reset_token_expires = datetime.now(timezone.utc) + timedelta(minutes=30)
            session.commit()
            send_reset_email(user.email, token)
    return {"message": "If the account exists, a reset email has been sent"}


@app.post("/api/auth/reset-password")
def reset_password(request: ResetPasswordRequest) -> dict[str, str]:
    token_hash = hashlib.sha256(request.token.encode()).hexdigest()
    with SessionLocal() as session:
        user = session.scalar(select(User).where(User.reset_token_hash == token_hash))
        if not user or not user.reset_token_expires or user.reset_token_expires < datetime.now(timezone.utc):
            raise HTTPException(status_code=400, detail="Reset token is invalid or expired")
        user.password_hash = password_hash(request.password)
        user.reset_token_hash = None
        user.reset_token_expires = None
        session.commit()
    return {"message": "Password updated"}


@app.post("/api/payments/create-intent")
def create_payment_intent(request: PaymentRequest, user: User = Depends(current_user)) -> dict:
    stripe_key = os.getenv("STRIPE_SECRET_KEY")
    if not stripe_key:
        raise HTTPException(status_code=503, detail="Stripe is not configured")
    try:
        import stripe
        stripe.api_key = stripe_key
        intent = stripe.PaymentIntent.create(amount=request.amount, currency=request.currency, metadata={"user_id": str(user.id)})
        return {"client_secret": intent.client_secret, "payment_intent_id": intent.id}
    except ImportError:
        raise HTTPException(status_code=503, detail="Install the stripe package to enable payments")


@app.post("/api/payments/webhook")
async def payment_webhook(request: Request) -> dict[str, bool]:
    stripe_key = os.getenv("STRIPE_SECRET_KEY")
    webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET")
    if not stripe_key or not webhook_secret:
        raise HTTPException(status_code=503, detail="Stripe webhook is not configured")
    try:
        import stripe
    except ImportError:
        raise HTTPException(status_code=503, detail="Install the stripe package to enable payments")
    try:
        stripe.api_key = stripe_key
        event = stripe.Webhook.construct_event(await request.body(), request.headers.get("stripe-signature", ""), webhook_secret)
    except (ValueError, stripe.error.SignatureVerificationError):
        raise HTTPException(status_code=400, detail="Invalid Stripe webhook")
    if event["type"] == "payment_intent.succeeded":
        pass
    return {"received": True}
