from dotenv import load_dotenv
load_dotenv()
import json
import math
import os
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from icalendar import Calendar, Event

# 🔥 GEMINI IMPORT
from google import genai
import os

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

app = FastAPI(title="Fishing Prediction API")

PREDICTIONS_PATH = Path(__file__).resolve().parent.parent / "output" / "intelligence.json"


# ---------- HELPERS ----------

def _read_predictions_file() -> list[dict[str, Any]]:
    if not PREDICTIONS_PATH.exists():
        return []
    try:
        return json.loads(PREDICTIONS_PATH.read_text())
    except:
        return []


def _middle_date_iso(start: str, end: str) -> str:
    d0 = date.fromisoformat(start)
    d1 = date.fromisoformat(end)
    if d1 < d0:
        d0, d1 = d1, d0
    return (d0 + (d1 - d0) // 2).isoformat()


def _haversine_km(lat1, lon1, lat2, lon2):
    r = 6371
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return 2 * r * math.asin(min(1, math.sqrt(a)))


def _format_species(s):
    return ", ".join(s) if isinstance(s, list) else str(s)


def _confidence_pct(c):
    return round(float(c) * 100)


# 🔥 GEMINI EXPLANATION FUNCTION
def generate_explanation(species, confidence, yield_level):
    try:
        prompt = f"""
        Explain why {species} is a good fishing target.

        Be concise and practical.
        Confidence: {confidence}%
        Yield: {yield_level}
        """

        response = client.models.generate_content(
            model="models/gemini-2.5-flash",
            contents=prompt
        )

        return response.text.strip()

    except Exception as e:
        print("Gemini failed:", e)
        return f"Strong larvae signals indicate favorable {species} fishing conditions."


# ---------- APP CONFIG ----------

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- ROUTES ----------

@app.get("/")
def root():
    return {"status": "API is running"}


@app.get("/regions")
def get_regions():
    return _read_predictions_file()


# ---------- INSIGHTS ----------

@app.get("/insights")
def get_insights(location: str, start_date: str, end_date: str):
    from collections import defaultdict

    data = _read_predictions_file()

    if not data:
        raise HTTPException(404, "No data available")

    best_day = _middle_date_iso(start_date, end_date)

    # 🔥 LIGHT TIME LAG
    user_date = datetime.fromisoformat(best_day)
    lagged_date = user_date - timedelta(weeks=4)
    lagged_month = lagged_date.strftime("%B")

    month_order = [
        "January","February","March","April","May","June",
        "July","August","September","October","November","December"
    ]

    idx = month_order.index(lagged_month)

    valid_months = [
        month_order[idx],
        month_order[(idx - 1) % 12],
        month_order[(idx + 1) % 12]
    ]

    matched = []
    for row in data:
        if location.lower() in json.dumps(row).lower():
            if float(row.get("confidence", 0)) >= 0.5:
                if row.get("fish_month_str") in valid_months:
                    matched.append(row)

    if not matched:
        raise HTTPException(404, "No strong fishing opportunities detected")

    species_map = defaultdict(list)

    for row in matched:
        species_list = row["species"] if isinstance(row["species"], list) else [row["species"]]
        for sp in species_list:
            species_map[sp].append(row)

    results = []

    for species, rows in species_map.items():
        avg_conf = sum(float(r["confidence"]) for r in rows) / len(rows)
        adjusted_conf = max(0.0, min(1.0, avg_conf))

        if adjusted_conf > 0.75:
            yield_level = "High"
        elif adjusted_conf > 0.6:
            yield_level = "Medium"
        else:
            yield_level = "Low"

        confidence_pct = round(adjusted_conf * 100)

        results.append({
            "species": species,
            "confidence": confidence_pct,
            "yield_level": yield_level,
            "best_window": lagged_month,
            "explanation": generate_explanation(species, confidence_pct, yield_level)
        })

    results = sorted(results, key=lambda x: x["confidence"], reverse=True)[:5]

    final = []
    for i, r in enumerate(results, start=1):
        r["rank"] = i
        r["best_day"] = best_day
        final.append(r)

    return {"insights": final}


# ---------- REGION DETAILS ----------

@app.get("/region-details")
def region_details(lat: float, lon: float):
    data = _read_predictions_file()

    best = None
    best_dist = float("inf")

    for row in data:
        try:
            d = _haversine_km(lat, lon, row["lat"], row["lon"])
            if d < best_dist:
                best = row
                best_dist = d
        except:
            continue

    if not best:
        raise HTTPException(404, "No region found")

    return {
        "species": _format_species(best["species"]),
        "yield_level": best["yield"],
        "confidence": _confidence_pct(best["confidence"]),
        "best_window": best["fish_month_str"],
    }


# ---------- PERSONALIZED CALENDAR ----------

@app.get("/calendar")
def calendar(
    species: str,
    date: str,
    confidence: int,
    yield_level: str,
    location: str = "Fishing Region"
):
    cal = Calendar()
    cal.add("prodid", "-//SpawnCast//EN")
    cal.add("version", "2.0")

    now = datetime.now(timezone.utc)

    event_date = datetime.fromisoformat(date)

    start = datetime(
        event_date.year,
        event_date.month,
        event_date.day,
        6, 0,
        tzinfo=timezone.utc
    )

    ev = Event()

    ev.add("summary", f"Fishing Trip — {species}")
    ev.add("location", location)

    ev.add("description",
           f"Target: {species}\n"
           f"Yield: {yield_level}\n"
           f"Confidence: {confidence}%\n\n"
           f"Based on larvae signals observed ~4 weeks prior.")

    ev.add("dtstart", start)
    ev.add("dtend", start + timedelta(hours=4))
    ev.add("dtstamp", now)

    cal.add_component(ev)

    return Response(
        cal.to_ical(),
        media_type="text/calendar",
        headers={"Content-Disposition": "attachment; filename=fishing_trip.ics"}
    )