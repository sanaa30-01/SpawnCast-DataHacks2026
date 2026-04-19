import rawData from "@/data/intelligence.json";

export interface IntelligenceRecord {
  region_id: string;
  lat_x: number;
  lon_x: number;
  species: string[];
  fish_month_str: string;
  seasonal_score: number;
  yield_x: "high" | "medium" | "low";
  confidence: number;
  scientificName_x: string[];
  yield_y: "high" | "medium" | "low";
  pred_prob_x: number;
  lat_y: number;
  lon_y: number;
  scientificName_y: string[];
  yield: "high" | "medium" | "low";
  pred_prob_y: number;
  lat: number;
  lon: number;
}

export const intelligenceData = rawData as IntelligenceRecord[];

export function getActiveSectors(data: IntelligenceRecord[] = intelligenceData): number {
  return new Set(data.map((d) => d.region_id)).size;
}

export function getAvgConfidence(data: IntelligenceRecord[] = intelligenceData): number {
  if (data.length === 0) return 0;
  const sum = data.reduce((acc, d) => acc + (d.confidence ?? 0), 0);
  return (sum / data.length) * 100;
}
