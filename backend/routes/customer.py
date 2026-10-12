from datetime import datetime, timezone
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select

from backend.auth import current_user
from backend.db import BehaviorEvent, CartItem, Category, Favorite, FoodItem, Order, OrderItem, Restaurant, Review, SessionLocal, User, UserPreference

router = APIRouter(prefix="/api", tags=["customer"])


class PreferencesPayload(BaseModel):
    diet: Literal["Vegetarian", "Everything", "Vegan"] = "Vegetarian"
    cuisines: list[str] = Field(default_factory=list)
    categories: list[str] = Field(default_factory=list)
    min_budget: int = Field(default=100, ge=0, le=10000)
    max_budget: int = Field(default=500, ge=0, le=10000)
    spice: Literal["Mild", "Medium", "Spicy"] = "Medium"
    meal: Literal["Breakfast", "Lunch", "Dinner", "Snacks"] = "Dinner"
    health: Literal["Healthy", "Regular", "Both"] = "Both"
    avoid: str = Field(default="", max_length=300)


class BehaviorPayload(BaseModel):
    event_type: Literal["search", "view", "recommendation_click", "save", "unsave", "add_to_cart", "order", "review"]
    item_id: int | None = None
    payload: dict = Field(default_factory=dict)


class FavoritePayload(BaseModel):
    item_type: Literal["food", "restaurant"]
    item_id: int = Field(gt=0)


class CartLinePayload(BaseModel):
    id: int = Field(gt=0)
    quantity: int = Field(ge=1, le=20)


class CartPayload(BaseModel):
    items: list[CartLinePayload] = Field(max_length=30)


class OrderLinePayload(BaseModel):
    id: int = Field(gt=0)
    quantity: int = Field(ge=1, le=20)


class OrderPayload(BaseModel):
    items: list[OrderLinePayload] = Field(min_length=1, max_length=30)
    address: str = Field(min_length=5, max_length=500)
    location: str = Field(min_length=2, max_length=120)
    payment_method: Literal["Cash on delivery", "UPI", "Card"] = "Cash on delivery"


class OrderStatusPayload(BaseModel):
    stage: int = Field(ge=1, le=6)


class ReviewPayload(BaseModel):
    order_id: str
    item_id: int = Field(gt=0)
    rating: int = Field(ge=1, le=5)
    comment: str = Field(default="", max_length=1500)


def record_event(
    session,
    user_id: int,
    event_type: str,
    item_id: int | None = None,
    payload: dict | None = None,
) -> None:
    session.add(BehaviorEvent(
        user_id=user_id,
        event_type=event_type,
        item_id=item_id,
        payload=payload or {},
    ))


def serialize_order(order: Order) -> dict:
    return {
        "id": order.id,
        "items": [
            {
                "id": item.food_item_id,
                "name": item.name,
                "restaurant": item.restaurant_name,
                "price": item.unit_price,
                "quantity": item.quantity,
            }
            for item in order.items
        ],
        "total": order.total,
        "address": order.address,
        "location": order.location,
        "payment_method": order.payment_method,
        "payment_status": order.payment_status,
        "status": order.status,
        "created_at": order.created_at.isoformat(),
    }


@router.get("/preferences")
def get_preferences(user: User = Depends(current_user)) -> dict:
    with SessionLocal() as session:
        stored = session.get(UserPreference, user.id)
        return stored.data if stored else PreferencesPayload().model_dump()


@router.put("/preferences")
def save_preferences(
    preferences: PreferencesPayload,
    user: User = Depends(current_user),
) -> dict:
    data = preferences.model_dump()
    with SessionLocal() as session:
        stored = session.get(UserPreference, user.id)
        if stored:
            stored.data = data
            stored.updated_at = datetime.now(timezone.utc)
        else:
            session.add(UserPreference(user_id=user.id, data=data))
        session.commit()
    return data


@router.get("/favorites")
def get_favorites(user: User = Depends(current_user)) -> list[dict]:
    with SessionLocal() as session:
        saved = session.scalars(select(Favorite).where(Favorite.user_id == user.id)).all()
        return [{"item_type": item.item_type, "item_id": item.item_id} for item in saved]


@router.put("/favorites")
def add_favorite(
    favorite: FavoritePayload,
    user: User = Depends(current_user),
) -> dict[str, bool]:
    with SessionLocal() as session:
        if favorite.item_type == "food" and not session.get(FoodItem, favorite.item_id):
            raise HTTPException(status_code=404, detail="Dish not found")
        if favorite.item_type == "restaurant" and not session.get(Restaurant, favorite.item_id):
            raise HTTPException(status_code=404, detail="Restaurant not found")
        exists = session.scalar(select(Favorite).where(
            Favorite.user_id == user.id,
            Favorite.item_type == favorite.item_type,
            Favorite.item_id == favorite.item_id,
        ))
        if not exists:
            session.add(Favorite(user_id=user.id, item_type=favorite.item_type, item_id=favorite.item_id))
            record_event(session, user.id, "save", favorite.item_id, {"item_type": favorite.item_type})
            session.commit()
    return {"saved": True}


@router.delete("/favorites/{item_type}/{item_id}")
def remove_favorite(
    item_type: Literal["food", "restaurant"],
    item_id: int,
    user: User = Depends(current_user),
) -> dict[str, bool]:
    with SessionLocal() as session:
        saved = session.scalar(select(Favorite).where(
            Favorite.user_id == user.id,
            Favorite.item_type == item_type,
            Favorite.item_id == item_id,
        ))
        if saved:
            session.delete(saved)
            record_event(session, user.id, "unsave", item_id, {"item_type": item_type})
            session.commit()
    return {"saved": False}


@router.get("/cart")
def get_cart(user: User = Depends(current_user)) -> list[dict]:
    with SessionLocal() as session:
        rows = session.scalars(select(CartItem).where(CartItem.user_id == user.id)).all()
        food_ids = set(session.scalars(select(FoodItem.id)).all())
        return [
            {"id": row.item_id, "quantity": row.quantity}
            for row in rows
            if row.item_id in food_ids
        ]


@router.put("/cart")
def save_cart(payload: CartPayload, user: User = Depends(current_user)) -> list[dict]:
    item_ids = [item.id for item in payload.items]
    if len(item_ids) != len(set(item_ids)):
        raise HTTPException(status_code=400, detail="Each dish can appear only once in the cart")
    desired = {item.id: item.quantity for item in payload.items}
    with SessionLocal() as session:
        food_ids = set(session.scalars(select(FoodItem.id).where(FoodItem.id.in_(item_ids))).all())
        if len(food_ids) != len(item_ids):
            raise HTTPException(status_code=404, detail="A cart dish was not found")
        existing = session.scalars(select(CartItem).where(CartItem.user_id == user.id)).all()
        for row in existing:
            if row.item_id not in desired:
                session.delete(row)
            else:
                row.quantity = desired[row.item_id]
                row.updated_at = datetime.now(timezone.utc)
        existing_ids = {row.item_id for row in existing}
        for item_id, quantity in desired.items():
            if item_id not in existing_ids:
                session.add(CartItem(user_id=user.id, item_id=item_id, quantity=quantity))
        session.commit()
    return [{"id": item_id, "quantity": quantity} for item_id, quantity in desired.items()]


@router.post("/events", status_code=201)
def create_event(event: BehaviorPayload, user: User = Depends(current_user)) -> dict[str, bool]:
    with SessionLocal() as session:
        record_event(session, user.id, event.event_type, event.item_id, event.payload)
        session.commit()
    return {"recorded": True}


@router.get("/orders")
def get_orders(user: User = Depends(current_user)) -> list[dict]:
    with SessionLocal() as session:
        orders = session.scalars(
            select(Order).where(Order.user_id == user.id).order_by(Order.created_at.desc()),
        ).all()
        return [serialize_order(order) for order in orders]


@router.post("/orders", status_code=201)
def create_order(payload: OrderPayload, user: User = Depends(current_user)) -> dict:
    with SessionLocal() as session:
        order_items = []
        subtotal = 0
        for line in payload.items:
            row = session.execute(
                select(FoodItem, Restaurant.name)
                .join(Restaurant, FoodItem.restaurant_id == Restaurant.id)
                .where(FoodItem.id == line.id, FoodItem.available.is_(True), Restaurant.available.is_(True)),
            ).first()
            if not row:
                raise HTTPException(status_code=404, detail=f"Dish {line.id} not found")
            food, restaurant_name = row
            subtotal += food.price * line.quantity
            order_items.append({"id": line.id, "name": food.name, "price": food.price, "restaurant": restaurant_name, "quantity": line.quantity})
        delivery_fee = 0 if subtotal >= 500 else 39
        discount = int(subtotal * 0.1 + 0.5) if subtotal >= 800 else 0
        tax = int((subtotal - discount) * 0.05 + 0.5)
        order = Order(
            id=str(uuid4()),
            user_id=user.id,
            items_snapshot=order_items,
            items=[OrderItem(
                food_item_id=item["id"],
                name=item["name"],
                restaurant_name=item["restaurant"],
                unit_price=item["price"],
                quantity=item["quantity"],
            ) for item in order_items],
            total=subtotal + delivery_fee - discount + tax,
            address=payload.address.strip(),
            location=payload.location.strip(),
            payment_method=payload.payment_method,
            payment_status="not_required" if payload.payment_method == "Cash on delivery" else "pending",
            status="placed" if payload.payment_method == "Cash on delivery" else "awaiting_payment",
        )
        session.add(order)
        for item in order_items:
            record_event(session, user.id, "order", item["id"], {"order_id": order.id})
        for cart_item in session.scalars(select(CartItem).where(CartItem.user_id == user.id)).all():
            session.delete(cart_item)
        session.commit()
        session.refresh(order)
        return serialize_order(order)


@router.patch("/orders/{order_id}/status")
def advance_order(
    order_id: str,
    payload: OrderStatusPayload,
    user: User = Depends(current_user),
) -> dict:
    statuses = ["placed", "confirmed", "preparing", "ready_for_pickup", "out_for_delivery", "delivered"]
    with SessionLocal() as session:
        order = session.scalar(select(Order).where(Order.id == order_id, Order.user_id == user.id))
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        if order.payment_status == "pending":
            raise HTTPException(status_code=409, detail="Order is waiting for payment confirmation")
        current_stage = statuses.index(order.status) + 1 if order.status in statuses else 0
        if payload.stage != current_stage + 1:
            raise HTTPException(status_code=409, detail="Order status must advance one step at a time")
        order.status = statuses[payload.stage - 1]
        session.commit()
        session.refresh(order)
        return serialize_order(order)


@router.get("/reviews")
def get_reviews(user: User = Depends(current_user)) -> list[dict]:
    with SessionLocal() as session:
        reviews = session.scalars(select(Review).where(Review.user_id == user.id).order_by(Review.created_at.desc())).all()
        return [{"id": review.id, "order_id": review.order_id, "item_id": review.item_id, "rating": review.rating, "comment": review.comment, "created_at": review.created_at.isoformat()} for review in reviews]


@router.post("/reviews", status_code=201)
def create_review(payload: ReviewPayload, user: User = Depends(current_user)) -> dict:
    with SessionLocal() as session:
        order = session.scalar(select(Order).where(Order.id == payload.order_id, Order.user_id == user.id))
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        if order.status != "delivered":
            raise HTTPException(status_code=409, detail="Review after delivery is available")
        if not any(item.food_item_id == payload.item_id for item in order.items):
            raise HTTPException(status_code=400, detail="Dish was not part of this order")
        review = Review(order_id=order.id, user_id=user.id, item_id=payload.item_id, rating=payload.rating, comment=payload.comment.strip())
        session.add(review)
        record_event(session, user.id, "review", payload.item_id, {"rating": payload.rating})
        try:
            session.commit()
        except Exception as error:
            session.rollback()
            if "unique" in str(error).lower():
                raise HTTPException(status_code=409, detail="This dish already has a review for the order")
            raise
        session.refresh(review)
        return {"id": review.id, "order_id": review.order_id, "item_id": review.item_id, "rating": review.rating, "comment": review.comment, "created_at": review.created_at.isoformat()}