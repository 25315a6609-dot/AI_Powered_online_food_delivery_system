import base64
import hashlib
import hmac
import os
import secrets
import smtplib
from email.message import EmailMessage
import time
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select

from backend.db import SessionLocal, User, init_db
from backend.ml import predict_match

app = FastAPI(title="FoodFusion AI API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.getenv("FOODFUSION_CORS_ORIGINS", "http://localhost:5173").split(",") if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
security = HTTPBearer(auto_error=False)
auth_secret = os.getenv("FOODFUSION_AUTH_SECRET")
if not auth_secret:
    raise RuntimeError("FOODFUSION_AUTH_SECRET must be set")
init_db()


def password_hash(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 310_000)
    return f"{base64.urlsafe_b64encode(salt).decode()}${base64.urlsafe_b64encode(digest).decode()}"


def password_matches(password: str, stored: str) -> bool:
    salt_text, digest_text = stored.split("$", 1)
    expected = password_hash(password, base64.urlsafe_b64decode(salt_text)).split("$", 1)[1]
    return hmac.compare_digest(expected, digest_text)


def token_for(user_id: int) -> str:
    payload = f"{user_id}:{int(time.time()) + 60 * 60 * 24 * 7}"
    signature = hmac.new(auth_secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return base64.urlsafe_b64encode(f"{payload}:{signature}".encode()).decode()


def current_user(credentials: HTTPAuthorizationCredentials | None = Depends(security)) -> User:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    try:
        payload = base64.urlsafe_b64decode(credentials.credentials.encode()).decode()
        user_id_text, expiry_text, signature = payload.split(":", 2)
        unsigned = f"{user_id_text}:{expiry_text}"
        valid = hmac.compare_digest(signature, hmac.new(auth_secret.encode(), unsigned.encode(), hashlib.sha256).hexdigest())
        if not valid or int(expiry_text) < int(time.time()):
            raise ValueError
        user_id = int(user_id_text)
    except (ValueError, TypeError, UnicodeDecodeError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session")
    with SessionLocal() as session:
        user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account not found")
    return user


class RecommendationRequest(BaseModel):
    cuisine: list[str] = Field(default_factory=list)
    diet: Literal["Vegetarian", "Everything", "Vegan"] = "Everything"
    max_budget: int = Field(default=500, ge=0)
    spice: Literal["Mild", "Medium", "Spicy"] = "Medium"
    health: Literal["Healthy", "Regular", "Both"] = "Both"


class FoodRecommendation(BaseModel):
    id: int
    name: str
    cuisine: str
    price: int
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


FOODS = [
    {"id": 1, "name": "Smoky Paneer Tikka Bowl", "cuisine": "Indian", "price": 289, "veg": True, "healthy": True, "spice": "Medium", "rating": 4.8},
    {"id": 2, "name": "Crispy Chili Chicken", "cuisine": "Chinese", "price": 319, "veg": False, "healthy": False, "spice": "Spicy", "rating": 4.7},
    {"id": 3, "name": "Truffle Mushroom Melt", "cuisine": "Italian", "price": 349, "veg": True, "healthy": False, "spice": "Mild", "rating": 4.6},
    {"id": 4, "name": "Mango Chia Cloud", "cuisine": "Continental", "price": 229, "veg": True, "healthy": True, "spice": "Mild", "rating": 4.9},
]


def score(food: dict, preferences: RecommendationRequest) -> FoodRecommendation:
    value = 58
    reasons: list[str] = []
    if food["cuisine"] in preferences.cuisine:
        value += 14
        reasons.append(f"Matches {food['cuisine']} cuisine")
    if preferences.diet == "Everything" or (preferences.diet in ("Vegetarian", "Vegan") and food["veg"]):
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
    model_match = predict_match(food, preferences)
    return FoodRecommendation(id=food["id"], name=food["name"], cuisine=food["cuisine"], price=food["price"], match=model_match or min(99, max(52, value)), reasons=reasons[:4])


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "foodfusion-ai"}


@app.post("/api/recommendations", response_model=list[FoodRecommendation])
def recommendations(preferences: RecommendationRequest) -> list[FoodRecommendation]:
    return sorted((score(food, preferences) for food in FOODS), key=lambda item: item.match, reverse=True)


@app.post("/api/auth/signup", response_model=AuthResponse)
def signup(request: AuthRequest) -> AuthResponse:
    with SessionLocal() as session:
        if session.scalar(select(User).where(User.email == request.email.lower())):
            raise HTTPException(status_code=409, detail="An account with this email already exists")
        user = User(name=request.name, email=request.email.lower(), password_hash=password_hash(request.password))
        session.add(user)
        session.commit()
        session.refresh(user)
        user_id = user.id
    return AuthResponse(access_token=token_for(user_id), user={"id": user_id, "name": request.name, "email": request.email.lower()})


@app.post("/api/auth/login", response_model=AuthResponse)
def login(request: AuthRequest) -> AuthResponse:
    with SessionLocal() as session:
        user = session.scalar(select(User).where(User.email == request.email.lower()))
    if not user or not password_matches(request.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return AuthResponse(access_token=token_for(user.id), user={"id": user.id, "name": user.name, "email": user.email})


@app.get("/api/auth/me")
def me(user: User = Depends(current_user)) -> dict:
    return {"id": user.id, "name": user.name, "email": user.email, "created_at": user.created_at}


def send_reset_email(email: str, token: str) -> None:
    host = os.getenv("SMTP_HOST")
    username = os.getenv("SMTP_USERNAME")
    password = os.getenv("SMTP_PASSWORD")
    sender = os.getenv("SMTP_FROM", username)
    if not host or not username or not password or not sender:
        raise HTTPException(status_code=503, detail="SMTP is not configured")
    message = EmailMessage()
    message["Subject"] = "Reset your FoodFusion password"
    message["From"] = sender
    message["To"] = email
    message.set_content(f"Reset your password using this token: {token}")
    with smtplib.SMTP_SSL(host, int(os.getenv("SMTP_PORT", "465"))) as smtp:
        smtp.login(username, password)
        smtp.send_message(message)


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
def create_payment_intent(request: PaymentRequest, user: sqlite3.Row = Depends(current_user)) -> dict:
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
