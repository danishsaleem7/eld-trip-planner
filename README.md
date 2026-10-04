# ELD Trip Planner

Full-stack app (Django + React) that takes **current location, pickup, drop-off and cycle hours used** and returns:

1. A **route map** (OpenStreetMap tiles + OSRM routing) with pickup, drop-off, fuel stops, 30-min breaks, 10-hr rests and 34-hr restarts marked.
2. **Filled-out Driver's Daily Log sheets** (one per calendar day, drawn as SVG on the standard 24-hour grid) with duty-status line, totals, angled remarks (city, state at every change of duty status, as the FMCSA guide requires), miles, driver certification and the 70 hr / 8 day recap. Printable (one sheet per page).

Assumptions (from the brief): property-carrying driver, 70 hr / 8 day, no adverse conditions, fuel at least every 1,000 miles, 1 hour for pickup and 1 hour for drop-off.

## How the HOS scheduler works (`backend/trips/hos.py`)

Rules from the FMCSA *Interstate Truck Driver's Guide to Hours of Service* (49 CFR 395.3):

| Rule | Implementation |
|---|---|
| 11-hour driving limit | driving chunks are capped at 11 h since last 10 h rest |
| 14-hour window | window starts at first on-duty time; no driving after it closes |
| 30-min break after 8 h driving | inserted automatically (any >= 30 min non-driving stop, e.g. fuel/pickup, also satisfies it) |
| 10 h off duty | sleeper-berth rest resets 11 h / 14 h clocks |
| 70 h / 8 days | `cycle_used_hours` counts toward the limit; at 70 h a 34-hour restart is scheduled |
| Fuel every 1,000 mi | 30-min on-duty fuel stop |
| Pickup / drop-off | 1 h on duty each |

Driving speed is modelled at 55 mph average (truck, not car routing time). Events are sliced at midnight into daily logs.

**Simplification to be aware of:** the app only knows a single "cycle used" number, not the per-day history, so no hours "roll off" the 8-day window during the trip; the 34-hour restart is the only cycle reset. Recap line C (last 5 days) counts trip days only.

## Run locally

Backend (Python 3.11+):

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python manage.py runserver 8000
pytest tests                     # scheduler tests (pip install pytest)
```

Frontend (Node 18+):

```bash
cd frontend
npm install
npm run dev                      # http://localhost:5173  (API defaults to http://localhost:8000)
```

## API

`POST /api/plan/`

```json
{ "current_location": "Chicago, IL", "pickup_location": "Dallas, TX", "dropoff_location": "Los Angeles, CA",
  "cycle_used_hours": 30, "start_time": "2026-10-05T08:00" }
```

Returns `route` (geometry + miles), `waypoints`, `stops`, `events`, `days` (daily log segments, totals, recap) and `summary`.
`GET /api/reverse/?lat=..&lon=..` resolves a "City, ST" label (called lazily by the UI to respect Nominatim's 1 req/sec policy).
Locations can be place names/addresses or `lat,lon`.

## Deploy

### 1. Push to GitHub

```bash
cd eld-trip-planner
git add . && git commit -m "ELD trip planner"
git branch -M main
git remote add origin https://github.com/<you>/eld-trip-planner.git
git push -u origin main
```

### 2. Backend on Render (free)

1. render.com -> **New -> Blueprint**, pick the repo (it reads `render.yaml`). Or **New -> Web Service**: root dir `backend`, build `pip install -r requirements.txt`, start `gunicorn config.wsgi --timeout 60`.
2. Env vars: `DJANGO_DEBUG=false`, `DJANGO_SECRET_KEY=<random>`, `DJANGO_ALLOWED_HOSTS=<your-service>.onrender.com`, `CORS_ALLOWED_ORIGINS=https://<your-app>.vercel.app` (add after step 3; `*` works while testing).
3. Copy the service URL, e.g. `https://eld-trip-planner-api.onrender.com`. Free instances sleep — open `/api/health/` just before your demo.

### 3. Frontend on Vercel

1. vercel.com -> **Add New Project**, import the repo, **Root Directory = `frontend`** (Vite is auto-detected).
2. Env var `VITE_API_URL=https://<your-service>.onrender.com` (no trailing slash).
3. Deploy, then put the Vercel URL into the backend's `CORS_ALLOWED_ORIGINS` and redeploy the backend.

## Notes

* Map tiles / geocoding / reverse geocoding: OpenStreetMap + Nominatim (usage-policy compliant, identified User-Agent). Routing: public OSRM demo server; if unreachable the app falls back to an approximate straight-line route and says so.
* The public OSRM and Nominatim servers are best-effort and rate-limited; for production traffic self-host them or use a commercial provider.
