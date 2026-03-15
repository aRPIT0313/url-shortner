#!/usr/bin/env python3
# train_models.py
# Run this script once you have real click data in MongoDB to train both models.
#
# Usage:
#   python train_models.py
#
# The trained models are saved to  models/click_predictor.joblib
#                                  models/label_encoders.joblib
#                                  models/anomaly_detector.joblib
# Flask automatically loads them on the next request to /analytics/<code>.

import datetime
import numpy as np
from collections import Counter
from pymongo import MongoClient
from dotenv import load_dotenv
import os

load_dotenv()
MONGO_URI = os.getenv("MONGO_URI")
if not MONGO_URI:
    raise SystemExit("MONGO_URI not set in .env")

from ml_analytics import train_click_predictor, train_anomaly_detector

client = MongoClient(MONGO_URI)
db     = client.url_shortener

# ---------- Fetch URL documents with at least 1 click ----------
url_docs = list(db.urls.find({"clicks": {"$gt": 0}}))
print(f"Found {len(url_docs)} URL documents with clicks.")

# ---------- Train click predictor ----------
model, encoders = train_click_predictor(url_docs)
if model:
    print("Click predictor saved to models/click_predictor.joblib")

# ---------- Build traffic vectors for anomaly detector ----------
vectors = []
for doc in url_docs:
    meta      = doc.get("metadata", [])
    if not meta:
        continue
    ips       = [m.get("ip", "x") for m in meta]
    hours     = [m["timestamp"].hour
                 for m in meta if isinstance(m.get("timestamp"), datetime.datetime)]
    countries = [m.get("country") or "Unknown" for m in meta]
    age_h     = max(
        (datetime.datetime.utcnow() - doc.get("created_at", datetime.datetime.utcnow())).total_seconds() / 3600,
        0.01
    )
    top_c     = Counter(countries).most_common(1)[0][1] if countries else 0
    vectors.append({
        "clicks_per_hour":   len(meta) / age_h,
        "unique_ips":        len(set(ips)),
        "top_country_share": top_c / max(len(meta), 1),
        "avg_click_hour":    float(np.mean(hours)) if hours else 12.0,
    })

print(f"Built {len(vectors)} traffic vectors for anomaly detector.")
clf = train_anomaly_detector(vectors)
if clf:
    print("Anomaly detector saved to models/anomaly_detector.joblib")

print("\nDone. Restart Flask to pick up the new models.")
