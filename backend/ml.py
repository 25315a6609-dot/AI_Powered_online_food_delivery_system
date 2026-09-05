from pathlib import Path

MODEL_PATH = Path(__file__).resolve().parent / "recommendation_model.joblib"
_model = None


def predict_match(food: dict, preferences: object) -> int | None:
    global _model
    if _model is None:
        if not MODEL_PATH.exists():
            return None
        try:
            import joblib
            _model = joblib.load(MODEL_PATH)
        except (ImportError, OSError):
            return None
    try:
        row = {
            "cuisine": food["cuisine"],
            "diet": preferences.diet,
            "price": food["price"],
            "spice": food["spice"],
            "health": "Healthy" if food["healthy"] else "Regular",
            "rating": food["rating"],
            "veg": int(food["veg"]),
        }
        return max(1, min(99, round(float(_model.predict([row])[0]))))
    except Exception:
        return None
