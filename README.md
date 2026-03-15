# SNIP. — ML-Powered URL Shortener

> MTech Project | Distributed Systems & Machine Learning

A full-stack URL shortener with machine learning analytics, Bloom filter collision detection, QR code generation, and real-time geo tracking.

---

## Features

- **URL Shortening** — fast MD5-based short codes
- **Smart NLP Alias** — generates human-readable slugs from page titles using keyword extraction
- **Bloom Filter** — O(1) probabilistic collision check, avoids unnecessary MongoDB queries
- **QR Code Generation** — every shortened URL gets a downloadable QR code instantly
- **Click Analytics** — tracks IP, city, region, country per click
- **ML Click Prediction** — Random Forest model predicts future click counts
- **Anomaly / Bot Detection** — Isolation Forest + rule-based burst detection flags suspicious traffic
- **Password Protection** — optionally lock any short URL behind a password
- **URL Expiry** — set an expiry date on any link
- **JWT Authentication** — access token + refresh token flow
- **Rate Limiting** — 10 URLs per user per day
- **React Frontend** — dark-themed dashboard with charts, QR preview, and analytics

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python, Flask |
| Database | MongoDB |
| ML Models | scikit-learn (Random Forest, Isolation Forest) |
| NLP | spaCy `en_core_web_sm` |
| Bloom Filter | Pure Python bitarray (Redis-ready) |
| QR Code | qrcode + Pillow |
| Frontend | React, Recharts |
| Auth | JWT (PyJWT) + bcrypt |

---

## Project Structure

```
URL-SHORTENER/
│
├── app.py                  # Flask API — all routes
├── ml_analytics.py         # Click prediction, anomaly detection, smart alias
├── bloom_qr.py             # Bloom filter + QR code generation
├── train_models.py         # Script to train ML models from real data
│
├── requirements.txt
├── Procfile                # For deployment
├── .env                    # Your secrets (never commit this)
├── .env.example            # Template — copy this to .env
├── .gitignore
│
├── models/                 # Saved ML model files (auto-created)
│   ├── click_predictor.joblib
│   ├── label_encoders.joblib
│   └── anomaly_detector.joblib
│
└── url-shortener-frontend/ # React app
    ├── src/
    │   ├── api/index.js
    │   ├── context/AuthContext.js
    │   ├── components/
    │   │   ├── Navbar.js
    │   │   └── UI.js
    │   └── pages/
    │       ├── Auth.js
    │       ├── Home.js
    │       ├── Dashboard.js
    │       └── Analytics.js
    └── package.json
```

---

## Local Setup

### Prerequisites

- Python 3.10+
- Node.js 18+
- MongoDB installed locally

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/url-shortener.git
cd url-shortener
```

### 2. Create your `.env` file

```bash
cp .env.example .env
```

Open `.env` and fill in your values:

```env
MONGO_URI=mongodb://localhost:27017/url_shortener
SECRET_KEY=any_random_string_here
BASE_URL=http://localhost:5000
FRONTEND_URL=http://localhost:3000
```

> If using MongoDB Atlas, replace `MONGO_URI` with your Atlas connection string.

### 3. Create and activate virtual environment

```bash
python -m venv env

# Windows
env\Scripts\activate

# Mac / Linux
source env/bin/activate
```

### 4. Install Python dependencies

```bash
pip install -r requirements.txt
python -m spacy download en_core_web_sm
```

### 5. Install React dependencies

```bash
cd url-shortener-frontend
npm install
cd ..
```

---

## Running the App

You need **3 terminals** open at the same time.

**Terminal 1 — MongoDB:**
```bash
mongod
```

**Terminal 2 — Flask backend:**
```bash
# activate virtual env first
env\Scripts\activate

python app.py
```
Flask runs at → `http://localhost:5000`

**Terminal 3 — React frontend:**
```bash
cd url-shortener-frontend
npm start
```
React runs at → `http://localhost:3000`

Open `http://localhost:3000` in your browser.

---

## Testing QR Codes on Your Phone

The QR code must point to an address your phone can reach.

**Find your laptop IP:**
```bash
ipconfig
# Look for: IPv4 Address . . . . : 192.168.x.x
```

**Update `.env`:**
```env
BASE_URL=http://192.168.x.x:5000
```

**Allow Flask through Windows Firewall** (run as Administrator):
```bash
netsh advfirewall firewall add rule name="Flask 5000" dir=in action=allow protocol=TCP localport=5000
```

Restart Flask. Now QR codes will be scannable by any phone on the same WiFi.

---

## Training the ML Models

The ML models need real click data before they work. After you have some URLs with clicks:

```bash
python train_models.py
```

This saves 3 files to the `models/` folder:
- `click_predictor.joblib` — Random Forest click count predictor
- `label_encoders.joblib` — country/city encoders
- `anomaly_detector.joblib` — Isolation Forest bot detector

Until the models are trained, analytics will show `"model_not_trained"` for predictions — everything else works normally.

---

## API Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/` | No | Health check |
| POST | `/user/register` | No | Register new user |
| POST | `/user/login` | No | Login, returns JWT tokens |
| POST | `/user/refresh` | No | Refresh access token |
| POST | `/shorten` | Yes | Shorten a URL |
| GET | `/r/<short_code>` | No | Redirect to original URL |
| GET | `/qr/<short_code>` | No | Get QR code PNG image |
| GET | `/analytics/<short_code>` | Yes | Get ML analytics for a URL |
| GET | `/dashboard` | Yes | Get all URLs + country stats |
| GET | `/debug/bloom` | Yes | Bloom filter stats |

### Shorten URL — request body

```json
{
  "long_url": "https://example.com/very/long/url",
  "alias": "my-custom-code",
  "smart_alias": true,
  "expires_in_days": 30,
  "password": "optional"
}
```

### Shorten URL — response

```json
{
  "short_url": "http://localhost:5000/r/abc123",
  "short_code": "abc123",
  "qr_code": "<base64 PNG string>",
  "qr_data_uri": "data:image/png;base64,..."
}
```

---

## ML Components

### Click Prediction
Uses a `RandomForestRegressor` trained on URL metadata (creation time, day of week, top visitor country/city) to predict future click counts.

### Anomaly / Bot Detection
Two-stage detection:
1. **Rule-based** — flags if any single IP fires 100+ clicks within 10 minutes
2. **ML-based** — `IsolationForest` model scores traffic vectors (clicks/hour, unique IPs, country concentration, avg click hour)

### Smart Alias Generation
Fetches the destination page's title and meta description, extracts keywords using spaCy NER + noun chunks, and generates a readable slug like `flask-quickstart` instead of `aB3xYz`.

### Bloom Filter
Pure-Python bitarray implementation with optimal bit array size and double-hashing. Every redirect does an O(1) membership check before touching MongoDB. False positive rate: 0.1% at 1 million entries.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `MONGO_URI` | Yes | MongoDB connection string |
| `SECRET_KEY` | Yes | JWT signing secret |
| `BASE_URL` | Yes | Public base URL of the backend |
| `FRONTEND_URL` | No | Frontend URL for CORS |

---

## .env.example

```env
# Copy this file to .env and fill in your values
# cp .env.example .env

MONGO_URI=your_mongodb_connection_string_here
SECRET_KEY=any_random_secret_string
BASE_URL=http://localhost:5000
FRONTEND_URL=http://localhost:3000
```

---

