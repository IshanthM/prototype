from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class FileFormat(str, Enum):
    stl = "stl"
    step = "step"


class Process(str, Enum):
    fdm = "fdm_3d_printing"
    cnc = "cnc_machining"
    laser = "laser_cut_sheet"


class Severity(str, Enum):
    blocker = "blocker"
    warning = "warning"
    info = "info"


class FindingStatus(str, Enum):
    open = "open"
    fixed = "fixed"
    accepted = "accepted"


class ProjectCreate(BaseModel):
    name: str
    team_name: str = "Robotics Team"
    baseline_iteration_days: float = Field(default=14.0, gt=0)


class ProjectRecord(ProjectCreate):
    id: str
    created_at: datetime
    updated_at: datetime


class BoundingBox(BaseModel):
    min_x: float
    min_y: float
    min_z: float
    max_x: float
    max_y: float
    max_z: float


class GeometrySummary(BaseModel):
    file_format: FileFormat
    units: str = "unknown"
    bounding_box: Optional[BoundingBox] = None
    dimensions_mm: Dict[str, float] = Field(default_factory=dict)
    triangle_count: Optional[int] = None
    feature_signals: List[str] = Field(default_factory=list)
    limitations: List[str] = Field(default_factory=list)


class DfmFinding(BaseModel):
    id: str
    code: str
    title: str
    severity: Severity
    status: FindingStatus = FindingStatus.open
    description: str
    suggested_fix: str
    evidence: str
    affected_processes: List[Process] = Field(default_factory=list)


class ProcessRecommendation(BaseModel):
    primary_process: Process
    scores: Dict[Process, int]
    rationale: List[str]
    rough_cost_band: str
    lead_time_days: str
    limitations: List[str] = Field(default_factory=list)


class UploadedPart(BaseModel):
    id: str
    project_id: str
    part_name: str
    revision: str
    original_filename: str
    stored_filename: str
    sha256: str
    size_bytes: int
    uploaded_at: datetime
    geometry: GeometrySummary
    findings: List[DfmFinding] = Field(default_factory=list)
    recommendation: ProcessRecommendation


class SupplierCreate(BaseModel):
    name: str
    contact: str
    location: str
    processes: List[Process]
    typical_turnaround_days: str
    rate_notes: str
    notes: str = ""


class SupplierRecord(SupplierCreate):
    id: str
    created_at: datetime
    updated_at: datetime


class QuoteRequest(BaseModel):
    id: str
    part_id: str
    supplier_id: str
    generated_at: datetime
    message: str


class QuoteSnapshot(BaseModel):
    part: UploadedPart
    supplier: SupplierRecord


class WaitlistSignup(BaseModel):
    email: str
    team_name: str
    notes: str = ""


class IterationMetrics(BaseModel):
    project_id: str
    revision_count: int
    average_hours_between_uploads: Optional[float]
    baseline_iteration_days: float
    estimated_days_saved: Optional[float]
    open_finding_count: int
    quote_request_count: int
