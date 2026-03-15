# bloom_qr.py
# Bloom Filter  +  QR Code generation
#
# BLOOM FILTER
#   Two implementations with an identical interface:
#     RedisBloomFilter   — uses the BF.ADD / BF.EXISTS commands from the
#                          RedisBloom module (redis-stack-server). O(1),
#                          persistent across restarts, shared across workers.
#     PythonBloomFilter  — pure-Python in-memory bitarray fallback. Use this
#                          when RedisBloom is not available (local dev).
#   build_bloom_filter() auto-detects which to use and seeds from MongoDB.
#
# QR CODE
#   generate_qr_code()   — returns a base64 PNG string (embed in JSON)
#   generate_qr_data_uri() — returns a ready-to-use data: URI
#   make_qr_response()   — Flask Response that streams the PNG directly
#
# pip install redis qrcode[pil] Pillow

import io
import math
import hashlib
import base64
import os
import logging

import qrcode
from PIL import Image

logger = logging.getLogger(__name__)


# ===========================================================================
# 1.  BLOOM FILTER
# ===========================================================================

class RedisBloomFilter:
    """
    Thin wrapper around Redis BF commands (RedisBloom / redis-stack-server).

    Start Redis with the Bloom module:
        docker run -d -p 6379:6379 redis/redis-stack-server:latest
    or install the module manually on your Redis server.

    False-positive rate: 0.1%   (1 in 1 000 short codes may return a false hit,
                                  which triggers a harmless MongoDB confirmation)
    Capacity: 1 000 000 short codes before the error rate begins to rise.
    """

    FILTER_KEY = "url_shortener:bloom:short_codes"
    ERROR_RATE = 0.001
    CAPACITY   = 1_000_000

    def __init__(self, redis_client):
        self.r = redis_client
        self._init_filter()

    def _init_filter(self):
        try:
            self.r.execute_command(
                "BF.RESERVE", self.FILTER_KEY,
                self.ERROR_RATE, self.CAPACITY
            )
            logger.info("[BloomFilter:Redis] Created (cap=%d, err=%.4f)", self.CAPACITY, self.ERROR_RATE)
        except Exception as exc:
            if "already exists" not in str(exc).lower():
                logger.warning("[BloomFilter:Redis] BF.RESERVE: %s", exc)

    def add(self, short_code: str) -> bool:
        """
        Register a short code.
        Returns True if newly added, False if already present.
        """
        try:
            return bool(self.r.execute_command("BF.ADD", self.FILTER_KEY, short_code))
        except Exception as exc:
            logger.error("[BloomFilter:Redis] BF.ADD: %s", exc)
            return False

    def exists(self, short_code: str) -> bool:
        """
        Check membership.
        False  → definitely does NOT exist  (100% certain — use code safely)
        True   → probably exists            (confirm with MongoDB before rejecting)
        """
        try:
            return bool(self.r.execute_command("BF.EXISTS", self.FILTER_KEY, short_code))
        except Exception as exc:
            logger.error("[BloomFilter:Redis] BF.EXISTS: %s", exc)
            return True  # fail-safe: treat as exists → triggers MongoDB check

    def add_many(self, short_codes: list):
        """Bulk-load codes (e.g. on startup from MongoDB)."""
        if not short_codes:
            return
        try:
            pipe = self.r.pipeline()
            for code in short_codes:
                pipe.execute_command("BF.ADD", self.FILTER_KEY, code)
            pipe.execute()
            logger.info("[BloomFilter:Redis] Seeded %d codes.", len(short_codes))
        except Exception as exc:
            logger.error("[BloomFilter:Redis] Bulk load: %s", exc)


# ---------------------------------------------------------------------------

class PythonBloomFilter:
    """
    Pure-Python in-memory Bloom filter using a bytearray as the bit vector.

    NOT persistent — call add_many() with existing codes from MongoDB on startup.

    Math reference:
        optimal bits   m = -n * ln(p) / (ln 2)^2
        optimal hashes k = (m/n) * ln 2
    """

    def __init__(self, capacity: int = 1_000_000, error_rate: float = 0.001):
        self.capacity   = capacity
        self.error_rate = error_rate
        self.m          = max(1, int(-capacity * math.log(error_rate) / (math.log(2) ** 2)))
        self.k          = max(1, int((self.m / capacity) * math.log(2)))
        self._bits      = bytearray(math.ceil(self.m / 8))
        self._count     = 0
        logger.info("[BloomFilter:Python] m=%d bits, k=%d hashes", self.m, self.k)

    # double-hashing avoids needing k independent hash functions
    def _positions(self, item: str) -> list:
        h1 = int(hashlib.md5(item.encode()).hexdigest(),  16)
        h2 = int(hashlib.sha1(item.encode()).hexdigest(), 16)
        return [(h1 + i * h2) % self.m for i in range(self.k)]

    def _set(self, pos: int):
        self._bits[pos >> 3] |= 1 << (pos & 7)

    def _get(self, pos: int) -> bool:
        return bool(self._bits[pos >> 3] & (1 << (pos & 7)))

    def add(self, item: str) -> bool:
        already = self.exists(item)
        for pos in self._positions(item):
            self._set(pos)
        self._count += 1
        return not already

    def exists(self, item: str) -> bool:
        return all(self._get(pos) for pos in self._positions(item))

    def add_many(self, items: list):
        for item in items:
            self.add(item)
        logger.info("[BloomFilter:Python] Loaded %d items.", len(items))

    @property
    def estimated_fp_rate(self) -> float:
        """Approximate current false-positive rate given number of items inserted."""
        if self._count == 0:
            return 0.0
        return (1 - math.exp(-self.k * self._count / self.m)) ** self.k


# ---------------------------------------------------------------------------

def build_bloom_filter(redis_client=None, db=None):
    """
    Factory function — returns the best available Bloom filter and pre-seeds it.

    Priority:
        1. RedisBloomFilter  if redis_client is provided and BF commands work
        2. PythonBloomFilter otherwise

    Args:
        redis_client : redis.Redis instance (optional)
        db           : pymongo Database (optional) — used to seed existing codes

    Returns:
        A bloom filter instance with .add(code) and .exists(code) methods.

    Usage in app.py:
        from bloom_qr import build_bloom_filter
        bloom = build_bloom_filter(redis_client=r, db=db)
    """
    bloom = None

    if redis_client is not None:
        try:
            redis_client.execute_command("BF.EXISTS", "_probe_", "_probe_")
            bloom = RedisBloomFilter(redis_client)
            logger.info("[BloomFilter] Using Redis Bloom filter.")
        except Exception:
            logger.info("[BloomFilter] RedisBloom unavailable — using Python fallback.")

    if bloom is None:
        bloom = PythonBloomFilter()

    # Seed from MongoDB
    if db is not None:
        try:
            codes = [doc["short_code"]
                     for doc in db.urls.find({}, {"short_code": 1, "_id": 0})]
            bloom.add_many(codes)
            logger.info("[BloomFilter] Seeded %d existing codes from MongoDB.", len(codes))
        except Exception as exc:
            logger.warning("[BloomFilter] MongoDB seed failed: %s", exc)

    return bloom


# ===========================================================================
# 2.  QR CODE GENERATION
# ===========================================================================

QR_BOX_SIZE = 10
QR_BORDER   = 4
QR_FG       = (30, 30, 30)
QR_BG       = (255, 255, 255)
QR_SIZE     = (300, 300)        # final PNG dimensions in pixels
QR_FORMAT   = "PNG"

# Optional: set QR_LOGO_PATH env var to overlay a logo at the centre
QR_LOGO_PATH = os.getenv("QR_LOGO_PATH", "")


def generate_qr_code(short_url: str, as_base64: bool = True) -> str | bytes:
    """
    Generate a QR code PNG for the given short URL.

    Args:
        short_url:  Full short URL, e.g. "http://localhost:5000/r/abc123"
        as_base64:  True  → return base64-encoded string  (for JSON responses)
                    False → return raw PNG bytes           (for HTTP streaming)

    Returns:
        base64 string or raw bytes depending on as_base64.

    Example (embed in HTML):
        b64 = generate_qr_code(short_url, as_base64=True)
        html = f'<img src="data:image/png;base64,{b64}">'
    """
    qr = qrcode.QRCode(
        version=None,
        # ERROR_CORRECT_H allows up to 30% of the code to be damaged/covered —
        # required if you plan to overlay a logo in the centre.
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=QR_BOX_SIZE,
        border=QR_BORDER,
    )
    qr.add_data(short_url)
    qr.make(fit=True)

    img: Image.Image = qr.make_image(fill_color=QR_FG, back_color=QR_BG).convert("RGB")
    img = img.resize(QR_SIZE, Image.LANCZOS)

    # Optional logo overlay ─────────────────────────────────────────────────
    if QR_LOGO_PATH and os.path.exists(QR_LOGO_PATH):
        try:
            logo      = Image.open(QR_LOGO_PATH).convert("RGBA")
            logo_size = (QR_SIZE[0] // 4, QR_SIZE[1] // 4)   # 25% of QR area
            logo      = logo.resize(logo_size, Image.LANCZOS)
            pos       = ((QR_SIZE[0] - logo_size[0]) // 2,
                         (QR_SIZE[1] - logo_size[1]) // 2)
            mask      = logo if logo.mode == "RGBA" else None
            img.paste(logo, pos, mask=mask)
        except Exception as exc:
            logger.warning("[QR] Logo overlay failed: %s", exc)

    buf = io.BytesIO()
    img.save(buf, format=QR_FORMAT, optimize=True)
    raw = buf.getvalue()

    return base64.b64encode(raw).decode("utf-8") if as_base64 else raw


def generate_qr_data_uri(short_url: str) -> str:
    """
    Return a ready-to-use data URI:  data:image/png;base64,<...>
    Embed directly as an <img> src in HTML or JSON responses.
    """
    return f"data:image/png;base64,{generate_qr_code(short_url, as_base64=True)}"


def make_qr_response(short_url: str):
    """
    Return a Flask Response that streams the QR code PNG directly.

    Wire into app.py:

        from bloom_qr import make_qr_response

        @app.route("/qr/<short_code>")
        def qr_endpoint(short_code):
            doc = urls_collection.find_one({"short_code": short_code})
            if not doc:
                return jsonify({"error": "Not found"}), 404
            return make_qr_response(f"{BASE_URL}/r/{short_code}")
    """
    from flask import Response
    png = generate_qr_code(short_url, as_base64=False)
    return Response(
        png,
        mimetype="image/png",
        headers={
            "Content-Disposition": "inline; filename=qr.png",
            "Cache-Control":       "public, max-age=86400",
        }
    )
