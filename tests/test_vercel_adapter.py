from fastapi.testclient import TestClient

from api.index import app


def test_vercel_python_entrypoint_serves_api_health():
    client = TestClient(app)
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "product": "RoboIterate"}
