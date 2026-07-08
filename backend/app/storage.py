from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Type, TypeVar

from pydantic import BaseModel

from .models import ProjectCreate, ProjectRecord

T = TypeVar("T", bound=BaseModel)

# ---------------------------------------------------------------------------
# BUG FIX CONTEXT (read this before touching this file again):
#
# This app was originally storing all data (projects, parts, suppliers,
# quote requests, waitlist signups) as JSON files on local disk. On Vercel,
# that got redirected to /tmp when VERCEL/VERCEL_ENV was set -- but /tmp on
# Vercel serverless functions is NOT guaranteed to persist between separate
# invocations. Two requests in a row (e.g. "upload a part" then "list parts
# for this project") can land on different function instances with
# completely empty /tmp directories, so data silently vanished. That was the
# root cause of "I upload a part and nothing happens."
#
# Fix: if a DATABASE_URL environment variable is set, all metadata storage
# (everything EXCEPT the raw uploaded CAD file bytes) goes through a real
# Postgres table instead. The raw uploaded file itself is fine to leave on
# ephemeral disk (see part_upload_dir below) because nothing ever reads it
# back in a LATER request -- it's written and consumed within the same
# request in services.upload_part.
#
# If DATABASE_URL is not set (local dev, tests), this falls back to the
# original local-JSON-file behavior unchanged, so `pytest` and local
# development keep working exactly as before with zero setup.
# ---------------------------------------------------------------------------


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:16]}"


# ---------------------------------------------------------------------------
# File-backed storage (local dev / tests / fallback only -- NOT safe to rely
# on for production persistence on Vercel; see note above).
# ---------------------------------------------------------------------------


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


def _collection_dir(kind: str) -> Path:
    mapping = {
        "project": PROJECTS_DIR,
        "part": PARTS_DIR,
        "supplier": SUPPLIERS_DIR,
        "quote": QUOTE_REQUESTS_DIR,
        "waitlist": WAITLIST_DIR,
    }
    return mapping[kind]


def _ensure_file_storage() -> None:
    for path in [PROJECTS_DIR, PARTS_DIR, SUPPLIERS_DIR, QUOTE_REQUESTS_DIR, WAITLIST_DIR, UPLOADS_DIR]:
        path.mkdir(parents=True, exist_ok=True)


def _file_collection_path(kind: str, item_id: str) -> Path:
    return _collection_dir(kind) / f"{item_id}.json"


def _file_write_model(kind: str, item: BaseModel) -> None:
    _ensure_file_storage()
    _file_collection_path(kind, getattr(item, "id")).write_text(item.model_dump_json(indent=2))


def _file_read_model(kind: str, item_id: str, model: Type[T]) -> T:
    path = _file_collection_path(kind, item_id)
    if not path.exists():
        raise FileNotFoundError(item_id)
    return model.model_validate_json(path.read_text())


def _file_list_models(kind: str, model: Type[T]) -> List[T]:
    _ensure_file_storage()
    folder = _collection_dir(kind)
    return sorted(
        (model.model_validate_json(path.read_text()) for path in folder.glob("*.json")),
        key=lambda item: getattr(item, "created_at", utc_now()),
    )


def _file_write_raw(kind: str, item_id: str, payload: dict) -> None:
    _ensure_file_storage()
    _file_collection_path(kind, item_id).write_text(json.dumps(payload, indent=2))


def part_upload_dir(part_id: str) -> Path:
    # See module docstring: ephemeral storage is fine here, the file is only
    # ever read within the same request that writes it.
    _ensure_file_storage()
    path = UPLOADS_DIR / part_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def replace_data_root(path: Path) -> None:
    """Used by tests to isolate file-backed storage. No-op effect on the DB
    backend (tests should not set DATABASE_URL)."""
    global DATA_DIR, PROJECTS_DIR, PARTS_DIR, SUPPLIERS_DIR, QUOTE_REQUESTS_DIR, WAITLIST_DIR, UPLOADS_DIR
    DATA_DIR = path
    PROJECTS_DIR = DATA_DIR / "projects"
    PARTS_DIR = DATA_DIR / "parts"
    SUPPLIERS_DIR = DATA_DIR / "suppliers"
    QUOTE_REQUESTS_DIR = DATA_DIR / "quote_requests"
    WAITLIST_DIR = DATA_DIR / "waitlist"
    UPLOADS_DIR = DATA_DIR / "uploads"


# ---------------------------------------------------------------------------
# Postgres-backed storage. Active whenever DATABASE_URL is set. This is what
# actually fixes the data-loss bug for any real deployment. See README for
# how to create a free Postgres database and set this env var in Vercel.
# ---------------------------------------------------------------------------

_DATABASE_URL = os.environ.get("DATABASE_URL")
_db_engine = None

if _DATABASE_URL:
    from sqlalchemy import create_engine, text

    # Some managed Postgres providers hand out "postgres://" connection
    # strings; SQLAlchemy's psycopg (v3) dialect expects "postgresql+psycopg://".
    _normalized_url = _DATABASE_URL
    if _normalized_url.startswith("postgres://"):
        _normalized_url = "postgresql+psycopg://" + _normalized_url[len("postgres://"):]
    elif _normalized_url.startswith("postgresql://") and "+psycopg" not in _normalized_url:
        _normalized_url = "postgresql+psycopg://" + _normalized_url[len("postgresql://"):]

    _db_engine = create_engine(_normalized_url, pool_pre_ping=True)

    with _db_engine.begin() as _conn:
        _conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS roboiterate_records (
                    kind TEXT NOT NULL,
                    id TEXT NOT NULL,
                    data JSONB NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    PRIMARY KEY (kind, id)
                )
                """
            )
        )


def _db_write_model(kind: str, item: BaseModel) -> None:
    from sqlalchemy import text

    payload = json.loads(item.model_dump_json())
    created_at = getattr(item, "created_at", utc_now())
    with _db_engine.begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO roboiterate_records (kind, id, data, created_at)
                VALUES (:kind, :id, CAST(:data AS JSONB), :created_at)
                ON CONFLICT (kind, id) DO UPDATE SET data = EXCLUDED.data
                """
            ),
            {"kind": kind, "id": getattr(item, "id"), "data": json.dumps(payload), "created_at": created_at},
        )


def _db_read_model(kind: str, item_id: str, model: Type[T]) -> T:
    from sqlalchemy import text

    with _db_engine.begin() as conn:
        row = conn.execute(
            text("SELECT data FROM roboiterate_records WHERE kind = :kind AND id = :id"),
            {"kind": kind, "id": item_id},
        ).fetchone()
    if row is None:
        raise FileNotFoundError(item_id)
    return model.model_validate(row[0])


def _db_list_models(kind: str, model: Type[T]) -> List[T]:
    from sqlalchemy import text

    with _db_engine.begin() as conn:
        rows = conn.execute(
            text("SELECT data FROM roboiterate_records WHERE kind = :kind ORDER BY created_at ASC"),
            {"kind": kind},
        ).fetchall()
    return [model.model_validate(row[0]) for row in rows]


def _db_write_raw(kind: str, item_id: str, payload: dict) -> None:
    from sqlalchemy import text

    with _db_engine.begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO roboiterate_records (kind, id, data)
                VALUES (:kind, :id, CAST(:data AS JSONB))
                ON CONFLICT (kind, id) DO UPDATE SET data = EXCLUDED.data
                """
            ),
            {"kind": kind, "id": item_id, "data": json.dumps(payload)},
        )


# ---------------------------------------------------------------------------
# Public interface used by services.py / main.py / tests. Dispatches to
# whichever backend is active. Nothing outside this file should know or care
# which one is in use.
# ---------------------------------------------------------------------------


def write_model(kind: str, item: BaseModel) -> None:
    if _db_engine is not None:
        _db_write_model(kind, item)
    else:
        _file_write_model(kind, item)


def read_model(kind: str, item_id: str, model: Type[T]) -> T:
    if _db_engine is not None:
        return _db_read_model(kind, item_id, model)
    return _file_read_model(kind, item_id, model)


def list_models(kind: str, model: Type[T]) -> List[T]:
    if _db_engine is not None:
        return _db_list_models(kind, model)
    return _file_list_models(kind, model)


def write_raw(kind: str, item_id: str, payload: dict) -> None:
    if _db_engine is not None:
        _db_write_raw(kind, item_id, payload)
    else:
        _file_write_raw(kind, item_id, payload)


def create_project(payload: ProjectCreate) -> ProjectRecord:
    now = utc_now()
    project = ProjectRecord(id=new_id("proj"), created_at=now, updated_at=now, **payload.model_dump())
    write_model("project", project)
    return project
