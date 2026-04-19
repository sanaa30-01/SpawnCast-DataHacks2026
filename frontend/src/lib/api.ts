/** FastAPI base URL for browser fetches. */
export function resolveApiBase(): string | null {
  const v = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  if (v === "") return null;
  if (v) return v.replace(/\/$/, "");
  if (import.meta.env.DEV) return "http://127.0.0.1:8000";
  return null;
}
