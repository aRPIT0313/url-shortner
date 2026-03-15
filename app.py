from flask import Flask, request, jsonify, redirect
from flask_cors import CORS
from pymongo import MongoClient
from dotenv import load_dotenv
import os, hashlib, base64, datetime, requests, jwt, bcrypt
from functools import wraps
from apscheduler.schedulers.background import BackgroundScheduler

from bloom_qr import (
    build_bloom_filter,
    generate_qr_code,
    generate_qr_data_uri,
    make_qr_response,
)
from ml_analytics import (
    full_analytics_report,
    generate_smart_alias,
    score_url_traffic,
)

# ----------- Env -----------
load_dotenv()
MONGO_URI  = os.getenv("MONGO_URI")
SECRET_KEY = os.getenv("SECRET_KEY", "supersecretkey")
BASE_URL   = os.getenv("BASE_URL", "http://localhost:5000")

if not MONGO_URI:
    raise Exception("MONGO_URI not found in environment variables")

# ----------- App -----------
app = Flask(__name__)
CORS(app)

# ----------- MongoDB -----------
client           = MongoClient(MONGO_URI)
db               = client.url_shortener
urls_collection  = db.urls
users_collection = db.users

# ----------- Bloom Filter (seeded from MongoDB at startup) -----------
bloom = build_bloom_filter(redis_client=None, db=db)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_short_code(long_url: str) -> str:
    return base64.urlsafe_b64encode(
        hashlib.md5(long_url.encode()).digest()
    )[:6].decode()


def _serialize(doc: dict) -> dict:
    """Make a MongoDB document JSON-safe (handles ObjectId, datetime, bytes)."""
    from bson import ObjectId
    out = {}
    for k, v in doc.items():
        if k == "_id":
            out[k] = str(v)
        elif isinstance(v, datetime.datetime):
            out[k] = v.isoformat()
        elif isinstance(v, ObjectId):
            out[k] = str(v)
        elif isinstance(v, bytes):
            out[k] = v.decode("utf-8", errors="replace")
        elif isinstance(v, list):
            out[k] = [_serialize(i) if isinstance(i, dict) else i for i in v]
        else:
            out[k] = v
    return out

_cache={}

def redis_get(key):
    return _cache.get(key)


def redis_set(key, value, ex=None):
    _cache[key]=value


# ---------------------------------------------------------------------------
# Auth decorators
# ---------------------------------------------------------------------------

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get("Authorization", "")
        if not token:
            return jsonify({"error": "Token is missing"}), 401
        try:
            if token.startswith("Bearer "):
                token = token.split()[1]
            payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
            request.user_email = payload["email"]
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Token has expired"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "Invalid token"}), 401
        return f(*args, **kwargs)
    return decorated


def rate_limited(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        key   = f"rate:{request.user_email}:{datetime.date.today()}"
        count = redis_get(key)
        count = int(count) if count else 0
        if count >= 10:
            return jsonify({"error": "Daily URL shorten limit reached"}), 429
        redis_set(key, count + 1, ex=86400)
        return f(*args, **kwargs)
    return decorated


# ===========================================================================
# ROUTES
# ===========================================================================

@app.route("/")
def health_check():
    return jsonify({"status": "URL Shortener API is running"})


# ── Auth ────────────────────────────────────────────────────────────────────

@app.route("/user/register", methods=["POST"])
def register():
    data     = request.get_json()
    email    = data.get("email")
    password = data.get("password")
    if not email or not password:
        return jsonify({"error": "Email and password required"}), 400
    if users_collection.find_one({"email": email}):
        return jsonify({"error": "User already exists"}), 400
    hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt())
    users_collection.insert_one({"email": email, "password": hashed})
    return jsonify({"message": "User registered successfully"}), 201


@app.route("/user/login", methods=["POST"])
def login():
    data     = request.get_json()
    email    = data.get("email")
    password = data.get("password")
    if not email or not password:
        return jsonify({"error": "Email and password required"}), 400
    user = users_collection.find_one({"email": email})
    if not user or not bcrypt.checkpw(password.encode(), user["password"]):
        return jsonify({"error": "Invalid credentials"}), 401
    access_token = jwt.encode(
        {"email": email, "exp": datetime.datetime.utcnow() + datetime.timedelta(minutes=30)},
        SECRET_KEY, algorithm="HS256",
    )
    refresh_token = jwt.encode(
        {"email": email, "exp": datetime.datetime.utcnow() + datetime.timedelta(days=7)},
        SECRET_KEY, algorithm="HS256",
    )
    return jsonify({"access_token": access_token, "refresh_token": refresh_token})


@app.route("/user/refresh", methods=["POST"])
def refresh():
    token = (request.get_json() or {}).get("refresh_token")
    try:
        payload    = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        new_access = jwt.encode(
            {"email": payload["email"],
             "exp":   datetime.datetime.utcnow() + datetime.timedelta(minutes=30)},
            SECRET_KEY, algorithm="HS256",
        )
        return jsonify({"access_token": new_access})
    except jwt.ExpiredSignatureError:
        return jsonify({"error": "Refresh token expired"}), 401
    except jwt.InvalidTokenError:
        return jsonify({"error": "Invalid refresh token"}), 401


# ── Shorten URL ──────────────────────────────────────────────────────────────
#
# Request body (JSON):
#   long_url        string  required
#   alias           string  optional — custom short code
#   smart_alias     bool    optional — generate NLP alias from page title
#   expires_in_days int     optional
#   password        string  optional — protect the redirect
#
# Response (201):
#   short_url       string  — full redirect URL
#   short_code      string
#   qr_code         string  — base64 PNG
#   qr_data_uri     string  — data:image/png;base64,... (ready for <img src>)

@app.route("/shorten", methods=["POST"])
@token_required
@rate_limited
def shorten_url():
    data            = request.get_json() or {}
    long_url        = data.get("long_url", "").strip()
    custom_alias    = data.get("alias", "").strip()
    expires_in_days = data.get("expires_in_days")
    password        = data.get("password")
    smart_alias     = data.get("smart_alias", False)

    if not long_url:
        return jsonify({"error": "long_url is required"}), 400
    if not (long_url.startswith("http://") or long_url.startswith("https://")):
        return jsonify({"error": "long_url must start with http:// or https://"}), 400

    # ── Determine short code ────────────────────────────────────────────────
    if custom_alias:
        short_code = custom_alias
    elif smart_alias:
        # NLP: fetch page title, extract keywords, build a readable slug
        short_code = generate_smart_alias(long_url, fetch_page=True)
        # If the slug collides, append a 4-char hash suffix
        if bloom.exists(short_code) and urls_collection.find_one({"short_code": short_code}):
            suffix     = base64.urlsafe_b64encode(
                             hashlib.md5(long_url.encode()).digest()
                         )[:4].decode()
            short_code = f"{short_code}-{suffix}"
    else:
        short_code = _make_short_code(long_url)

    # ── Bloom filter collision check — O(1) ─────────────────────────────────
    # False  → definitely new, skip DB query entirely
    # True   → might exist, confirm with MongoDB (handles false positives)
    if bloom.exists(short_code):
        if urls_collection.find_one({"short_code": short_code}):
            return jsonify({"error": "Short code already exists. Use a custom alias."}), 400

    # ── Persist ─────────────────────────────────────────────────────────────
    hashed_pw  = bcrypt.hashpw(password.encode(), bcrypt.gensalt()) if password else None
    expires_at = (
        datetime.datetime.utcnow() + datetime.timedelta(days=int(expires_in_days))
        if expires_in_days else None
    )
    urls_collection.insert_one({
        "long_url":   long_url,
        "short_code": short_code,
        "created_at": datetime.datetime.utcnow(),
        "expires_at": expires_at,
        "clicks":     0,
        "metadata":   [],
        "created_by": request.user_email,
        "password":   hashed_pw,
        "flagged":    False,
    })
    bloom.add(short_code)   # register in the filter

    short_url = f"{BASE_URL}/r/{short_code}"

    return jsonify({
        "short_url":    short_url,
        "short_code":   short_code,
        "qr_code":      generate_qr_code(short_url, as_base64=True),
        "qr_data_uri":  generate_qr_data_uri(short_url),
    }), 201


# ── Redirect ─────────────────────────────────────────────────────────────────

@app.route("/r/<short_code>")
def redirect_url(short_code):
    # Bloom filter: definite miss → skip DB entirely
    if not bloom.exists(short_code):
        return jsonify({"error": "URL not found"}), 404

    # Redis cache hit
    cached = redis_get(short_code)
    if cached:
        _record_click(short_code, {})
        return redirect(cached.decode() if isinstance(cached, bytes) else cached)

    url_doc = urls_collection.find_one({"short_code": short_code})
    if not url_doc:
        return jsonify({"error": "URL not found"}), 404

    if url_doc.get("expires_at") and datetime.datetime.utcnow() > url_doc["expires_at"]:
        return jsonify({"error": "This URL has expired"}), 410

    if url_doc.get("flagged"):
        return jsonify({"error": "This URL has been flagged for suspicious activity"}), 403

    if url_doc.get("password"):
        pw = request.args.get("password", "")
        if not pw or not bcrypt.checkpw(pw.encode(), url_doc["password"]):
            return jsonify({"error": "Password required or incorrect"}), 401

    # Geo lookup
    user_ip  = request.remote_addr
    geo_info = {"ip": user_ip, "timestamp": datetime.datetime.utcnow()}
    try:
        resp = requests.get(f"https://ipapi.co/{user_ip}/json/", timeout=3).json()
        geo_info.update({
            "city":    resp.get("city"),
            "region":  resp.get("region"),
            "country": resp.get("country_name"),
        })
    except Exception:
        pass

    _record_click(short_code, geo_info)

    # Anomaly check — flag the URL if suspicious, but still redirect the user
    url_doc_fresh = urls_collection.find_one({"short_code": short_code})
    if url_doc_fresh:
        result = score_url_traffic(url_doc_fresh)
        if result["is_suspicious"]:
            urls_collection.update_one(
                {"short_code": short_code},
                {"$set": {"flagged": True, "flag_reason": result["reason"]}}
            )

    redis_set(short_code, url_doc["long_url"], ex=86400)
    return redirect(url_doc["long_url"])


def _record_click(short_code: str, geo_info: dict):
    urls_collection.update_one(
        {"short_code": short_code},
        {"$inc": {"clicks": 1}, "$push": {"metadata": geo_info}}
    )


# ── QR Code endpoint ─────────────────────────────────────────────────────────
#
# Returns the QR code as a PNG image stream.
# Usage in an <img> tag:   <img src="/qr/abc123">

@app.route("/qr/<short_code>")
def qr_endpoint(short_code):
    url_doc = urls_collection.find_one({"short_code": short_code})
    if not url_doc:
        return jsonify({"error": "URL not found"}), 404
    return make_qr_response(f"{BASE_URL}/r/{short_code}")


# ── Analytics (owner only) — now includes ML report ──────────────────────────

@app.route("/analytics/<short_code>")
@token_required
def analytics(short_code):
    url_doc = urls_collection.find_one({"short_code": short_code})
    if not url_doc:
        return jsonify({"error": "URL not found"}), 404
    if url_doc.get("created_by") != request.user_email:
        return jsonify({"error": "Unauthorized"}), 403

    base = _serialize({
        "long_url":   url_doc["long_url"],
        "short_code": url_doc["short_code"],
        "clicks":     url_doc["clicks"],
        "created_at": url_doc["created_at"],
        "expires_at": url_doc.get("expires_at"),
        "flagged":    url_doc.get("flagged", False),
        "metadata":   url_doc.get("metadata", []),
    })
    # Attach ML analytics block
    base["ml_analytics"] = full_analytics_report(url_doc)
    return jsonify(base)


# ── Dashboard ─────────────────────────────────────────────────────────────────

@app.route("/dashboard")
@token_required
def dashboard():
    pipeline = [
        {"$match":  {"created_by": request.user_email}},
        {"$unwind": "$metadata"},
        {"$group":  {"_id": "$metadata.country", "clicks": {"$sum": 1}}},
        {"$sort":   {"clicks": -1}},
    ]
    top_countries = list(urls_collection.aggregate(pipeline))
    top_urls      = [_serialize(u) for u in
                     urls_collection.find({"created_by": request.user_email}).sort("clicks", -1)]
    return jsonify({"top_countries": top_countries, "top_urls": top_urls})


# ── Bloom filter debug stats ───────────────────────────────────────────────────

@app.route("/debug/bloom")
@token_required
def bloom_debug():
    stats = {"type": type(bloom).__name__}
    if hasattr(bloom, "estimated_fp_rate"):
        stats["estimated_fp_rate"] = round(bloom.estimated_fp_rate, 6)
    if hasattr(bloom, "m"):
        stats["bit_array_size_bits"] = bloom.m
    if hasattr(bloom, "k"):
        stats["num_hash_functions"]  = bloom.k
    if hasattr(bloom, "_count"):
        stats["items_inserted"]      = bloom._count
    return jsonify(stats)


# ===========================================================================
# SCHEDULED TASKS
# ===========================================================================

def delete_expired_urls():
    result = urls_collection.delete_many(
        {"expires_at": {"$lte": datetime.datetime.utcnow()}}
    )
    if result.deleted_count:
        print(f"[Scheduler] Removed {result.deleted_count} expired URL(s).")


scheduler = BackgroundScheduler()
scheduler.add_job(delete_expired_urls, "interval", hours=1)
scheduler.start()


# ===========================================================================
# RUN
# ===========================================================================

if __name__ == "__main__":
    app.run(debug=True)
