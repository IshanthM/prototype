# Codex RoboIterate Build Prompt

Date captured: 2026-07-07

This file replaces the previous manufacturing-release-agent specification. The governing scope is now a robotics iteration copilot for STL/STEP parts, DFM checks, local suppliers, quote requests, and iteration-speed proof.

## Governing Instruction

Build a secure, tested MVP for RoboIterate under `/Users/ishanthmovva/code/hardware`.

The product must help robotics teams upload STL/STEP parts, understand basic shape facts, catch common fabrication problems, choose a likely process, generate quote requests for local suppliers, and track iteration speed.

## Implementation Requirements

- Use React/Vite for the frontend.
- Use Python/FastAPI/Pydantic for the backend.
- Keep dependencies modest.
- Run tests after backend changes.
- Run frontend build after UI changes.
- Keep file handling safe: extension allowlist, size limits, generated storage names, hashes, no execution.
- Record uncertain assumptions rather than pretending DFM estimates are precise.

## Product Requirements

The MVP must include:

- Public landing page with product explanation and waitlist form.
- Dashboard app for projects, parts, revisions, DFM findings, supplier options, quote request draft, and iteration metrics.
- STL/STEP upload.
- Deterministic robotics DFM checks.
- Process recommendation among FDM, CNC, and laser cutting.
- Local supplier directory that the founder can edit through an API/UI.
- Quote request generation.
- Version history and average iteration time.

## DFM Rules

Initial deterministic checks should cover:

- Thin walls.
- Very small holes.
- Holes close to edge.
- Large flat FDM parts that may warp.
- Long overhang/support risk for FDM.
- CNC internal-corner/radius caution when STEP text suggests pockets or inside corners.
- Laser-cut suitability when the part looks flat/sheet-like or filename says plate/panel.
- Unknown geometry limitations.

Rules may use conservative heuristics. Every estimate must state its basis and limitation.

## Non-Goals

- No supplier marketplace.
- No instant binding quote.
- No automatic ordering.
- No automatic CAD modification.
- No manufacturing certification.
- No safety-critical claims.
- No custom model training.

