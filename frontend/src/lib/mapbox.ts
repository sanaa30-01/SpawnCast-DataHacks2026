// Mapbox public access token (pk.*). Set in frontend/.env as VITE_MAPBOX_TOKEN (see .env.example).
// Do not commit real tokens; GitHub push protection flags them.
export const MAPBOX_TOKEN = (import.meta.env.VITE_MAPBOX_TOKEN as string | undefined)?.trim() ?? "";

export const WEST_COAST_BBOX = {
  minLng: -127,
  maxLng: -116.5,
  minLat: 32.2,
  maxLat: 49,
};

export const INITIAL_VIEW_STATE = {
  longitude: -122,
  latitude: 40.5,
  zoom: 4.5,
};
