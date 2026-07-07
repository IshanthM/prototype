# Architecture Decision Records

## ADR-001: Robotics Niche First

Status: Accepted

Decision: Target robotics teams and early robot startups instead of general manufacturing buyers.

Reason: The founder has stronger domain understanding here, and broad instant quoting is already crowded.

## ADR-002: STL and STEP Input

Status: Accepted

Decision: Support STL and STEP uploads in the MVP.

Reason: Robotics teams commonly export both. STL is common for 3D printing; STEP is better for CNC/manufacturing exchange.

## ADR-003: Heuristic DFM Rules

Status: Accepted

Decision: Use deterministic heuristics with explicit limitations.

Reason: Reliable geometry and manufacturing certainty require more data and kernel-level analysis than the one-week MVP allows.

## ADR-004: Local Storage for MVP

Status: Accepted for MVP

Decision: Use local JSON/file storage behind service functions.

Reason: Keeps development fast and testable. The boundary allows PostgreSQL/object storage later.

## ADR-005: Process Recommendation Is Advisory

Status: Accepted

Decision: Recommend FDM, CNC, or laser cutting as an estimate, not a binding quote or certification.

Reason: Supplier capabilities vary, and the MVP does not know real machine constraints.

