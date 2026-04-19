export type SpeciesForecast = {
  name: string;
  emoji: string;
  yield: number; // 0..1
  confidence: number; // 0..1
  optimalWindow: { start: string; end: string }; // ISO date
  peakMonth: string; // e.g. "July"
  explanation: string;
};

export type Zone = {
  id: string;
  name: string;
  region: "California" | "Oregon" | "Washington";
  // Projected SVG coords on a 100x140 viewBox (West Coast portrait)
  x: number;
  y: number;
  lat: number;
  lon: number;
  yield: number;
  confidence: number;
  species: SpeciesForecast[];
  summary: string;
};

// Pacific species native to the US West Coast
const PACIFIC_SPECIES = [
  { name: "Pacific Sardine", emoji: "🐟", months: [5, 6, 7, 8] },
  { name: "Northern Anchovy", emoji: "🐠", months: [4, 5, 6, 7] },
  { name: "Chinook Salmon", emoji: "🐟", months: [5, 6, 7, 8, 9] },
  { name: "Coho Salmon", emoji: "🐡", months: [7, 8, 9] },
  { name: "Albacore Tuna", emoji: "🦈", months: [6, 7, 8, 9] },
  { name: "Pacific Halibut", emoji: "🐟", months: [4, 5, 6, 7] },
  { name: "Dungeness Crab", emoji: "🦀", months: [10, 11, 0, 1] },
  { name: "Market Squid", emoji: "🦑", months: [3, 4, 5, 9, 10] },
  { name: "Pacific Hake", emoji: "🐟", months: [5, 6, 7, 8] },
  { name: "Rockfish", emoji: "🐠", months: [4, 5, 6, 7, 8] },
];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function rand(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function makeWindow(seed: number, peakMonthIdx: number): { start: string; end: string } {
  const year = 2026;
  const start = new Date(year, peakMonthIdx, 1 + Math.floor(rand(seed) * 10));
  const end = new Date(start);
  end.setDate(start.getDate() + 14 + Math.floor(rand(seed + 1) * 18));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

/**
 * Hand-tuned ocean cells along the US West Coast.
 * Each cell sits west of the coastline silhouette at a real lat/lon.
 * Coordinates project onto a 100×140 SVG viewBox where:
 *   x: 0 (Pacific) → 100 (inland)
 *   y: 0 (Washington / north) → 140 (Baja border / south)
 */
type Seed = {
  region: Zone["region"];
  lat: number;
  lon: number;
  x: number;
  y: number;
  label: string;
};

const SEEDS: Seed[] = [
  // Washington
  { region: "Washington", lat: 48.4, lon: -125.0, x: 38, y: 8, label: "Cape Flattery" },
  { region: "Washington", lat: 48.0, lon: -125.5, x: 32, y: 14, label: "Olympic Shelf" },
  { region: "Washington", lat: 47.3, lon: -125.2, x: 36, y: 20, label: "Grays Harbor" },
  { region: "Washington", lat: 46.6, lon: -124.7, x: 42, y: 26, label: "Columbia Mouth" },

  // Oregon
  { region: "Oregon", lat: 46.0, lon: -125.0, x: 38, y: 32, label: "Astoria Bank" },
  { region: "Oregon", lat: 45.3, lon: -124.6, x: 44, y: 38, label: "Tillamook" },
  { region: "Oregon", lat: 44.6, lon: -124.8, x: 41, y: 44, label: "Newport Shelf" },
  { region: "Oregon", lat: 43.9, lon: -125.0, x: 38, y: 50, label: "Heceta Bank" },
  { region: "Oregon", lat: 43.2, lon: -124.7, x: 43, y: 56, label: "Coos Bay" },
  { region: "Oregon", lat: 42.4, lon: -125.0, x: 39, y: 62, label: "Cape Blanco" },

  // Northern California
  { region: "California", lat: 41.5, lon: -124.8, x: 42, y: 68, label: "Crescent City" },
  { region: "California", lat: 40.6, lon: -124.9, x: 41, y: 74, label: "Eureka Shelf" },
  { region: "California", lat: 39.7, lon: -124.4, x: 48, y: 80, label: "Mendocino" },
  { region: "California", lat: 38.7, lon: -124.0, x: 53, y: 86, label: "Point Arena" },

  // Central California
  { region: "California", lat: 37.8, lon: -123.5, x: 58, y: 92, label: "Farallones" },
  { region: "California", lat: 37.0, lon: -123.0, x: 62, y: 98, label: "Half Moon Bay" },
  { region: "California", lat: 36.5, lon: -122.5, x: 66, y: 104, label: "Monterey Bay" },
  { region: "California", lat: 35.8, lon: -122.0, x: 70, y: 110, label: "Big Sur" },

  // Southern California
  { region: "California", lat: 35.0, lon: -121.5, x: 73, y: 116, label: "Morro Bay" },
  { region: "California", lat: 34.3, lon: -120.7, x: 78, y: 122, label: "Channel Islands" },
  { region: "California", lat: 33.6, lon: -119.5, x: 84, y: 126, label: "Santa Catalina" },
  { region: "California", lat: 32.9, lon: -118.2, x: 88, y: 132, label: "San Diego Bight" },
];

export const ZONES: Zone[] = SEEDS.map((s, i) => {
  const seed = i * 13 + 7;
  const baseYield = 0.35 + rand(seed) * 0.6;
  const baseConf = 0.55 + rand(seed + 100) * 0.42;

  const speciesCount = 3 + Math.floor(rand(seed + 50) * 2);
  const used = new Set<number>();
  const speciesList: SpeciesForecast[] = [];

  for (let j = 0; j < speciesCount; j++) {
    let idx = Math.floor(rand(seed + j * 11) * PACIFIC_SPECIES.length);
    while (used.has(idx)) idx = (idx + 1) % PACIFIC_SPECIES.length;
    used.add(idx);
    const sp = PACIFIC_SPECIES[idx];
    const peakMonthIdx = sp.months[Math.floor(rand(seed + j * 7) * sp.months.length)];
    const sy = Math.min(1, Math.max(0.1, baseYield + (rand(seed + j * 31) - 0.5) * 0.35));
    const sc = Math.min(0.98, Math.max(0.45, baseConf + (rand(seed + j * 17) - 0.5) * 0.18));
    const corr = (0.62 + rand(seed + j) * 0.32).toFixed(2);

    speciesList.push({
      name: sp.name,
      emoji: sp.emoji,
      yield: sy,
      confidence: sc,
      optimalWindow: makeWindow(seed + j * 23, peakMonthIdx),
      peakMonth: MONTH_NAMES[peakMonthIdx],
      explanation: `Larval density spike detected ~5 weeks upstream in adjacent sector. Sea surface temperature anomaly +0.${Math.floor(rand(seed + j) * 9)}°C aligns with prior ${MONTH_NAMES[peakMonthIdx]} aggregations. Historical r=${corr} between this biological precursor and commercial landings here.`,
    });
  }
  speciesList.sort((a, b) => b.yield * b.confidence - a.yield * a.confidence);

  return {
    id: `WC-${String(i + 1).padStart(2, "0")}`,
    name: s.label,
    region: s.region,
    x: s.x,
    y: s.y,
    lat: s.lat,
    lon: s.lon,
    yield: baseYield,
    confidence: baseConf,
    species: speciesList,
    summary: `High-probability window for ${speciesList[0].name} based on upstream larval signals.`,
  };
});

export function yieldColor(v: number): string {
  if (v < 0.3) return "var(--yield-1)";
  if (v < 0.5) return "var(--yield-2)";
  if (v < 0.7) return "var(--yield-3)";
  if (v < 0.85) return "var(--yield-4)";
  return "var(--yield-5)";
}

export function getZoneById(id: string): Zone | undefined {
  return ZONES.find((z) => z.id === id);
}
