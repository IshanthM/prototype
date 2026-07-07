# Phase Log

## Revamp Gate

Status: Complete

Changes:

- Replaced manufacturing release-agent scope with RoboIterate robotics iteration-copilot scope.
- Installed relevant skills: `playwright`, `screenshot`, `pdf`, `security-best-practices`, and `security-threat-model`.
- Noted that newly installed skills require Codex restart to be picked up automatically.

## Implementation

Status: Complete

Changes:

- Replaced backend with robotics project, part upload, DFM, supplier, quote, waitlist, and metrics APIs.
- Replaced tests with STL/STEP robotics workflow coverage.
- Replaced frontend with RoboIterate landing page and dashboard.
- Added generated dashboard/landing visual assets in `public/assets/`.

Validation:

- `npm test` passed: 4 tests.
- `npm run smoke` passed: backend tests plus Vite production build.

Known limitations:

- DFM analysis is heuristic and must be validated with real robot parts.
- Binary STL parsing supports bounding boxes but not feature recognition.
- STEP parsing is text/point based, not full OpenCascade B-rep analysis.
- Supplier directory uses seeded placeholder contacts until the founder enters real shops.

## Deployment Repair

Status: Complete and redeployed to production.

Diagnosis:

- The deployed frontend bundle used same-origin `/api`, not localhost or an unset environment variable.
- Vercel had no API-base environment variables configured, which is expected for same-origin API routing.
- FastAPI was deployed as Vercel function `api/index`; direct production `POST /api/projects` and STL upload both returned real data.
- The failing user path was a dashboard state bug: the landing CTA opened an upload screen with no selected project, leaving Analyze Part disabled with no useful guidance.
- The old app did not visually match the dashboard mockup; it used small generic cards instead of the rail/table/inspector layout shown in the screenshot.

Changes:

- Reworked the dashboard to match the mockup structure: dark project rail, top status bar, model preview, geometry facts, findings table, process cards, supplier table, iteration timeline, and finding inspector.
- Added project auto-creation/selection for the demo upload path.
- Added visible API error handling instead of silent failures.
- Added explicit TypeScript type checking to the smoke script.

Validation:

- `npm run smoke` passed: backend tests, type check, and Vite production build.
- Local Playwright flow uploaded a sample STL through the UI, rendered DFM findings, populated the inspector, and drafted a quote request through the backend.
- Production Playwright flow at `https://prototype-rho-khaki.vercel.app` uploaded a sample STL, received real geometry/finding JSON, rendered the inspector, and drafted a quote request with no failed API calls.
