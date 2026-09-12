"""Focused tests for Emergent Google Sign-In session exchange (iteration 2).

Covers: POST /api/auth/session validation + 401 path, and regression checks
that existing auth/data endpoints still work after the backend change.
"""

import os

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")


@pytest.fixture(scope="module")
def api_client():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


class TestGoogleSessionExchange:
    """New endpoint: POST /api/auth/session (Emergent-managed Google OAuth)"""

    def test_invalid_session_id_returns_401(self, api_client):
        resp = api_client.post(f"{BASE_URL}/api/auth/session", json={"session_id": "fake123-invalid"}, timeout=30)
        assert resp.status_code == 401, f"Expected 401, got {resp.status_code}: {resp.text}"
        assert "Invalid or expired Google session" in resp.text

    def test_missing_session_id_field_returns_422(self, api_client):
        resp = api_client.post(f"{BASE_URL}/api/auth/session", json={}, timeout=15)
        assert resp.status_code == 422, f"Expected 422, got {resp.status_code}: {resp.text}"

    def test_wrong_field_name_returns_422(self, api_client):
        resp = api_client.post(f"{BASE_URL}/api/auth/session", json={"token": "abc"}, timeout=15)
        assert resp.status_code == 422, f"Expected 422, got {resp.status_code}: {resp.text}"

    def test_empty_session_id_string_rejected(self, api_client):
        # Empty string passes Pydantic but must not create a session; expect 401 from upstream exchange
        resp = api_client.post(f"{BASE_URL}/api/auth/session", json={"session_id": ""}, timeout=30)
        assert resp.status_code in (401, 422), f"Expected 401/422, got {resp.status_code}: {resp.text}"


class TestAuthRegression:
    """Existing auth + data endpoints must still work after the backend change"""

    def test_demo_login_returns_token_and_user(self, api_client):
        resp = api_client.post(f"{BASE_URL}/api/auth/demo", timeout=15)
        assert resp.status_code == 200
        data = resp.json()
        assert data["token"], "token missing"
        assert data["user"]["full_name"] == "Demo Recruiter"
        assert "_id" not in data["user"]

    def test_overview_metrics(self, api_client):
        resp = api_client.get(f"{BASE_URL}/api/overview", timeout=15)
        assert resp.status_code == 200
        data = resp.json()
        assert data["jobs_analyzed"] >= 1
        assert data["candidates_ranked"] >= 18

    def test_rankings_return_18_candidates_sorted(self, api_client):
        resp = api_client.get(f"{BASE_URL}/api/screenings/screening-job-demo-backend-platform/rankings", timeout=15)
        assert resp.status_code == 200
        data = resp.json()
        rankings = data["rankings"] if isinstance(data, dict) else data
        assert len(rankings) == 18, f"Expected 18 candidates, got {len(rankings)}"
        scores = [r["final_score"] for r in rankings]
        assert scores == sorted(scores, reverse=True), "Rankings not sorted desc"

    def test_email_login_invalid_credentials_401(self, api_client):
        resp = api_client.post(f"{BASE_URL}/api/auth/login", json={"email": "nobody@test.dev", "password": "wrongpassword"}, timeout=15)
        assert resp.status_code == 401
