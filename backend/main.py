"""
Fishing prediction API (FastAPI).

Interactive API docs (Swagger UI) are auto-generated at:
http://localhost:8000/docs
(Use your actual host/port if different, e.g. http://127.0.0.1:8001/docs.)

Run from this folder: cd backend && uvicorn main:app --reload
"""

import json
import math
import os
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from icalendar import Calendar, Event
from pydantic import BaseModel


_BACKEND_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _BACKEND_DIR.parent
load_dotenv(_REPO_ROOT / ".env")
load_dotenv(_BACKEND_DIR / ".env", override=True)

app = FastAPI(title="Fishing Prediction API")

PREDICTIONS_PATH = Path(__file__).resolve().parent / "data" / "predictions.json"


def _gemini_api_key() -> str | None:
    key = os.getenv("GEMINI_API_KEY", "").strip()
    if not key or key == "your_key_here":
        return None
    return key


class ExplainRequest(BaseModel):
    region: str
    species: str
    yield_level: str
    confidence: int
    larvae_signal: str
    lag_weeks: int


def _read_predictions_file() -> Any:
    if not PREDICTIONS_PATH.exists():
        return []
    try:
        raw = PREDICTIONS_PATH.read_text(encoding="utf-8").strip()
        if not raw:
            return []
        return json.loads(raw)
    except (OSError, json.JSONDecodeError):
        return []


def _middle_date_iso(start: str, end: str) -> str:
    d0 = date.fromisoformat(start.strip())
    d1 = date.fromisoformat(end.strip())
    if d1 < d0:
        d0, d1 = d1, d0
    mid = d0 + (d1 - d0) // 2
    return mid.isoformat()


def _parse_optional_date_range(
    start_date: str | None,
    end_date: str | None,
) -> tuple[date, date]:
    """Return (d0, d1) inclusive window; if both None, use today .. today+6."""
    if (start_date is None) ^ (end_date is None):
        raise HTTPException(
            status_code=400,
            detail="Provide both start_date and end_date as ISO YYYY-MM-DD, or omit both.",
        )
    if start_date is None:
        d0 = date.today()
        d1 = d0 + timedelta(days=6)
        return d0, d1
    try:
        d0 = date.fromisoformat(start_date.strip())
        d1 = date.fromisoformat(end_date.strip())
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail="start_date and end_date must be valid ISO dates (YYYY-MM-DD).",
        ) from e
    if d1 < d0:
        d0, d1 = d1, d0
    return d0, d1


def _region_matches_location(region: dict[str, Any], location: str) -> bool:
    needle = location.lower()
    blob = json.dumps(region, ensure_ascii=False).lower()
    return needle in blob


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in kilometers (WGS84 sphere approximation)."""
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmd = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmd / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root() -> dict[str, str]:
    return {"status": "API is running"}


@app.get("/regions")
def get_regions() -> Any:
    return _read_predictions_file()


@app.get("/insights")
def get_insights(
    location: str = Query(..., min_length=1, description='e.g. "Central Coast"'),
    start_date: str = Query(..., min_length=1, description='ISO date, e.g. "2025-06-14"'),
    end_date: str = Query(..., min_length=1, description='ISO date, e.g. "2025-06-17"'),
) -> dict[str, Any]:
    try:
        best_day = _middle_date_iso(start_date, end_date)
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail="start_date and end_date must be valid ISO dates (YYYY-MM-DD).",
        ) from e

    data = _read_predictions_file()
    if not isinstance(data, list):
        raise HTTPException(
            status_code=404,
            detail="No strong fishing opportunities detected for this time window",
        )

    matched: list[dict[str, Any]] = []
    for row in data:
        if not isinstance(row, dict):
            continue
        if not _region_matches_location(row, location):
            continue
        try:
            conf = float(row["confidence"])
        except (KeyError, TypeError, ValueError):
            continue
        if conf < 50:
            continue
        matched.append(row)

    matched.sort(key=lambda r: float(r["confidence"]), reverse=True)

    if not matched:
        raise HTTPException(
            status_code=404,
            detail="No strong fishing opportunities detected for this time window",
        )

    insights: list[dict[str, Any]] = []
    for row in matched:
        try:
            insights.append(
                {
                    "species": row["species"],
                    "yield_level": row["yield_level"],
                    "confidence": row["confidence"],
                    "best_window": row["best_window"],
                    "best_day": best_day,
                }
            )
        except KeyError:
            continue
    if not insights:
        raise HTTPException(
            status_code=404,
            detail="No strong fishing opportunities detected for this time window",
        )
    ranked: list[dict[str, Any]] = []
    for i, item in enumerate(insights, start=1):
        ranked.append({"rank": i, **item})
    return {"insights": ranked}


@app.get("/calendar")
def get_calendar(
    start_date: str | None = Query(
        None,
        description="ISO start date (YYYY-MM-DD); omit both dates for a default 7-day window from today.",
    ),
    end_date: str | None = Query(None, description="ISO end date (YYYY-MM-DD)."),
) -> Response:
    d0, d1 = _parse_optional_date_range(start_date, end_date)
    data = _read_predictions_file()
    if not isinstance(data, list) or len(data) == 0:
        raise HTTPException(
            status_code=404,
            detail="No prediction regions available to build a calendar.",
        )

    rows = [r for r in data if isinstance(r, dict)]
    if not rows:
        raise HTTPException(
            status_code=404,
            detail="No prediction regions available to build a calendar.",
        )

    span_days = max((d1 - d0).days, 0)
    cal = Calendar()
    cal.add("prodid", "-//SpawnCast//Fishing Predictions//EN")
    cal.add("version", "2.0")
    stamp = datetime.now(timezone.utc)

    for i, row in enumerate(rows):
        day = d0 + timedelta(days=min(i, span_days))
        dt_start = datetime(day.year, day.month, day.day, 12, 0, tzinfo=timezone.utc)
        dt_end = dt_start + timedelta(hours=2)

        rid = str(row.get("region_id", f"region-{i}"))
        species = str(row.get("species", "Fishing window"))
        ev = Event()
        ev.add("summary", f"{species} — {rid}")
        ev.add(
            "description",
            "\n".join(
                filter(
                    None,
                    [
                        f"Yield: {row.get('yield_level')}",
                        f"Confidence: {row.get('confidence')}%",
                        str(row.get("best_window") or ""),
                    ],
                )
            ),
        )
        ev.add("dtstart", dt_start)
        ev.add("dtend", dt_end)
        ev.add("uid", f"{rid}-{day.isoformat()}@spawncast.local")
        ev.add("dtstamp", stamp)
        cal.add_component(ev)

    body = cal.to_ical()
    return Response(
        content=body,
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="spawncast-predictions.ics"'},
    )


@app.get("/region-details")
def get_region_details(lat: float, lon: float) -> dict[str, Any]:
    data = _read_predictions_file()
    if not isinstance(data, list) or len(data) == 0:
        raise HTTPException(
            status_code=404,
            detail="No prediction regions found. Ensure data/predictions.json exists and contains a non-empty list.",
        )

    best: dict[str, Any] | None = None
    best_km = float("inf")
    for row in data:
        if not isinstance(row, dict):
            continue
        try:
            rlat = float(row["lat"])
            rlon = float(row["lon"])
        except (KeyError, TypeError, ValueError):
            continue
        dist = _haversine_km(lat, lon, rlat, rlon)
        if dist < best_km:
            best_km = dist
            best = row

    if best is None:
        raise HTTPException(
            status_code=404,
            detail="No region entries with valid lat/lon coordinates were found in predictions data.",
        )

    try:
        return {
            "species": best["species"],
            "yield_level": best["yield_level"],
            "confidence": best["confidence"],
            "best_window": best["best_window"],
        }
    except KeyError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Nearest region is missing required field: {e.args[0]!r}.",
        ) from e


@app.post("/explain")
def explain_prediction(body: ExplainRequest) -> dict[str, str]:
    api_key = _gemini_api_key()
    if api_key is None:
        raise HTTPException(
            status_code=503,
            detail="GEMINI_API_KEY is missing or still set to the placeholder in .env. Add a valid key and restart the server.",
        )

    prompt = (
        "You are an AI assistant for a fishing prediction app. Based on this data, write exactly ONE "
        "clear sentence explaining why fishing conditions are predicted the way they are. Be specific "
        "and natural. Data: "
        f"region={body.region}, species={body.species}, yield={body.yield_level}, "
        f"confidence={body.confidence}%, larvae signal: {body.larvae_signal}, "
        f"lag time: {body.lag_weeks} weeks."
    )

    import google.generativeai as genai

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel("gemini-1.5-flash")

    try:
        response = model.generate_content(prompt)
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail="The AI service request failed. Check your network, API key, and quota, then try again.",
        ) from e

    try:
        text = (response.text or "").strip()
    except (ValueError, AttributeError):
        text = ""

    if not text:
        raise HTTPException(
            status_code=503,
            detail="The model did not return any text (response may have been blocked or empty).",
        )

    return {"explanation": text}
