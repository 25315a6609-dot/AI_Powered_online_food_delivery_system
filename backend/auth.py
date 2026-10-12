import base64
import hashlib
import hmac
import os
import time

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from backend.db import SessionLocal, User

auth_secret = os.getenv("FOODFUSION_AUTH_SECRET")
if not auth_secret:
    raise RuntimeError("FOODFUSION_AUTH_SECRET must be set")

security = HTTPBearer(auto_error=False)


def token_for(user_id: int) -> str:
    payload = f"{user_id}:{int(time.time()) + 60 * 60 * 24 * 7}"
    signature = hmac.new(auth_secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return base64.urlsafe_b64encode(f"{payload}:{signature}".encode()).decode()


def user_from_token(token: str) -> User:
    try:
        payload = base64.urlsafe_b64decode(token.encode()).decode()
        user_id_text, expiry_text, signature = payload.split(":", 2)
        unsigned = f"{user_id_text}:{expiry_text}"
        expected = hmac.new(auth_secret.encode(), unsigned.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected) or int(expiry_text) < int(time.time()):
            raise ValueError
        user_id = int(user_id_text)
    except (ValueError, TypeError, UnicodeDecodeError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session")
    with SessionLocal() as session:
        user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account not found")
    return user


def current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> User:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    return user_from_token(credentials.credentials)


def optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> User | None:
    if not credentials:
        return None
    if credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authorization scheme")
    return user_from_token(credentials.credentials)