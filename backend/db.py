import os
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, JSON, String, Text, UniqueConstraint, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./foodfusion.db")
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    reset_token_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    reset_token_expires: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class Restaurant(Base):
    __tablename__ = "restaurants"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    cuisine: Mapped[str] = mapped_column(String(200))
    rating: Mapped[float] = mapped_column(Float, default=0)
    delivery_minutes: Mapped[int] = mapped_column(Integer, default=30)
    delivery_fee: Mapped[int] = mapped_column(Integer, default=0)
    distance: Mapped[str] = mapped_column(String(40), default="")
    image: Mapped[str] = mapped_column(String(1000), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    location: Mapped[str] = mapped_column(String(120), default="")
    price_range: Mapped[str] = mapped_column(String(40), default="₹₹")
    available: Mapped[bool] = mapped_column(Boolean, default=True)


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80), unique=True, index=True)


class FoodItem(Base):
    __tablename__ = "food_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    restaurant_id: Mapped[int] = mapped_column(ForeignKey("restaurants.id"), index=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"), index=True)
    name: Mapped[str] = mapped_column(String(160), index=True)
    cuisine: Mapped[str] = mapped_column(String(80), index=True)
    price: Mapped[int] = mapped_column(Integer)
    rating: Mapped[float] = mapped_column(Float, default=0)
    time: Mapped[int] = mapped_column(Integer, default=30)
    veg: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    vegan: Mapped[bool] = mapped_column(Boolean, default=False)
    healthy: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    spice: Mapped[str] = mapped_column(String(20), default="Medium", index=True)
    meal: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    ingredients: Mapped[list] = mapped_column(JSON, default=list)
    image: Mapped[str] = mapped_column(String(1000), default="")
    available: Mapped[bool] = mapped_column(Boolean, default=True, index=True)


class UserPreference(Base):
    __tablename__ = "user_preferences"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class Favorite(Base):
    __tablename__ = "favorites"
    __table_args__ = (UniqueConstraint("user_id", "item_type", "item_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    item_type: Mapped[str] = mapped_column(String(20))
    item_id: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class CartItem(Base):
    __tablename__ = "cart_items"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    item_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    quantity: Mapped[int] = mapped_column(Integer)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class BehaviorEvent(Base):
    __tablename__ = "behavior_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    event_type: Mapped[str] = mapped_column(String(32), index=True)
    item_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    items_snapshot: Mapped[list] = mapped_column("items", JSON, default=list, nullable=False)
    items: Mapped[list["OrderItem"]] = relationship(back_populates="order", cascade="all, delete-orphan")
    total: Mapped[int] = mapped_column(Integer)
    address: Mapped[str] = mapped_column(String(500))
    location: Mapped[str] = mapped_column(String(120))
    payment_method: Mapped[str] = mapped_column(String(40))
    payment_status: Mapped[str] = mapped_column(String(24), default="not_required")
    status: Mapped[str] = mapped_column(String(32), default="confirmed")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    food_item_id: Mapped[int] = mapped_column(ForeignKey("food_items.id"), index=True)
    name: Mapped[str] = mapped_column(String(160))
    restaurant_name: Mapped[str] = mapped_column(String(120))
    unit_price: Mapped[int] = mapped_column(Integer)
    quantity: Mapped[int] = mapped_column(Integer)
    order: Mapped[Order] = relationship(back_populates="items")


class Review(Base):
    __tablename__ = "reviews"
    __table_args__ = (UniqueConstraint("order_id", "item_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    item_id: Mapped[int] = mapped_column(Integer)
    rating: Mapped[int] = mapped_column(Integer)
    comment: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    from backend.catalog import FOODS, RESTAURANTS, RESTAURANT_ID_BY_NAME

    with SessionLocal() as session:
        for restaurant in RESTAURANTS:
            if session.get(Restaurant, restaurant["id"]) is None:
                session.add(Restaurant(
                    id=restaurant["id"],
                    name=restaurant["name"],
                    cuisine=restaurant["cuisine"],
                    rating=restaurant["rating"],
                    delivery_minutes=restaurant["delivery"],
                    delivery_fee=restaurant["fee"],
                    distance=restaurant["distance"],
                    image=restaurant.get("image", ""),
                    description=restaurant["description"],
                    location=restaurant["location"],
                ))
        for food in FOODS:
            category = session.scalar(select(Category).where(Category.name == food["category"]))
            if category is None:
                category = Category(name=food["category"])
                session.add(category)
                session.flush()
            if session.get(FoodItem, food["id"]) is None:
                session.add(FoodItem(
                    id=food["id"],
                    restaurant_id=RESTAURANT_ID_BY_NAME[food["restaurant"]],
                    category_id=category.id,
                    name=food["name"],
                    cuisine=food["cuisine"],
                    price=food["price"],
                    rating=food["rating"],
                    time=food["time"],
                    veg=food["veg"],
                    vegan=food["vegan"],
                    healthy=food["healthy"],
                    spice=food["spice"],
                    meal=food.get("meal"),
                    ingredients=food.get("ingredients", []),
                    image=food.get("image", ""),
                ))
        session.commit()
