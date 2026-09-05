from pathlib import Path

import joblib
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

ROOT = Path(__file__).resolve().parent
DATASET = ROOT / "dataset" / "training.csv"
ARTIFACT = ROOT.parent / "backend" / "recommendation_model.joblib"


def train() -> None:
    frame = pd.read_csv(DATASET)
    target = frame.pop("match")
    categorical = ["cuisine", "diet", "spice", "health"]
    numeric = ["price", "rating", "veg"]
    preprocessor = ColumnTransformer([
        ("categorical", OneHotEncoder(handle_unknown="ignore"), categorical),
        ("numeric", StandardScaler(), numeric),
    ])
    model = Pipeline([
        ("features", preprocessor),
        ("regressor", RandomForestRegressor(n_estimators=160, random_state=42, min_samples_leaf=1)),
    ])
    model.fit(frame, target)
    joblib.dump(model, ARTIFACT)
    print(f"Saved trained recommendation model to {ARTIFACT}")


if __name__ == "__main__":
    train()
