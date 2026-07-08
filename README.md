# RoboIterate

Iteration copilot for robotics teams that need faster CAD-to-part loops.

RoboIterate lets a team upload an STL or STEP robot part, see basic shape facts, review deterministic DFM warnings, choose a likely fabrication process, generate a local supplier quote request, and track how fast each revision moves.

## Run

```bash
npm run backend:dev
npm run web
```

## Vercel deployment

The Vercel adapter exposes the existing FastAPI app through `api/index.py` and
keeps the Vite frontend as the static build. Vercel runtime dependencies are in
`requirements.txt`.

**Required for any deployed environment: set a `DATABASE_URL` environment
variable in your Vercel project settings.** Without it, all project/part/
supplier/quote data falls back to local JSON files under
`/tmp/roboiterate-data`, and Vercel does not guarantee `/tmp` persists between
separate serverless invocations -- data can silently disappear between
requests (this was the root cause of uploads appearing to do nothing).

To set this up:
1. Create a free Postgres database (e.g. [Supabase](https://supabase.com),
   [Neon](https://neon.tech), or Vercel's own Postgres integration).
2. Copy its connection string.
3. In your Vercel project -> Settings -> Environment Variables, add
   `DATABASE_URL` with that connection string.
4. Redeploy. On first request, the app automatically creates the table it
   needs (`roboiterate_records`) -- no manual migration step required.

If `DATABASE_URL` is not set (e.g. running locally via `npm run backend:dev`),
the app automatically falls back to local JSON file storage under `data/`, so
local development and `pytest` require no database setup at all.

Also set `ALLOWED_ORIGINS` (comma-separated, e.g.
`https://your-deployed-domain.vercel.app`) if you deploy under a custom
domain -- Vercel preview-deployment URLs (`*.vercel.app`) are already allowed
automatically.

Open `http://127.0.0.1:3000`.

## Test

```bash
npm run smoke
```

This runs backend regression tests, TypeScript type checking, and the Vite production build.

## Deployment Diagnosis Notes

- Frontend API base is intentionally same-origin `"/api"`; Vercel has no required API-base environment variable.
- Vercel serves FastAPI through `api/index.py` as a Python serverless function, not a persistent server.
- The demo upload flow creates/selects a project before analysis, surfaces API failures visibly, and keeps the Analyze Part action disabled only until a file is present.
- **Fixed:** all project/part/supplier/quote metadata now persists to Postgres
  (`backend/app/storage.py`) whenever `DATABASE_URL` is set, instead of
  relying on ephemeral `/tmp` files. See the Vercel deployment section above
  for setup. The raw uploaded CAD file bytes themselves are still written to
  `/tmp` during upload, which is fine -- nothing reads them back in a later
  request, they're only used within the single request that analyzes them.
- CORS now allows the actual deployed domain (via `ALLOWED_ORIGINS`) and any
  `*.vercel.app` preview deployment, not just `localhost`.
- The landing page's hero visual is a real, reproducible example of the DFM
  engine's actual output for the bundled sample file, not a static mockup
  image -- clicking "Try it live with this file" runs the real pipeline.

## Current Scope

Included:

- STL/STEP upload and hashing
- Basic STL/STEP metadata extraction
- Robotics-focused DFM heuristics
- FDM/CNC/laser process recommendation
- Local supplier directory
- Quote request generation
- Iteration dashboard
- Landing page and waitlist capture

Limitations:

- Geometry analysis is heuristic, not certified manufacturability analysis.
- Binary STL bounding boxes are not fully parsed yet.
- No production authentication.
- No real supplier network or payments.
