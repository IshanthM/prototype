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

On Vercel, local JSON storage defaults to `/tmp/roboiterate-data` so uploads and
demo records can be written by the serverless function. That storage is
ephemeral; a production version should move projects, uploads, and quote logs to
Postgres plus object storage.

Open `http://127.0.0.1:3000`.

## Test

```bash
npm run smoke
```

This runs backend regression tests, TypeScript type checking, and the Vite production build.

## Deployment Diagnosis Notes

- Frontend API base is intentionally same-origin `"/api"`; Vercel has no required API-base environment variable.
- Vercel serves FastAPI through `api/index.py` as a Python serverless function, not a persistent server.
- The demo upload flow now creates/selects a project before analysis, surfaces API failures visibly, and keeps the Analyze Part action disabled only until a file is present.
- Vercel JSON storage is writable under `/tmp/roboiterate-data` but ephemeral. Use hosted Postgres and object storage before relying on production persistence.

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
