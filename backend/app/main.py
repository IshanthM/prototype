from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from .models import FindingStatus, ProjectCreate, ProjectRecord, QuoteRequest, QuoteSnapshot, SupplierCreate, SupplierRecord, UploadedPart, WaitlistSignup
from .services import (
    compute_metrics,
    create_default_suppliers,
    create_supplier,
    generate_quote_request,
    matching_suppliers,
    project_parts,
    save_waitlist,
    update_finding_status,
    upload_part,
)
from .storage import create_project, list_models, read_model, utc_now


@asynccontextmanager
async def lifespan(_app: FastAPI):
    create_default_suppliers()
    yield


app = FastAPI(title="RoboIterate", version="0.2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:3000", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "product": "RoboIterate"}


@app.post("/api/projects")
def api_create_project(payload: ProjectCreate):
    return create_project(payload)


@app.get("/api/projects")
def api_list_projects():
    return list_models("project", ProjectRecord)


@app.get("/api/projects/{project_id}/parts")
def api_project_parts(project_id: str):
    return project_parts(project_id)


@app.get("/api/projects/{project_id}/metrics")
def api_project_metrics(project_id: str):
    try:
        project = read_model("project", project_id, ProjectRecord)
        return compute_metrics(project)
    except FileNotFoundError:
        return {
            "project_id": project_id,
            "revision_count": 0,
            "average_hours_between_uploads": None,
            "baseline_iteration_days": 14.0,
            "estimated_days_saved": None,
            "open_finding_count": 0,
            "quote_request_count": 0,
        }


@app.post("/api/projects/{project_id}/parts")
def api_upload_part(
    project_id: str,
    file: UploadFile = File(...),
    part_name: str = Form(...),
    revision: str = Form(...),
):
    try:
        project = read_model("project", project_id, ProjectRecord)
    except FileNotFoundError:
        now = utc_now()
        project = ProjectRecord(id=project_id, name="Serverless upload", team_name="Robotics Team", baseline_iteration_days=14.0, created_at=now, updated_at=now)
    try:
        return upload_part(project, file, part_name, revision)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.patch("/api/parts/{part_id}/findings/{finding_id}")
def api_update_finding(part_id: str, finding_id: str, status: FindingStatus):
    try:
        part = read_model("part", part_id, UploadedPart)
        return update_finding_status(part, finding_id, status)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="part or finding not found")


@app.get("/api/suppliers")
def api_suppliers():
    return list_models("supplier", SupplierRecord)


@app.post("/api/suppliers")
def api_create_supplier(payload: SupplierCreate):
    return create_supplier(payload)


@app.get("/api/parts/{part_id}/suppliers")
def api_part_suppliers(part_id: str):
    try:
        return matching_suppliers(read_model("part", part_id, UploadedPart))
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="part not found")


@app.post("/api/parts/{part_id}/quote-request/{supplier_id}")
def api_quote_request(part_id: str, supplier_id: str):
    try:
        part = read_model("part", part_id, UploadedPart)
        supplier = read_model("supplier", supplier_id, SupplierRecord)
        return generate_quote_request(part, supplier)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="part or supplier not found")


@app.post("/api/quote-request")
def api_quote_request_snapshot(payload: QuoteSnapshot):
    return generate_quote_request(payload.part, payload.supplier)


@app.get("/api/quote-requests")
def api_quote_requests():
    return list_models("quote", QuoteRequest)


@app.post("/api/waitlist")
def api_waitlist(payload: WaitlistSignup):
    return save_waitlist(payload)
