# ml_analytics.py
# ML/Analytics Layer for URL Shortener
# Covers: click prediction, anomaly/bot detection, NLP-based smart alias generation
#
# pip install scikit-learn numpy joblib spacy beautifulsoup4 requests
# python -m spacy download en_core_web_sm

import re
import os
import datetime
import logging
import urllib.parse
from collections import Counter

import numpy as np
import joblib
import requests as req
from bs4 import BeautifulSoup
from sklearn.ensemble import IsolationForest, RandomForestRegressor
from sklearn.preprocessing import LabelEncoder

try:
    import spacy
    nlp = spacy.load("en_core_web_sm")
    SPACY_AVAILABLE = True
except Exception:
    SPACY_AVAILABLE = False

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Paths for persisted models
# ---------------------------------------------------------------------------
CLICK_MODEL_PATH   = "models/click_predictor.joblib"
ENCODERS_PATH      = "models/label_encoders.joblib"
ANOMALY_MODEL_PATH = "models/anomaly_detector.joblib"

os.makedirs("models", exist_ok=True)


# ===========================================================================
# 1.  CLICK PREDICTION
# ===========================================================================

def _geo_summary(metadata: list) -> dict:
    """Return the most-common country and city from a list of click metadata."""
    countries = [m.get("country") or "Unknown" for m in metadata]
    cities    = [m.get("city")    or "Unknown" for m in metadata]
    return {
        "top_country": Counter(countries).most_common(1)[0][0] if countries else "Unknown",
        "top_city":    Counter(cities).most_common(1)[0][0]    if cities    else "Unknown",
    }


def _build_feature_vector(url_doc: dict, encoders: dict | None = None) -> np.ndarray:
    """
    Convert a URL document into a numeric feature vector.

    Features:
        hour_of_day   – hour the URL was created (0–23)
        day_of_week   – weekday of creation (0=Mon … 6=Sun)
        is_weekend    – binary flag
        country_enc   – label-encoded top visitor country
        city_enc      – label-encoded top visitor city
    """
    created_at  = url_doc.get("created_at", datetime.datetime.utcnow())
    geo         = _geo_summary(url_doc.get("metadata", []))

    hour_of_day = created_at.hour
    day_of_week = created_at.weekday()
    is_weekend  = int(day_of_week >= 5)

    if encoders:
        try:
            country_enc = int(encoders["country"].transform([geo["top_country"]])[0])
        except ValueError:
            country_enc = -1
        try:
            city_enc = int(encoders["city"].transform([geo["top_city"]])[0])
        except ValueError:
            city_enc = -1
    else:
        country_enc = hash(geo["top_country"]) % 1000
        city_enc    = hash(geo["top_city"])    % 1000

    return np.array([[hour_of_day, day_of_week, is_weekend, country_enc, city_enc]])


def train_click_predictor(url_docs: list) -> tuple:
    """
    Train a Random Forest regressor to predict future click counts.

    Call this once you have >= 10 URL documents with real click data,
    e.g. from a management script:

        from pymongo import MongoClient
        from ml_analytics import train_click_predictor
        db   = MongoClient(MONGO_URI).url_shortener
        docs = list(db.urls.find({"clicks": {"$gt": 0}}))
        train_click_predictor(docs)

    Args:
        url_docs: list of MongoDB URL documents (each needs 'clicks' and 'metadata')

    Returns:
        (model, encoders) — both saved to disk for predict_clicks() to load
    """
    if len(url_docs) < 10:
        logger.warning("[ClickPredictor] Need at least 10 samples. Skipping training.")
        return None, None

    all_countries = [m.get("country") or "Unknown"
                     for doc in url_docs for m in doc.get("metadata", [])]
    all_cities    = [m.get("city")    or "Unknown"
                     for doc in url_docs for m in doc.get("metadata", [])]

    enc_country = LabelEncoder().fit(all_countries or ["Unknown"])
    enc_city    = LabelEncoder().fit(all_cities    or ["Unknown"])
    encoders    = {"country": enc_country, "city": enc_city}

    X = np.vstack([_build_feature_vector(doc, encoders) for doc in url_docs])
    y = np.array([doc.get("clicks", 0) for doc in url_docs])

    model = RandomForestRegressor(n_estimators=100, random_state=42)
    model.fit(X, y)

    joblib.dump(model,    CLICK_MODEL_PATH)
    joblib.dump(encoders, ENCODERS_PATH)
    logger.info("[ClickPredictor] Trained on %d samples.", len(X))
    return model, encoders


def predict_clicks(url_doc: dict) -> float:
    """
    Predict expected future click count for a URL document.
    Returns -1.0 if the model has not been trained yet.
    """
    if not os.path.exists(CLICK_MODEL_PATH):
        return -1.0
    model    = joblib.load(CLICK_MODEL_PATH)
    encoders = joblib.load(ENCODERS_PATH) if os.path.exists(ENCODERS_PATH) else None
    return float(model.predict(_build_feature_vector(url_doc, encoders))[0])


# ===========================================================================
# 2.  ANOMALY / BOT DETECTION
# ===========================================================================

BURST_WINDOW_SECONDS    = 600   # 10-minute rolling window
BURST_CLICK_THRESHOLD   = 100   # clicks from one IP in that window = suspicious
ISOLATION_CONTAMINATION = 0.05  # assumed fraction of anomalous traffic in training set


def _is_burst_attack(metadata: list) -> bool:
    """
    Rule-based check: True if any single IP fires >= BURST_CLICK_THRESHOLD
    clicks within the last BURST_WINDOW_SECONDS seconds.
    """
    cutoff = datetime.datetime.utcnow() - datetime.timedelta(seconds=BURST_WINDOW_SECONDS)
    recent = [
        m for m in metadata
        if isinstance(m.get("timestamp"), datetime.datetime) and m["timestamp"] >= cutoff
    ]
    ip_counts = Counter(m.get("ip", "unknown") for m in recent)
    return any(count >= BURST_CLICK_THRESHOLD for count in ip_counts.values())


def train_anomaly_detector(click_vectors: list):
    """
    Train an Isolation Forest on per-URL traffic summary vectors.

    Each element of click_vectors should be a dict with:
        clicks_per_hour      float
        unique_ips           int
        top_country_share    float  (0.0–1.0)
        avg_click_hour       float  (0.0–23.0)

    Build these from your MongoDB docs:

        vectors = []
        for doc in db.urls.find({"clicks": {"$gt": 0}}):
            meta      = doc.get("metadata", [])
            ips       = [m.get("ip","x") for m in meta]
            hours     = [m["timestamp"].hour for m in meta if m.get("timestamp")]
            countries = [m.get("country","Unknown") for m in meta]
            age_h     = max((datetime.utcnow()-doc["created_at"]).total_seconds()/3600, 0.01)
            top_c     = Counter(countries).most_common(1)[0][1] if countries else 0
            vectors.append({
                "clicks_per_hour":   len(meta)/age_h,
                "unique_ips":        len(set(ips)),
                "top_country_share": top_c/max(len(meta),1),
                "avg_click_hour":    float(np.mean(hours)) if hours else 12.0,
            })
        train_anomaly_detector(vectors)
    """
    if len(click_vectors) < 20:
        logger.warning("[AnomalyDetector] Need at least 20 samples. Skipping.")
        return None

    X = np.array([
        [v.get("clicks_per_hour", 0),
         v.get("unique_ips", 1),
         v.get("top_country_share", 1.0),
         v.get("avg_click_hour", 12.0)]
        for v in click_vectors
    ])
    clf = IsolationForest(contamination=ISOLATION_CONTAMINATION, random_state=42)
    clf.fit(X)
    joblib.dump(clf, ANOMALY_MODEL_PATH)
    logger.info("[AnomalyDetector] Trained on %d samples.", len(X))
    return clf


def score_url_traffic(url_doc: dict) -> dict:
    """
    Analyse a URL document's traffic and return an anomaly verdict.

    Returns:
        {
            "is_suspicious": bool,
            "reason":        str,    # "ok" | "burst_attack" | "ml_anomaly"
            "score":         float   # lower = more anomalous (IsolationForest)
        }
    """
    metadata = url_doc.get("metadata", [])

    if _is_burst_attack(metadata):
        return {"is_suspicious": True, "reason": "burst_attack", "score": -1.0}

    if not metadata or not os.path.exists(ANOMALY_MODEL_PATH):
        return {"is_suspicious": False, "reason": "ok", "score": 1.0}

    ips       = [m.get("ip", "x") for m in metadata]
    hours     = [m["timestamp"].hour
                 for m in metadata if isinstance(m.get("timestamp"), datetime.datetime)]
    countries = [m.get("country") or "Unknown" for m in metadata]
    age_hours = max(
        (datetime.datetime.utcnow() - url_doc.get("created_at", datetime.datetime.utcnow())).total_seconds() / 3600,
        0.01
    )
    top_country_count = Counter(countries).most_common(1)[0][1] if countries else 0

    X     = np.array([[
        len(metadata) / age_hours,
        len(set(ips)),
        top_country_count / max(len(metadata), 1),
        float(np.mean(hours)) if hours else 12.0,
    ]])
    clf   = joblib.load(ANOMALY_MODEL_PATH)
    pred  = clf.predict(X)[0]
    score = float(clf.decision_function(X)[0])

    return {
        "is_suspicious": pred == -1,
        "reason":        "ml_anomaly" if pred == -1 else "ok",
        "score":         round(score, 4),
    }


# ===========================================================================
# 3.  NLP-BASED SMART ALIAS GENERATION
# ===========================================================================

STOPWORDS = {
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "is", "are", "was", "be", "this", "that",
    "it", "as", "into", "about", "http", "https", "www", "com", "org",
    "net", "io", "html", "php", "htm", "page", "home", "index", "default",
}

MAX_ALIAS_WORDS = 3
MAX_ALIAS_LEN   = 24


def _slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_]+", "-", text)
    return text


def _url_tokens(long_url: str) -> list:
    """Extract meaningful tokens directly from URL path + query string."""
    parsed = urllib.parse.urlparse(long_url)
    raw    = (parsed.path + " " + parsed.query).replace("/", " ").replace("-", " ").replace("_", " ")
    return [t.lower() for t in re.findall(r"[a-zA-Z]{3,}", raw) if t.lower() not in STOPWORDS]


def _page_text(long_url: str, timeout: int = 3) -> str:
    """Fetch page title + og:title + meta description from the destination URL."""
    try:
        resp = req.get(long_url, timeout=timeout, headers={"User-Agent": "Mozilla/5.0"})
        soup = BeautifulSoup(resp.text, "html.parser")
        parts = []
        if soup.title and soup.title.string:
            parts.append(soup.title.string)
        for attrs in [{"name": "description"}, {"property": "og:title"}]:
            tag = soup.find("meta", attrs=attrs)
            if tag:
                parts.append(tag.get("content", ""))
        return " ".join(parts)
    except Exception:
        return ""


def generate_smart_alias(long_url: str, fetch_page: bool = True) -> str:
    """
    Generate a human-readable, SEO-friendly short code from a URL.

    Strategy:
      1. Optionally HTTP-fetch the page title / og:title / meta description.
      2. Extract keywords via spaCy NER + noun chunks (if available),
         or simple token-frequency fallback.
      3. Pick up to MAX_ALIAS_WORDS keywords, slugify, truncate.

    Examples:
        "https://flask.palletsprojects.com/quickstart/" → "flask-quickstart"
        "https://docs.python.org/3/library/collections.html" → "python-collections"

    Args:
        long_url:   Destination URL.
        fetch_page: Set False in unit tests to skip the HTTP fetch.

    Returns:
        Slug string, e.g. "flask-auth-guide".
    """
    raw_text   = _page_text(long_url) if fetch_page else ""
    url_tokens = _url_tokens(long_url)

    if SPACY_AVAILABLE and raw_text:
        doc      = nlp(raw_text)
        kw_raw   = []
        for ent in doc.ents:
            kw_raw.extend(ent.text.lower().split())
        for chunk in doc.noun_chunks:
            kw_raw.append(chunk.root.text.lower())
        keywords = [w for w in kw_raw if w not in STOPWORDS and len(w) > 2]
    else:
        all_tokens = re.findall(r"[a-zA-Z]{3,}", raw_text.lower()) + url_tokens
        freq       = Counter(t for t in all_tokens if t not in STOPWORDS)
        keywords   = [w for w, _ in freq.most_common(10)]

    keywords = keywords or url_tokens

    if not keywords:
        import hashlib, base64
        return base64.urlsafe_b64encode(hashlib.md5(long_url.encode()).digest())[:6].decode()

    alias = "-".join(_slugify(w) for w in keywords[:MAX_ALIAS_WORDS])
    alias = re.sub(r"-+", "-", alias).strip("-")
    return alias[:MAX_ALIAS_LEN] or "link"


# ===========================================================================
# 4.  COMBINED ANALYTICS REPORT  (used by /analytics/<short_code>)
# ===========================================================================

def full_analytics_report(url_doc: dict) -> dict:
    """
    Return a complete ML analytics snapshot for a URL document.
    Attach directly to the /analytics/<short_code> JSON response.
    """
    metadata  = url_doc.get("metadata", [])
    countries = [m.get("country") or "Unknown" for m in metadata]
    cities    = [m.get("city")    or "Unknown" for m in metadata]
    hours     = [
        m["timestamp"].hour
        for m in metadata
        if isinstance(m.get("timestamp"), datetime.datetime)
    ]

    predicted = predict_clicks(url_doc)

    return {
        "predicted_clicks":    round(predicted, 2) if predicted >= 0 else "model_not_trained",
        "traffic_anomaly":     score_url_traffic(url_doc),
        "top_countries":       dict(Counter(countries).most_common(10)),
        "top_cities":          dict(Counter(cities).most_common(10)),
        "hourly_distribution": {str(h): c for h, c in sorted(Counter(hours).items())},
        "total_clicks":        url_doc.get("clicks", 0),
    }
