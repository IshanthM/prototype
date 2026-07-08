from __future__ import annotations

import hashlib
import math
import re
import struct
from pathlib import Path
from typing import Iterable, List, Optional, Tuple

from fastapi import UploadFile

from .models import (
    BoundingBox,
    DfmFinding,
    FileFormat,
    FindingStatus,
    GeometrySummary,
    IterationMetrics,
    Process,
    ProcessRecommendation,
    ProjectRecord,
    QuoteRequest,
    Severity,
    SupplierCreate,
    SupplierRecord,
    UploadedPart,
    WaitlistSignup,
)
from .storage import (
    new_id,
    part_upload_dir,
    read_model,
    list_models,
    utc_now,
    write_model,
)


MAX_UPLOAD_BYTES = 40 * 1024 * 1024
ALLOWED_SUFFIXES = {".stl", ".step", ".stp"}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_upload(upload: UploadFile) -> FileFormat:
    suffix = Path(upload.filename or "").suffix.lower()
    if suffix not in ALLOWED_SUFFIXES:
        raise ValueError(f"Unsupported file extension: {suffix}")
    head = upload.file.read(2048)
    upload.file.seek(0)
    if suffix == ".stl":
        if not (head[:5].lower() == b"solid" or len(head) >= 84):
            raise ValueError("Invalid STL signature")
        return FileFormat.stl
    if b"ISO-10303-21" not in head.upper():
        raise ValueError("Invalid STEP signature")
    return FileFormat.step


def write_upload(upload: UploadFile, destination: Path) -> int:
    size = 0
    with destination.open("xb") as handle:
        while True:
            chunk = upload.file.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > MAX_UPLOAD_BYTES:
                handle.close()
                destination.unlink(missing_ok=True)
                raise ValueError("File exceeds 40 MB MVP limit")
            handle.write(chunk)
    upload.file.seek(0)
    return size


def create_default_suppliers() -> List[SupplierRecord]:
    existing = list_models("supplier", SupplierRecord)
    if existing:
        return existing
    defaults = [
        SupplierCreate(
            name="Campus Makerspace",
            contact="makerspace@example.edu",
            location="Local university lab",
            processes=[Process.fdm, Process.laser],
            typical_turnaround_days="1-3",
            rate_notes="Student-accessible; material cost plus machine time.",
            notes="Best for quick plastic prototypes and flat sheet plates.",
        ),
        SupplierCreate(
            name="Rapid Robotics CNC",
            contact="quotes@rapidroboticscnc.example",
            location="Metro area machine shop",
            processes=[Process.cnc],
            typical_turnaround_days="3-7",
            rate_notes="Setup fee plus hourly machining.",
            notes="Best for aluminum brackets, gearbox plates, and bearing blocks.",
        ),
        SupplierCreate(
            name="Neighborhood Fab Lab",
            contact="hello@neighborhoodfablab.example",
            location="Local makerspace",
            processes=[Process.fdm, Process.laser, Process.cnc],
            typical_turnaround_days="2-5",
            rate_notes="Member rates available.",
            notes="Mixed equipment; call before sending tight-tolerance parts.",
        ),
    ]
    records = []
    for payload in defaults:
        records.append(create_supplier(payload))
    return records


def create_supplier(payload: SupplierCreate) -> SupplierRecord:
    now = utc_now()
    supplier = SupplierRecord(id=new_id("sup"), created_at=now, updated_at=now, **payload.model_dump())
    write_model("supplier", supplier)
    return supplier


def upload_part(project: ProjectRecord, upload: UploadFile, part_name: str, revision: str) -> UploadedPart:
    file_format = validate_upload(upload)
    part_id = new_id("part")
    suffix = Path(upload.filename or "").suffix.lower()
    stored_filename = f"{part_id}{suffix}"
    destination = part_upload_dir(part_id) / stored_filename
    size = write_upload(upload, destination)
    digest = sha256_file(destination)
    geometry = analyze_geometry(destination, file_format, upload.filename or stored_filename)
    findings = run_dfm_rules(geometry, upload.filename or stored_filename)
    recommendation = recommend_process(geometry, findings, upload.filename or "")
    part = UploadedPart(
        id=part_id,
        project_id=project.id,
        part_name=part_name,
        revision=revision,
        original_filename=Path(upload.filename or stored_filename).name,
        stored_filename=stored_filename,
        sha256=digest,
        size_bytes=size,
        uploaded_at=utc_now(),
        geometry=geometry,
        findings=findings,
        recommendation=recommendation,
    )
    write_model("part", part)
    return part


def analyze_geometry(path: Path, file_format: FileFormat, original_filename: str) -> GeometrySummary:
    if file_format == FileFormat.stl:
        return analyze_stl(path, original_filename)
    return analyze_step(path, original_filename)


def bbox_from_points(points: Iterable[Tuple[float, float, float]]) -> Optional[BoundingBox]:
    points = list(points)
    if not points:
        return None
    xs, ys, zs = zip(*points)
    return BoundingBox(min_x=min(xs), min_y=min(ys), min_z=min(zs), max_x=max(xs), max_y=max(ys), max_z=max(zs))


def dimensions(box: Optional[BoundingBox]) -> dict:
    if not box:
        return {}
    return {
        "x": round(box.max_x - box.min_x, 3),
        "y": round(box.max_y - box.min_y, 3),
        "z": round(box.max_z - box.min_z, 3),
    }


def analyze_stl(path: Path, original_filename: str) -> GeometrySummary:
    data = path.read_bytes()
    limitations: List[str] = []
    feature_signals: List[str] = []
    points: List[Tuple[float, float, float]] = []
    triangle_count: Optional[int] = None

    if data[:5].lower() == b"solid" and b"facet" in data[:4096].lower():
        text = data.decode(errors="ignore")
        for match in re.finditer(r"vertex\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)", text):
            points.append((float(match.group(1)), float(match.group(2)), float(match.group(3))))
        triangle_count = len(re.findall(r"\bfacet\s+normal\b", text, re.IGNORECASE))
        limitations.append("ASCII STL has triangles only; wall thickness and holes are heuristic.")
    elif len(data) >= 84:
        triangle_count = struct.unpack("<I", data[80:84])[0]
        expected = 84 + triangle_count * 50
        if expected <= len(data):
            offset = 84
            for _ in range(triangle_count):
                offset += 12
                for _vertex in range(3):
                    points.append(struct.unpack("<fff", data[offset : offset + 12]))
                    offset += 12
                offset += 2
            limitations.append("Binary STL parsed for bounding box; feature recognition remains heuristic.")
        else:
            limitations.append("Binary STL length did not match triangle count; bounding box unavailable.")

    name = original_filename.lower()
    if any(token in name for token in ["plate", "panel", "gusset"]):
        feature_signals.append("filename suggests flat sheet-like part")
    if any(token in name for token in ["hole", "bolt", "mount"]):
        feature_signals.append("filename suggests mounting holes")
    if "thin" in name:
        feature_signals.append("filename suggests thin feature risk")

    box = bbox_from_points(points)
    return GeometrySummary(
        file_format=FileFormat.stl,
        units="unknown",
        bounding_box=box,
        dimensions_mm=dimensions(box),
        triangle_count=triangle_count,
        feature_signals=feature_signals,
        limitations=limitations or ["STL parser could not extract reliable geometry details."],
    )


def analyze_step(path: Path, original_filename: str) -> GeometrySummary:
    text = path.read_text(errors="ignore")[:300_000]
    points: List[Tuple[float, float, float]] = []
    for match in re.finditer(r"CARTESIAN_POINT\s*\([^,]*,\s*\(([-+0-9.eE]+),\s*([-+0-9.eE]+),\s*([-+0-9.eE]+)\)\)", text, re.IGNORECASE):
        points.append((float(match.group(1)), float(match.group(2)), float(match.group(3))))
    upper = text.upper()
    feature_signals: List[str] = []
    if "HOLE" in upper or "CYLINDRICAL_SURFACE" in upper:
        feature_signals.append("STEP text suggests holes or cylindrical faces")
    if "POCKET" in upper or "INSIDE" in upper:
        feature_signals.append("STEP text suggests pockets or internal features")
    if any(token in original_filename.lower() for token in ["plate", "panel", "gusset"]):
        feature_signals.append("filename suggests flat sheet-like part")
    units = "millimeter" if ".MILLI." in upper else "unknown"
    box = bbox_from_points(points)
    limitations = ["STEP header/text parsed without full OpenCascade B-rep analysis."]
    if not box:
        limitations.append("STEP Cartesian point bounding box unavailable in this file.")
    return GeometrySummary(
        file_format=FileFormat.step,
        units=units,
        bounding_box=box,
        dimensions_mm=dimensions(box),
        feature_signals=feature_signals,
        limitations=limitations,
    )


def add_finding(findings: List[DfmFinding], code: str, title: str, severity: Severity, description: str, suggested_fix: str, evidence: str, processes: List[Process]) -> None:
    findings.append(
        DfmFinding(
            id=new_id("dfm"),
            code=code,
            title=title,
            severity=severity,
            description=description,
            suggested_fix=suggested_fix,
            evidence=evidence,
            affected_processes=processes,
        )
    )


def run_dfm_rules(geometry: GeometrySummary, filename: str) -> List[DfmFinding]:
    findings: List[DfmFinding] = []
    dims = geometry.dimensions_mm
    values = sorted(dims.values()) if dims else []
    shortest = values[0] if values else None
    longest = values[-1] if values else None
    name = filename.lower()
    signals = " ".join(geometry.feature_signals).lower()

    if not dims:
        add_finding(findings, "GEOMETRY_LIMITED", "Geometry extraction is limited", Severity.info, "The MVP could not compute reliable dimensions from this file.", "Open in CAD and manually confirm size before fabrication.", "; ".join(geometry.limitations), [Process.fdm, Process.cnc, Process.laser])
        return findings

    if shortest is not None and shortest < 2.0:
        add_finding(findings, "THIN_FEATURE_RISK", "Thin feature risk", Severity.warning, "The smallest bounding dimension is under 2 mm. This may indicate a fragile wall, thin plate, or unit mismatch.", "Confirm units and increase critical wall thickness where possible.", f"Smallest dimension: {shortest} mm", [Process.fdm, Process.cnc])

    if shortest is not None and longest is not None and shortest <= 4.0 and longest >= 140:
        add_finding(findings, "FDM_WARP_RISK", "Large flat FDM warp risk", Severity.warning, "Large, thin parts tend to warp on common FDM printers.", "Consider laser-cut sheet, CNC plate, splitting the print, or adding ribs.", f"Dimensions: {dims}", [Process.fdm])

    if "hole" in name or "mount" in name or "holes" in signals:
        add_finding(findings, "HOLE_FIT_CHECK", "Hole fit should be checked", Severity.info, "The file appears to include mounting holes, but the MVP cannot validate hole diameter or edge distance yet.", "Check hole diameter, clearance, and distance to edge in CAD before ordering.", f"Signals: {filename}; {signals}", [Process.fdm, Process.cnc, Process.laser])

    if "thin" in name:
        add_finding(findings, "FILENAME_THIN_SIGNAL", "Filename flags a thin part", Severity.warning, "The filename suggests thin geometry. Treat the design as higher risk until a real wall-thickness check is available.", "Review wall thickness and orientation with your intended process.", filename, [Process.fdm, Process.cnc, Process.laser])

    if "pocket" in signals or "internal" in signals:
        add_finding(findings, "CNC_INTERNAL_RADIUS_CAUTION", "CNC internal corner caution", Severity.info, "Internal CNC corners require tool radius; sharp inside corners may be impossible without redesign.", "Add fillets compatible with available end mills or confirm shop tooling.", signals, [Process.cnc])

    if shortest is not None and shortest <= 6.0 and ("plate" in name or "panel" in name or "flat sheet" in signals):
        add_finding(findings, "LASER_SHEET_CANDIDATE", "Likely sheet fabrication candidate", Severity.info, "The part looks flat enough for laser/waterjet/router workflows if tolerances allow.", "Ask local shops whether laser-cut sheet is faster than machining or printing.", f"Dimensions: {dims}; signals: {signals}", [Process.laser])

    if geometry.units == "unknown":
        add_finding(findings, "UNKNOWN_UNITS", "Units are unknown", Severity.blocker, "The file format or metadata did not make units explicit.", "Confirm units before sending a quote request.", f"Format: {geometry.file_format.value}", [Process.fdm, Process.cnc, Process.laser])

    return findings


def recommend_process(geometry: GeometrySummary, findings: List[DfmFinding], filename: str) -> ProcessRecommendation:
    scores = {Process.fdm: 50, Process.cnc: 45, Process.laser: 35}
    dims = geometry.dimensions_mm
    values = sorted(dims.values()) if dims else []
    shortest = values[0] if values else None
    longest = values[-1] if values else None
    rationale: List[str] = []

    if geometry.file_format == FileFormat.stl:
        scores[Process.fdm] += 18
        rationale.append("STL is common for 3D printing workflows.")
    if geometry.file_format == FileFormat.step:
        scores[Process.cnc] += 18
        rationale.append("STEP is stronger for CNC quoting and manufacturing exchange.")
    if shortest is not None and longest is not None and shortest <= 6 and ("plate" in filename.lower() or longest / max(shortest, 0.1) > 20):
        scores[Process.laser] += 30
        rationale.append("Flat geometry looks suitable for sheet cutting.")
    if any(item.code == "FDM_WARP_RISK" for item in findings):
        scores[Process.fdm] -= 20
        scores[Process.laser] += 10
        rationale.append("FDM warp warning makes sheet or CNC more attractive.")
    if any(item.severity == Severity.blocker for item in findings):
        rationale.append("Resolve blocker findings before sending to any supplier.")

    primary = max(scores, key=scores.get)
    if primary == Process.fdm:
        cost = "$5-$40 prototype estimate"
        lead = "same day-3 days"
    elif primary == Process.laser:
        cost = "$20-$120 sheet estimate"
        lead = "1-5 days"
    else:
        cost = "$75-$350 CNC estimate"
        lead = "3-10 days"
    return ProcessRecommendation(
        primary_process=primary,
        scores=scores,
        rationale=rationale or ["Recommendation is based on limited geometry metadata."],
        rough_cost_band=cost,
        lead_time_days=lead,
        limitations=["This is not a binding quote. Supplier capabilities and material choices can dominate cost and lead time."],
    )


def matching_suppliers(part: UploadedPart) -> List[SupplierRecord]:
    create_default_suppliers()
    suppliers = list_models("supplier", SupplierRecord)
    return [supplier for supplier in suppliers if part.recommendation.primary_process in supplier.processes]


def generate_quote_request(part: UploadedPart, supplier: SupplierRecord) -> QuoteRequest:
    dims = part.geometry.dimensions_mm
    finding_summary = "; ".join(f"{item.severity.value}: {item.title}" for item in part.findings[:5]) or "No DFM warnings generated by MVP."
    message = (
        f"Hi {supplier.name},\n\n"
        f"Our robotics team would like a quote for {part.part_name} revision {part.revision}.\n"
        f"File: {part.original_filename}\n"
        f"SHA-256: {part.sha256}\n"
        f"Approx dimensions from MVP parser: {dims or 'unknown'} mm\n"
        f"Recommended process: {part.recommendation.primary_process.value}\n"
        f"DFM notes to review: {finding_summary}\n\n"
        "Please reply with price, lead time, material/process assumptions, and any design changes needed before fabrication.\n"
    )
    quote = QuoteRequest(id=new_id("quote"), part_id=part.id, supplier_id=supplier.id, generated_at=utc_now(), message=message)
    write_model("quote", quote)
    return quote


def update_finding_status(part: UploadedPart, finding_id: str, status: FindingStatus) -> UploadedPart:
    for finding in part.findings:
        if finding.id == finding_id:
            finding.status = status
            write_model("part", part)
            return part
    raise FileNotFoundError(finding_id)


def project_parts(project_id: str) -> List[UploadedPart]:
    parts = [part for part in list_models("part", UploadedPart) if part.project_id == project_id]
    return sorted(parts, key=lambda item: item.uploaded_at)


def compute_metrics(project: ProjectRecord) -> IterationMetrics:
    parts = project_parts(project.id)
    timestamps = [part.uploaded_at for part in parts]
    deltas = []
    for previous, current in zip(timestamps, timestamps[1:]):
        deltas.append((current - previous).total_seconds() / 3600)
    avg_hours = round(sum(deltas) / len(deltas), 2) if deltas else None
    baseline_hours = project.baseline_iteration_days * 24
    saved = round(((baseline_hours - avg_hours) / 24) * max(len(parts) - 1, 1), 2) if avg_hours is not None else None
    open_findings = sum(1 for part in parts for finding in part.findings if finding.status == FindingStatus.open)
    quotes = [quote for quote in list_models("quote", QuoteRequest) if any(part.id == quote.part_id for part in parts)]
    return IterationMetrics(
        project_id=project.id,
        revision_count=len(parts),
        average_hours_between_uploads=avg_hours,
        baseline_iteration_days=project.baseline_iteration_days,
        estimated_days_saved=saved,
        open_finding_count=open_findings,
        quote_request_count=len(quotes),
    )


def save_waitlist(payload: WaitlistSignup) -> dict:
    item = {"id": new_id("wait"), "created_at": utc_now().isoformat(), **payload.model_dump()}
    from .storage import write_raw

    write_raw("waitlist", item["id"], item)
    return item

