# RIE Dashboard

Operational front-end for the RIE (Restauration Intérieure & Environnement) project — BNP Paribas El Djazaïr. It provides a clean view of attendance, kitchen activity, forecasting, menus planning, and waste tracking for the local canteen.

## Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS
- shadcn-inspired UI primitives
- Data served from the local FastAPI backend (`../api`)

## Architecture

This is a **local desktop-oriented** application. The dashboard is served by, and talks exclusively to, the local FastAPI backend in the repository root — there is no external SaaS or web-hosting dependency (no Supabase, no Netlify).

- Frontend: this Next.js app (`dashboard/`)
- Backend: FastAPI app (`api/` at the repo root), including `/api/forecast` and `/api/menus`
- Packaging target: desktop app (Electron) running fully locally

## Local development

```bash
# 1. Start the FastAPI backend from the repo root
.\.venv\Scripts\python.exe -m uvicorn api.main:app --port 8000

# 2. In another terminal, run the dashboard
cd dashboard
npm install
npm run dev
```

Then open http://localhost:3000. The dashboard proxies API calls to the backend (see `next.config` and `lib/api.ts`).

## Scripts

- `npm run dev` — development server
- `npm run build` — production build
- `npm run start` — serve production build
- `npm run lint` — ESLint
- `npm run typecheck` — `tsc --noEmit`

## Project purpose

This app supports internal monitoring and operational decision-making for the canteen and related resource-planning workflows (forecasting, menus planning, waste tracking, and weekly reporting).
