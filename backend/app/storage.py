from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, List, Type, TypeVar

from pydantic import BaseModel

from .models import ProjectCreate, ProjectRecord, SupplierRecord


def default_data_dir() -> Path:
    configured = os.environ.get("ROBOITERATE_DATA_DIR")
    if configured:
        return Path(configured)
    if os.environ.get("VERCEL") or os.environ.get("VERCEL_ENV"):
        return Path("/tmp/roboiterate-data")
    return Path("data")


DATA_DIR = default_data_dir()
PROJECTS_DIR = DATA_DIR / "projects"
PARTS_DIR = DATA_DIR / "parts"
SUPPLIERS_DIR = DATA_DIR / "suppliers"
QUOTE_REQUESTS_DIR = DATA_DIR / "quote_requests"
WAITLIST_DIR = DATA_DIR / "waitlist"
UPLOADS_DIR = DATA_DIR / "uploads"

T = TypeVar("T", bound=BaseModel)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:16]}"


def ensure_storage() -> None:
    for path in [PROJECTS_DIR, PARTS_DIR, SUPPLIERS_DIR, QUOTE_REQUESTS_DIR, WAITLIST_DIR, UPLOADS_DIR]:
        path.mkdir(parents=True, exist_ok=True)


def collection_path(kind: str, item_id: str) -> Path:
    mapping = {
        "project": PROJECTS_DIR,
        "part": PARTS_DIR,
        "supplier": SUPPLIERS_DIR,
        "quote": QUOTE_REQUESTS_DIR,
        "waitlist": WAITLIST_DIR,
    }
    return mapping[kind] / f"{item_id}.json"


def write_model(kind: str, item: BaseModel) -> None:
    ensure_storage()
    collection_path(kind, getattr(item, "id")).write_text(item.model_dump_json(indent=2))


def read_model(kind: str, item_id: str, model: Type[T]) -> T:
    path = collection_path(kind, item_id)
    if not path.exists():
        raise FileNotFoundError(item_id)
    return model.model_validate_json(path.read_text())


def list_models(kind: str, model: Type[T]) -> List[T]:
    ensure_storage()
    folder = collection_path(kind, "_").parent
    return sorted((model.model_validate_json(path.read_text()) for path in folder.glob("*.json")), key=lambda item: getattr(item, "created_at", utc_now()))


def create_project(payload: ProjectCreate) -> ProjectRecord:
    now = utc_now()
    project = ProjectRecord(id=new_id("proj"), created_at=now, updated_at=now, **payload.model_dump())
    write_model("project", project)
    return project


def part_upload_dir(part_id: str) -> Path:
    ensure_storage()
    path = UPLOADS_DIR / part_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def replace_data_root(path: Path) -> None:
    global DATA_DIR, PROJECTS_DIR, PARTS_DIR, SUPPLIERS_DIR, QUOTE_REQUESTS_DIR, WAITLIST_DIR, UPLOADS_DIR
    DATA_DIR = path
    PROJECTS_DIR = DATA_DIR / "projects"
    PARTS_DIR = DATA_DIR / "parts"
    SUPPLIERS_DIR = DATA_DIR / "suppliers"
    QUOTE_REQUESTS_DIR = DATA_DIR / "quote_requests"
    WAITLIST_DIR = DATA_DIR / "waitlist"
    UPLOADS_DIR = DATA_DIR / "uploads"
