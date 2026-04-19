/**
 * Prediction service — typed mock layer.
 *
 * SWAP POINT: Replace the function bodies of `getPredictionGrid`,
 * `getRegionDetail`, and `getTripPlan` with `fetch()` calls to your
 * model API once it's deployed. Keep the type signatures identical.
 */

import { WEST_COAST_BBOX } from "./mapbox";

export type YieldLevel = "high" | "moderate" | "low";

export interface SpeciesForecast {
  scientificName: string;
  commonName: string;
  yieldLevel: YieldLevel;
  yieldEstimateKg: number;
  confidence: number;
  bestDayISO: string;
  explanation: string;
}

export interface PredictionTile {
  id: string;
  lat: number;
  lng: number;
  month: number;
  predictedYield: number;
  confidence: number;
  topSpecies: string;
}

export interface RegionDetail {
  id: string;
  lat: number;
  lng: number;
  month: number;
  regionName: string;
  overallYield: YieldLevel;
  overallConfidence: number;
  bestWindow: { startISO: string; endISO: string };
  species: SpeciesForecast[];
  summary: string;
}

const SPECIES = [
  { sci: "Sardinops sagax", common: "Pacific Sardine", peakMonth: 7, latPref: 35, lagWeeks: 5 },
  { sci: "Engraulis mordax", common: "Northern Anchovy", peakMonth: 6, latPref: 36, lagWeeks: 4 },
  { sci: "Merluccius productus", common: "Pacific Hake", peakMonth: 8, latPref: 44, lagWeeks: 6 },
  { sci: "Metacarcinus magister", common: "Dungeness Crab", peakMonth: 12, latPref: 46, lagWeeks: 10 },
  { sci: "Oncorhynchus tshawytscha", common: "Chinook Salmon", peakMonth: 9, latPref: 45, lagWeeks: 8 },
  { sci: "Thunnus alalunga", common: "Albacore Tuna", peakMonth: 8, latPref: 41, lagWeeks: 7 },
  { sci: "Scomber japonicus", common: "Pacific Mackerel", peakMonth: 7, latPref: 34, lagWeeks: 5 },
];

const COAST_PROFILE: Array<[number, number]> = [
  [32.5, -117.1], [33.5, -117.8], [34.5, -120.5], [35.5, -121.0],
  [36.5, -121.9], [37.5, -122.5], [38.5, -123.7], [39.5, -123.8],
  [40.5, -124.4], [41.5, -124.2], [42.5, -124.4], [43.5, -124.3],
  [44.5, -124.1], [45.5, -124.0], [46.5, -124.0], [47.5, -124.5],
  [48.5, -124.7],
];

function coastLngAt(lat: number): number {
  for (let i = 0; i < COAST_PROFILE.length - 1; i++) {
    const [la, lo] = COAST_PROFILE[i];
    const [lb, lob] = COAST_PROFILE[i + 1];
    if (lat >= la && lat <= lb) {
      const t = (lat - la) / (lb - la);
      return lo + (lob - lo) * t;
    }
  }
  return COAST_PROFILE[COAST_PROFILE.length - 1][1];
}

function hash(x: number, y: number, z: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return n - Math.floor(n);
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

export function regionName(lat: number, lng: number): string {
  if (lat < 33.5) return "San Diego Bight";
  if (lat < 34.5) return "Southern California Bight";
  if (lat < 36) return "Central California Coast";
  if (lat < 37.5) return "Monterey Bay";
  if (lat < 38.5) return "Gulf of the Farallones";
  if (lat < 40) return "Mendocino Coast";
  if (lat < 42) return "Cape Mendocino";
  if (lat < 44) return "Southern Oregon Coast";
  if (lat < 46) return "Central Oregon Coast";
  if (lat < 47.5) return "Columbia River Mouth";
  return "Olympic Coast";
}

function predictTile(lat: number, lng: number, month: number) {
  const coast = coastLngAt(lat);
  const offshoreDeg = coast - lng;
  const offshoreScore = Math.max(0, 1 - Math.abs(offshoreDeg - 0.6) / 1.0);

  let bestScore = 0;
  let bestSpecies = SPECIES[0];
  let avgScore = 0;
  for (const s of SPECIES) {
    const monthDelta = Math.min(
      Math.abs(month - s.peakMonth),
      12 - Math.abs(month - s.peakMonth),
    );
    const monthScore = 1 - monthDelta / 6;
    const latScore = 1 - Math.min(Math.abs(lat - s.latPref) / 8, 1);
    const noise = hash(lat * 10, lng * 10, s.peakMonth) * 0.3;
    const score = clamp01(monthScore * 0.5 + latScore * 0.3 + noise * 0.2);
    avgScore += score;
    if (score > bestScore) {
      bestScore = score;
      bestSpecies = s;
    }
  }
  avgScore /= SPECIES.length;

  const predictedYield = clamp01(avgScore * 0.6 + bestScore * 0.4) * offshoreScore;
  const confidence = clamp01(0.55 + hash(lat, lng, month + 99) * 0.4);

  return { predictedYield, confidence, bestSpecies, bestScore };
}

export async function getPredictionGrid(month: number): Promise<PredictionTile[]> {
  const tiles: PredictionTile[] = [];
  const step = 0.15;
  for (let lat = WEST_COAST_BBOX.minLat; lat <= WEST_COAST_BBOX.maxLat; lat += step) {
    const coast = coastLngAt(lat);
    for (let lng = coast - 1.6; lng <= coast - 0.05; lng += step) {
      const { predictedYield, confidence, bestSpecies } = predictTile(lat, lng, month);
      if (predictedYield < 0.08) continue;
      tiles.push({
        id: `${lat.toFixed(2)}_${lng.toFixed(2)}_${month}`,
        lat,
        lng,
        month,
        predictedYield,
        confidence,
        topSpecies: bestSpecies.common,
      });
    }
  }
  return tiles;
}

function yieldLevelFromScore(score: number): YieldLevel {
  if (score > 0.62) return "high";
  if (score > 0.35) return "moderate";
  return "low";
}

function speciesForecast(
  s: (typeof SPECIES)[number],
  lat: number,
  lng: number,
  month: number,
  baseDate: Date,
): SpeciesForecast {
  const monthDelta = Math.min(
    Math.abs(month - s.peakMonth),
    12 - Math.abs(month - s.peakMonth),
  );
  const monthScore = 1 - monthDelta / 6;
  const latScore = 1 - Math.min(Math.abs(lat - s.latPref) / 8, 1);
  const noise = hash(lat * 10, lng * 10, s.peakMonth);
  const score = clamp01(monthScore * 0.55 + latScore * 0.3 + noise * 0.15);
  const confidence = clamp01(0.55 + hash(lat + 1, lng - 1, s.peakMonth) * 0.4);
  const yieldEstimateKg = Math.round(score * 1800 * (0.6 + noise * 0.8));

  const dayOffset = Math.floor(hash(lat, lng, s.peakMonth + 7) * 14);
  const bestDay = new Date(baseDate);
  bestDay.setDate(bestDay.getDate() + dayOffset);

  return {
    scientificName: s.sci,
    commonName: s.common,
    yieldLevel: yieldLevelFromScore(score),
    yieldEstimateKg,
    confidence,
    bestDayISO: bestDay.toISOString().slice(0, 10),
    explanation: buildExplanation(s, score, monthDelta),
  };
}

function buildExplanation(
  s: (typeof SPECIES)[number],
  score: number,
  monthDelta: number,
): string {
  if (score > 0.6) {
    return `Elevated larvae signal observed ${s.lagWeeks} weeks prior; historical lag→catch correlation is strong for ${s.common} in this region.`;
  }
  if (score > 0.35) {
    return `Moderate larvae density observed ~${s.lagWeeks} weeks ago. Conditions are workable but yields are typically ${monthDelta < 2 ? "near-peak" : "off-peak"}.`;
  }
  return `Larvae signals are weak relative to historical baselines; ${s.common} catch is unlikely to justify a targeted trip.`;
}

export async function getRegionDetail(
  lat: number,
  lng: number,
  month: number,
): Promise<RegionDetail> {
  const baseDate = new Date(new Date().getFullYear(), month - 1, 1);
  const species = SPECIES.map((s) => speciesForecast(s, lat, lng, month, baseDate)).sort(
    (a, b) => b.yieldEstimateKg - a.yieldEstimateKg,
  );

  const top = species[0];
  const tile = predictTile(lat, lng, month);
  const startDay = Math.max(1, Math.floor(hash(lat, lng, month) * 20) + 1);
  const start = new Date(baseDate);
  start.setDate(startDay);
  const end = new Date(start);
  end.setDate(end.getDate() + 14);

  return {
    id: `${lat.toFixed(2)}_${lng.toFixed(2)}_${month}`,
    lat,
    lng,
    month,
    regionName: regionName(lat, lng),
    overallYield: yieldLevelFromScore(tile.predictedYield),
    overallConfidence: tile.confidence,
    bestWindow: {
      startISO: start.toISOString().slice(0, 10),
      endISO: end.toISOString().slice(0, 10),
    },
    species,
    summary: `Model output integrates larvae density observations from ${SPECIES[0].lagWeeks}–${SPECIES[3].lagWeeks} weeks prior with historical trawl-set catch records. Top opportunity: ${top.commonName}.`,
  };
}
