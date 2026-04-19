export type TripItem = {
  zoneId: string;
  zoneName: string;
  lat: number;
  lon: number;
  species: string;
  emoji: string;
  yield: number;
  confidence: number;
  windowStart: string;
  windowEnd: string;
  explanation: string;
  addedAt: number;
};

const KEY = "precision-fishing.trip-items";

export function getTripItems(): TripItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as TripItem[]) : [];
  } catch {
    return [];
  }
}

export function addTripItem(item: TripItem): TripItem[] {
  const items = getTripItems();
  // de-dupe by zone+species
  const filtered = items.filter((i) => !(i.zoneId === item.zoneId && i.species === item.species));
  const next = [item, ...filtered].slice(0, 50);
  window.localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("trip-items-changed"));
  return next;
}

export function removeTripItem(zoneId: string, species: string): TripItem[] {
  const items = getTripItems().filter((i) => !(i.zoneId === zoneId && i.species === species));
  window.localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent("trip-items-changed"));
  return items;
}

export function clearTripItems() {
  window.localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent("trip-items-changed"));
}
