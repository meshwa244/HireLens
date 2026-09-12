"""Iteration 3: real dataset swap, job creation flow, job delete, CSV export, JD insights, regressions."""
import csv
import io
import time
import uuid

import pytest
import requests

BASE_URL = None  # resolved in fixture

DEMO_SCREENING = "screening-job-demo-backend-platform"
DEMO_JOB = "job-demo-backend-platform"
REAL_NAMES = {
    "Meera Pillai", "Aditya Joshi", "Karan Malhotra", "Ananya Reddy", "Priya Kulkarni",
    "Vikram Nair", "Kavya Menon", "Siddharth Rao", "Ishita Gupta", "Nikhil Desai",
    "Yash Choudhary", "Anjali Bose", "Riya Singh", "Sahil Khanna", "Aman Tripathi",
    "Shreya Mehra", "Varun Kapoor", "Neha Bhatia",
}
FICTIONAL_NAMES = {"Maya Chen", "Arjun Mehta", "Leo Martin"}


@pytest.fixture(scope="session")
def base(base_url):
    return base_url


class TestRealDatasetRankings:
    """Rankings must show the 18 real Google Drive candidates, sorted desc."""

    def test_rankings_18_real_candidates(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/screenings/{DEMO_SCREENING}/rankings")
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 18, f"expected 18 candidates, got {len(data)}"
        names = {item["name"] for item in data}
        assert names == REAL_NAMES, f"mismatch: missing={REAL_NAMES - names} extra={names - REAL_NAMES}"
        assert not names.intersection(FICTIONAL_NAMES), "fictional sample names present"

    def test_rankings_ids_and_order(self, api_client, base_url):
        data = api_client.get(f"{base_url}/api/screenings/{DEMO_SCREENING}/rankings").json()
        ids = sorted(item["candidate_id"] for item in data)
        assert ids == [f"candidate-ds-{i:02d}" for i in range(1, 19)]
        scores = [item["final_score"] for item in data]
        assert scores == sorted(scores, reverse=True), "not sorted desc"
        assert scores[0] == pytest.approx(56.21, abs=1.5), f"top score {scores[0]}"
        assert scores[-1] == pytest.approx(1.02, abs=1.0), f"bottom score {scores[-1]}"
        assert [item["rank"] for item in data] == list(range(1, 19))

    def test_rankings_expected_positions(self, api_client, base_url):
        data = api_client.get(f"{base_url}/api/screenings/{DEMO_SCREENING}/rankings").json()
        assert data[0]["name"] == "Meera Pillai"
        assert data[1]["name"] == "Aditya Joshi"
        assert data[2]["name"] == "Karan Malhotra"
        bottom_two = {data[-1]["name"], data[-2]["name"]}
        assert bottom_two == {"Neha Bhatia", "Varun Kapoor"}


class TestOverview:
    """Overview metrics reflect the real 18-candidate pool."""

    def test_overview_metrics(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/overview")
        assert r.status_code == 200
        data = r.json()
        assert data["candidates_screened"] >= 18
        assert data["candidates_ranked"] >= 18
        assert data["jobs_analyzed"] >= 1
        assert sum(data["distribution"].values()) == data["candidates_ranked"]


class TestCandidateDetail:
    """Candidate detail for Aditya Joshi (candidate-ds-15 in this dataset)."""

    def test_aditya_joshi_detail(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/candidates/candidate-ds-15")
        assert r.status_code == 200
        data = r.json()
        assert data["candidate"]["name"] == "Aditya Joshi"
        assert "raw_text" not in data["candidate"], "raw_text should be excluded"
        ranking = data["ranking"]
        assert ranking["candidate_id"] == "candidate-ds-15"
        # breakdown components present
        for key in ("keyword_score", "semantic_score", "evidence_score", "coverage_score", "critical_penalty"):
            assert key in ranking, f"missing breakdown key {key}"
        # requirement matrix
        assert len(ranking["matches"]) > 0
        first = ranking["matches"][0]
        for key in ("requirement", "final_requirement_score", "evidence"):
            assert key in first, f"requirement matrix missing {key}"
        # real resume evidence excerpt
        all_evidence = json_dump = str(ranking["matches"])
        assert any(
            term.lower() in all_evidence.lower()
            for term in ["distributed task scheduler", "scheduler", "api", "service"]
        ), f"no real resume evidence found in matches: {all_evidence[:400]}"

    def test_unknown_candidate_404(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/candidates/candidate-nope-99")
        assert r.status_code == 404


class TestJobLifecycle:
    """Job creation -> JD extraction -> delete; demo job delete protected."""

    @pytest.fixture(scope="class")
    def created_job(self, api_client, base_url):
        payload = {
            "title": "TEST_QA Engineer",
            "company": "TestCo",
            "description": "We need a QA engineer with Selenium, Python, test automation and CI experience.",
            "required_skills": ["Selenium", "Python"],
            "preferred_skills": ["CI"],
        }
        r = api_client.post(f"{base_url}/api/jobs", json=payload)
        assert r.status_code == 200, r.text
        job = r.json()
        yield job
        api_client.delete(f"{base_url}/api/jobs/{job['job_id']}")

    def test_create_job(self, api_client, base_url, created_job):
        job = created_job
        assert job["job_id"].startswith("job-")
        assert job["title"] == "TEST_QA Engineer"
        assert job["demo"] is False
        req_texts = " ".join(item["normalized_skill"] for item in job["requirements"])
        assert "Selenium" in req_texts and "Python" in req_texts
        # GET back to verify persistence
        g = api_client.get(f"{base_url}/api/jobs/{job['job_id']}")
        assert g.status_code == 200
        assert g.json()["title"] == "TEST_QA Engineer"

    def test_jd_extraction(self, api_client, base_url, created_job):
        jd = "We need a QA engineer with Selenium, Python, test automation and CI experience."
        r = api_client.post(
            f"{base_url}/api/jobs/{created_job['job_id']}/jd",
            data={"text": jd},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=90,
        )
        assert r.status_code == 200, r.text
        job = r.json()
        assert job["description"] == jd
        skills = [item["normalized_skill"] for item in job["requirements"] if item["required_or_preferred"] == "required"]
        assert len(skills) >= 2, f"extraction produced too few required skills: {skills}"
        assert any("selenium" in s.lower() or "python" in s.lower() for s in skills), f"expected Selenium/Python in {skills}"

    def test_new_job_screening_empty(self, api_client, base_url, created_job):
        r = api_client.get(f"{base_url}/api/screenings/screening-{created_job['job_id']}/rankings")
        assert r.status_code == 200
        assert r.json() == [], "new job should have 0 ranked candidates"

    def test_jobs_list_contains_new_job(self, api_client, base_url, created_job):
        r = api_client.get(f"{base_url}/api/jobs")
        assert r.status_code == 200
        ids = [j["job_id"] for j in r.json()]
        assert created_job["job_id"] in ids
        assert DEMO_JOB in ids

    def test_delete_demo_job_protected(self, api_client, base_url):
        r = api_client.delete(f"{base_url}/api/jobs/{DEMO_JOB}")
        assert r.status_code == 400
        # demo job still present
        g = api_client.get(f"{base_url}/api/jobs/{DEMO_JOB}")
        assert g.status_code == 200

    def test_delete_created_job(self, api_client, base_url, created_job):
        r = api_client.delete(f"{base_url}/api/jobs/{created_job['job_id']}")
        assert r.status_code == 200
        g = api_client.get(f"{base_url}/api/jobs/{created_job['job_id']}")
        assert g.status_code == 404
        # mark as deleted so fixture teardown 404 doesn't matter
        created_job["job_id"] = f"deleted-{uuid.uuid4().hex[:6]}"


class TestCsvExport:
    """CSV export endpoint for the demo screening."""

    def test_csv_export(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/screenings/{DEMO_SCREENING}/export.csv")
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("content-type", "")
        assert "attachment" in r.headers.get("content-disposition", "")
        rows = list(csv.reader(io.StringIO(r.text)))
        assert rows[0][:3] == ["Rank", "Candidate", "Final Score"]
        assert len(rows) == 19, f"expected header + 18 rows, got {len(rows)}"
        names = [row[1] for row in rows[1:]]
        assert names[0] == "Meera Pillai"
        assert set(names) == REAL_NAMES
        ranks = [int(row[0]) for row in rows[1:]]
        assert ranks == list(range(1, 19))


class TestJobInsights:
    """JD insights heuristics."""

    def test_high_density_warning(self, api_client, base_url):
        r = api_client.get(f"{base_url}/api/jobs/{DEMO_JOB}/insights")
        assert r.status_code == 200
        data = r.json()
        titles = [i["title"] for i in data["insights"]]
        assert "High mandatory requirement density" in titles, f"titles: {titles}"
        density = next(i for i in data["insights"] if i["title"] == "High mandatory requirement density")
        assert density["severity"] == "warning"
        assert data["disclaimer"]


class TestRegressions:
    """Demo login + recruiter AI regressions."""

    def test_demo_login(self, api_client, base_url):
        r = api_client.post(f"{base_url}/api/auth/demo")
        assert r.status_code == 200
        data = r.json()
        assert data["token"]
        assert data["user"]["user_id"] == "demo-user"

    def test_recruiter_ai(self, api_client, base_url):
        r = api_client.post(
            f"{base_url}/api/recruiter-ai/query",
            json={"question": "Which requirements are most commonly missing?", "job_id": DEMO_JOB},
            timeout=90,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["answer"]
        assert data["screening_id"] == DEMO_SCREENING
