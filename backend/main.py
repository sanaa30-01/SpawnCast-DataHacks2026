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
from pydantic import BaseModel, Field

# 🔥 GEMINI IMPORT
from google import genai

app = FastAPI(title="Fishing Prediction API")

PREDICTIONS_PATH = Path(__file__).resolve().parent.parent / "output" / "intelligence.json"


# ---------- HELPERS ----------

def _read_predictions_file() -> list[dict[str, Any]]:
    if not PREDICTIONS_PATH.exists():
        return []
    try:
        return json.loads(PREDICTIONS_PATH.read_text())
    except (OSError, json.JSONDecodeError):
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


_MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]


def _months_spanned(start_iso: str, end_iso: str) -> set[str]:
    d0 = date.fromisoformat(start_iso.strip())
    d1 = date.fromisoformat(end_iso.strip())
    if d1 < d0:
        d0, d1 = d1, d0
    out: set[str] = set()
    y, m = d0.year, d0.month
    y_end, m_end = d1.year, d1.month
    while y < y_end or (y == y_end and m <= m_end):
        out.add(_MONTH_NAMES[m - 1])
        if m == 12:
            y += 1
            m = 1
        else:
            m += 1
    return out


# 🔥 GEMINI EXPLANATION FUNCTION (lazy client — API must boot without a key)
def generate_explanation(species, confidence, yield_level):
    key = (os.getenv("GEMINI_API_KEY") or "").strip()
    if not key or key == "your_key_here":
        return (
            f"SpawnCast ranks {species} from larvae–catch intelligence for this window "
            f"(model confidence {confidence}%, yield signal {yield_level})."
        )
    try:
        client = genai.Client(api_key=key)
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


class PlannerRequest(BaseModel):
    lat: float
    lon: float
    start_date: str
    end_date: str
    species_filter: list[str] = Field(default_factory=list)


def _planner_collect(
    data: list[dict[str, Any]],
    lat: float,
    lon: float,
    months_ok: set[str] | None,
    species_filter_lower: list[str],
    max_km: float,
) -> list[tuple[float, dict[str, Any], str]]:
    out: list[tuple[float, dict[str, Any], str]] = []
    for row in data:
        try:
            rlat = float(row["lat"])
            rlon = float(row["lon"])
        except (TypeError, ValueError, KeyError):
            continue
        d = _haversine_km(lat, lon, rlat, rlon)
        if d > max_km:
            continue
        if months_ok is not None and row.get("fish_month_str") not in months_ok:
            continue
        sp_list = row.get("species")
        if not isinstance(sp_list, list):
            sp_list = [sp_list] if sp_list else []
        for sp in sp_list:
            s = str(sp)
            if species_filter_lower and not any(f in s.lower() for f in species_filter_lower):
                continue
            conf = float(row.get("confidence") or 0)
            pred = float(row.get("pred_prob_y", row.get("pred_prob_x", conf)))
            seasonal = float(row.get("seasonal_score") or 0)
            score = conf * pred + 0.12 * seasonal - 0.0007 * d
            out.append((score, row, s))
    return out


@app.post("/planner/recommendations")
def planner_recommendations(req: PlannerRequest):
    """
    Rank species for a chosen lat/lon and trip window using `output/intelligence.json`
    (ML pipeline output). Top rows get short Gemini explanations when API key is set.
    """
    data = _read_predictions_file()
    if not data:
        raise HTTPException(status_code=503, detail="No intelligence data (output/intelligence.json)")

    months = _months_spanned(req.start_date, req.end_date)
    filt = [s.lower().strip() for s in req.species_filter if s and str(s).strip()]

    notice: str | None = None
    max_km = 400.0
    cands = _planner_collect(data, req.lat, req.lon, months, filt, max_km)
    if not cands:
        cands = _planner_collect(data, req.lat, req.lon, None, filt, max_km)
        notice = (
            "No grid cells in strict calendar overlap with every day in your trip window; "
            "using the nearest larval–catch signals regardless of fish_month_str."
        )
    if not cands:
        cands = _planner_collect(data, req.lat, req.lon, months, filt, 2500.0)
        notice = "Widened search radius to find model cells near this location."
    if not cands:
        cands = _planner_collect(data, req.lat, req.lon, None, filt, 2500.0)
        notice = "Using broadened radius and month rules to surface candidates."

    cands.sort(key=lambda x: -x[0])

    seen: set[str] = set()
    unique: list[tuple[float, dict[str, Any], str]] = []
    for item in cands:
        _, row, sp = item
        key = sp.lower()
        if key in seen:
            continue
        seen.add(key)
        unique.append(item)
        if len(unique) >= 24:
            break

    if not unique:
        raise HTTPException(
            status_code=404,
            detail="No species candidates near this location for the selected filters.",
        )

    ranked: list[dict[str, Any]] = []
    for i, (score, row, sp) in enumerate(unique[:14], start=1):
        conf = float(row.get("confidence") or 0)
        pred = float(row.get("pred_prob_y", row.get("pred_prob_x", conf)))
        yraw = str(row.get("yield", "low")).lower()
        if "high" in yraw:
            yl = "High"
        elif "med" in yraw:
            yl = "Medium"
        else:
            yl = "Low"

        conf_pct = _confidence_pct(conf)
        if i <= 6:
            explanation = generate_explanation(sp, conf_pct, yl)
        else:
            explanation = (
                f"Rank #{i}: {sp} from regional intelligence (fish month {row.get('fish_month_str', 'n/a')}, "
                f"seasonal_score {float(row.get('seasonal_score') or 0):.2f})."
            )

        ranked.append(
            {
                "rank": i,
                "species": sp,
                "display_name": sp,
                "lat": float(row["lat"]),
                "lon": float(row["lon"]),
                "confidence": min(0.99, max(0.05, conf)),
                "yield": min(0.99, max(0.05, pred)),
                "yield_level": yl,
                "fish_month_str": row.get("fish_month_str") or "",
                "seasonal_score": float(row.get("seasonal_score") or 0),
                "region_id": str(row.get("region_id", "")),
                "explanation": explanation,
            }
        )

    return {"ranked": ranked, "notice": notice, "model": "intelligence-json+v1"}


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
def download_calendar(
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