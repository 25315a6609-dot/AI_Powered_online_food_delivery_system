# FoodFusion AI

A full-stack AI-powered food delivery MVP: personalized discovery, smart search, restaurant comparison, favorites, quantity cart, checkout, order tracking, reviews, authentication, and provider-ready payments.

## 1. Local frontend

```powershell
cd "E:\ai powered online delivery system"
npm install
npm run dev
```

Open `http://localhost:5173`.

This standalone command is enough to use the complete browser demo. Recommendations, preferences, favorites, cart, checkout, mock payment, orders, tracking, reviews, location, and demo login work without starting FastAPI. Data is kept in browser storage.

The FastAPI service is optional. Start it only when you want PostgreSQL-backed accounts, the trained recommendation API, SMTP password reset, or real Stripe PaymentIntents.

## 2. Optional FastAPI backend

Set a development secret for the current PowerShell session:

```powershell
$env:FOODFUSION_AUTH_SECRET = "replace-this-with-a-long-random-development-secret"
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
uvicorn backend.main:app --reload --port 8000
```

The API provides recommendations, signup/login, `/api/auth/me`, password reset, Stripe PaymentIntent creation, and Stripe webhook verification.

## 3. Train the recommender

```powershell
.\.venv\Scripts\Activate.ps1
python ai\train.py
```

Install training dependencies first with `pip install -r ai\requirements.txt`. This creates `backend/recommendation_model.joblib`. The API loads it when present and uses the deterministic scorer only as a fallback. Use Python 3.12 for the training environment for the broadest package wheel support.

## 4. Local production-style Docker run

Create a `.env` from `.env.example`, replace every placeholder, then run:

```powershell
docker compose up --build
```

Frontend: `http://localhost:8080`
Backend: `http://localhost:8000`
Database: PostgreSQL inside the compose network.

## 5. Production deployment sequence

1. Provision managed PostgreSQL and copy its private `DATABASE_URL`.
2. Generate a secret with `python -c "import secrets; print(secrets.token_urlsafe(48))"` and set `FOODFUSION_AUTH_SECRET`.
3. Configure Stripe live keys and `STRIPE_WEBHOOK_SECRET` in the backend secret manager.
4. Configure SMTP credentials for password reset email.
5. Build/deploy the backend container and restrict CORS to the deployed frontend origin.
6. Build/deploy the frontend container with `VITE_API_URL` set to the HTTPS backend URL.
7. Register the Stripe webhook URL as `https://api.example.com/api/payments/webhook`.
8. Put both services behind a managed HTTPS reverse proxy such as Render, Fly.io, Railway, AWS ALB, or Nginx with Let's Encrypt certificates.
9. Run database backups, health checks, log collection, and dependency/security scans before accepting traffic.

HTTPS certificates and live provider credentials must be created in the deployment platform; they cannot be safely generated or stored in this repository.

## Validation

```powershell
python -m compileall backend
npm run lint
npm run build
docker compose config
```
