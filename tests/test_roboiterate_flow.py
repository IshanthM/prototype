from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from backend.app import storage
from backend.app.main import app


def configure_tmp_storage(tmp_path: Path) -> None:
    storage.replace_data_root(tmp_path / "data")


def ascii_stl_plate() -> bytes:
    return b"""solid thin_mount_plate
facet normal 0 0 1
outer loop
vertex 0 0 0
vertex 180 0 0
vertex 180 80 0
endloop
endfacet
facet normal 0 0 1
outer loop
vertex 0 0 0
vertex 180 80 0
vertex 0 80 2
endloop
endfacet
endsolid thin_mount_plate
"""


def step_fixture() -> bytes:
    return b"""ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('robot bearing block pocket'),'2;1');
FILE_NAME('bearing_block_rev_b.step','2026-07-07T00:00:00',('RoboIterate'),('FTC'),'','','');
FILE_SCHEMA(('AP242_MANAGED_MODEL_BASED_3D_ENGINEERING_MIM_LF'));
ENDSEC;
DATA;
#1=SI_UNIT(.MILLI.,.METRE.);
#10=CARTESIAN_POINT('',(0.,0.,0.));
#11=CARTESIAN_POINT('',(45.,35.,18.));
#12=CYLINDRICAL_SURFACE('HOLE',#10,3.);
#13=ADVANCED_FACE('INSIDE POCKET',(),#12,.T.);
ENDSEC;
END-ISO-10303-21;
"""


def create_project(client: TestClient) -> str:
    response = client.post("/api/projects", json={"name": "Centerstage drivetrain", "team_name": "FTC 9999", "baseline_iteration_days": 14})
    assert response.status_code == 200, response.text
    return response.json()["id"]


def test_stl_upload_runs_dfm_supplier_quote_and_metrics(tmp_path):
    configure_tmp_storage(tmp_path)
    client = TestClient(app)
    project_id = create_project(client)

    upload = client.post(
        f"/api/projects/{project_id}/parts",
        data={"part_name": "Thin mounting plate", "revision": "A"},
        files={"file": ("thin_mount_plate_hole.stl", ascii_stl_plate(), "model/stl")},
    )
    assert upload.status_code == 200, upload.text
    part = upload.json()
    assert part["sha256"]
    assert part["geometry"]["file_format"] == "stl"
    assert part["geometry"]["dimensions_mm"]["x"] == 180
    codes = {item["code"] for item in part["findings"]}
    assert "FDM_WARP_RISK" in codes
    assert "HOLE_FIT_CHECK" in codes
    assert "UNKNOWN_UNITS" in codes
    assert part["recommendation"]["primary_process"] in {"laser_cut_sheet", "fdm_3d_printing", "cnc_machining"}

    suppliers = client.get(f"/api/parts/{part['id']}/suppliers")
    assert suppliers.status_code == 200, suppliers.text
    assert suppliers.json()

    quote = client.post(f"/api/parts/{part['id']}/quote-request/{suppliers.json()[0]['id']}")
    assert quote.status_code == 200, quote.text
    assert "Thin mounting plate" in quote.json()["message"]
    assert "SHA-256" in quote.json()["message"]

    metrics = client.get(f"/api/projects/{project_id}/metrics")
    assert metrics.status_code == 200, metrics.text
    assert metrics.json()["revision_count"] == 1
    assert metrics.json()["quote_request_count"] == 1

    stateless_quote = client.post("/api/quote-request", json={"part": part, "supplier": suppliers.json()[0]})
    assert stateless_quote.status_code == 200, stateless_quote.text
    assert "Thin mounting plate" in stateless_quote.json()["message"]


def test_step_upload_extracts_units_and_cnc_signals(tmp_path):
    configure_tmp_storage(tmp_path)
    client = TestClient(app)
    project_id = create_project(client)

    upload = client.post(
        f"/api/projects/{project_id}/parts",
        data={"part_name": "Bearing block", "revision": "B"},
        files={"file": ("bearing_block_pocket.step", step_fixture(), "application/step")},
    )
    assert upload.status_code == 200, upload.text
    part = upload.json()
    assert part["geometry"]["file_format"] == "step"
    assert part["geometry"]["units"] == "millimeter"
    assert part["geometry"]["dimensions_mm"] == {"x": 45.0, "y": 35.0, "z": 18.0}
    codes = {item["code"] for item in part["findings"]}
    assert "CNC_INTERNAL_RADIUS_CAUTION" in codes
    assert "UNKNOWN_UNITS" not in codes


def test_rejects_invalid_upload_type(tmp_path):
    configure_tmp_storage(tmp_path)
    client = TestClient(app)
    project_id = create_project(client)
    response = client.post(
        f"/api/projects/{project_id}/parts",
        data={"part_name": "Bad file", "revision": "A"},
        files={"file": ("notes.txt", b"not cad", "text/plain")},
    )
    assert response.status_code == 400
    assert "Unsupported file extension" in response.text


def test_waitlist_capture(tmp_path):
    configure_tmp_storage(tmp_path)
    client = TestClient(app)
    response = client.post("/api/waitlist", json={"email": "team@example.com", "team_name": "FTC Test", "notes": "Need fast plates."})
    assert response.status_code == 200
    assert response.json()["email"] == "team@example.com"
