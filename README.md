# SpawnCast-DataHacks2026

FastAPI app and data live in **`backend/`**. From there: `uvicorn main:app --reload`.

Frontend (Vite) lives in **`frontend/`**. Install deps with `npm install --prefix frontend` (or `cd frontend && npm install`). Then either `cd frontend && npm run dev` **or**, from the repo root, `npm run dev` (root `package.json` forwards to the frontend). Set `VITE_MAPBOX_TOKEN` in `frontend/.env`; see `frontend/.env.example`.

Trip Planner calls **`POST http://127.0.0.1:8000/planner/recommendations`** (same host in dev via `frontend/src/lib/api.ts`) using `output/intelligence.json` plus optional Gemini text for top ranks. Run the API on port **8000** before generating a plan.
