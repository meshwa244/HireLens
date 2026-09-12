"""HireLens backend API tests — auth, overview, rankings determinism, candidate detail,
technical analysis, insights, recruiter AI, jobs."""

import uuid

import pytest

JOB_ID = "job-demo-backend-platform"
SCREENING_ID = f"screening-{JOB_ID}"


class TestHealth:
    """Health check (run first)"""

    def test_health(self, api_client, base_url):
        response = api_client.get(f"{base_url}/api/")
        assert response.status_code == 200
        assert response.json()["status"] == "ready"


class TestAuth:
    """Demo login + email/password signup/login flows"""

    def test_demo_login(self, api_client, base_url):
        response = api_client.post(f"{base_url}/api/auth/demo")
        assert response.status_code == 200
        data = response.json()
        assert data["token"]
        assert data["user"]["user_id"] == "demo-user"

    def test_signup_and_login(self, api_client, base_url):
        email = f"TEST_{uuid.uuid4().hex[:8]}@example.com"
        signup = api_client.post(f"{base_url}/api/auth/signup", json={
            "full_name": "Test Recruiter", "email": email,
            "password": "testpass123", "organization": "Test Org",
        })
        assert signup.status_code == 200
        token = signup.json()["token"]
        assert token

        login = api_client.post(f"{base_url}/api/auth/login", json={"email": email, "password": "testpass123"})
        assert login.status_code == 200
        assert login.json()["user"]["email"] == email.lower()

    def test_signup_short_password_rejected(self, api_client, base_url):
        response = api_client.post(f"{base_url}/api/auth/signup", json={
            "full_name": "Test", "email": f"TEST_{uuid.uuid4().hex[:6]}@example.com", "password": "short",
        })
        assert response.status_code == 400

    def test_login_wrong_password_rejected(self, api_client, base_url):
        response = api_client.post(f"{base_url}/api/auth/login", json={"email": "demo@hirelens.ai", "password": "wrongpass1"})
        assert response.status_code == 401


class TestOverview:
    """GET /api/overview returns seeded demo metrics"""

    def test_overview_metrics(self, api_client, base_url):
        response = api_client.get(f"{base_url}/api/overview")
        assert response.status_code == 200
        data = response.json()
        assert data["jobs_analyzed"] >= 1
        assert data["candidates_screened"] == 18
        assert data["candidates_ranked"] == 18
        assert isinstance(data["average_score"], (int, float))
        assert sum(data["distribution"].values()) == 18


class TestRankings:
    """Rankings: 18 candidates sorted desc by final_score; deterministic across runs"""

    def test_rankings_count_and_sort(self, api_client, base_url):
        response = api_client.get(f"{base_url}/api/screenings/{SCREENING_ID}/rankings")
        assert response.status_code == 200
        rankings = response.json()
        assert len(rankings) == 18
        scores = [item["final_score"] for item in rankings]
        assert scores == sorted(scores, reverse=True)
        assert [item["rank"] for item in rankings] == list(range(1, 19))

    def test_expected_top_three(self, api_client, base_url):
        rankings = api_client.get(f"{base_url}/api/screenings/{SCREENING_ID}/rankings").json()
        top = [(item["name"], round(item["final_score"], 2)) for item in rankings[:3]]
        assert top[0] == ("Maya Chen", 74.2)
        assert top[1] == ("Leo Martin", 67.97)
        assert top[2] == ("Arjun Mehta", 66.85)

    def test_ranking_fields_present(self, api_client, base_url):
        rankings = api_client.get(f"{base_url}/api/screenings/{SCREENING_ID}/rankings").json()
        first = rankings[0]
        for key in ["keyword_score", "semantic_score", "evidence_score", "coverage_score",
                    "critical_penalty", "components", "matches", "strongest_evidence",
                    "claimed_skills", "demonstrated_skills", "missing_required", "matched_required"]:
            assert key in first, f"missing field {key}"
        # deterministic score decomposition: components sum - penalty == final
        comp = first["components"]
        reconstructed = (comp["keyword_contribution"] + comp["semantic_contribution"]
                         + comp["evidence_contribution"] + comp["coverage_contribution"]
                         - first["critical_penalty"])
        assert abs(reconstructed - first["final_score"]) < 0.05

    def test_determinism_run_twice(self, api_client, base_url):
        run1 = api_client.post(f"{base_url}/api/screenings/{JOB_ID}/run").json()
        run2 = api_client.post(f"{base_url}/api/screenings/{JOB_ID}/run").json()
        order1 = [(item["candidate_id"], item["final_score"]) for item in run1["rankings"]]
        order2 = [(item["candidate_id"], item["final_score"]) for item in run2["rankings"]]
        assert order1 == order2
        assert len(order1) == 18


class TestCandidateDetail:
    """Candidate detail endpoint returns candidate + ranking breakdown"""

    def test_candidate_detail(self, api_client, base_url):
        rankings = api_client.get(f"{base_url}/api/screenings/{SCREENING_ID}/rankings").json()
        candidate_id = rankings[0]["candidate_id"]
        response = api_client.get(f"{base_url}/api/candidates/{candidate_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["ranking"]["candidate_id"] == candidate_id
        assert data["ranking"]["name"] == "Maya Chen"
        assert "_id" not in data["candidate"]
        assert "raw_text" not in data["candidate"]

    def test_candidate_not_found(self, api_client, base_url):
        response = api_client.get(f"{base_url}/api/candidates/candidate-does-not-exist")
        assert response.status_code == 404


class TestTechnicalAndInsights:
    """Technical analysis + JD insights endpoints"""

    def test_technical_analysis(self, api_client, base_url):
        response = api_client.get(f"{base_url}/api/jobs/{JOB_ID}/technical-analysis")
        assert response.status_code == 200
        data = response.json()
        assert len(data["stages"]) == 8
        assert all(stage["status"] == "complete" for stage in data["stages"])
        engine = data["engine"]
        assert engine["keyword_weight"] == 0.35 and engine["semantic_weight"] == 0.35
        assert engine["evidence_weight"] == 0.20 and engine["coverage_weight"] == 0.10
        assert data["sample_candidate"]["matches"]

    def test_insights(self, api_client, base_url):
        response = api_client.get(f"{base_url}/api/jobs/{JOB_ID}/insights")
        assert response.status_code == 200
        data = response.json()
        assert len(data["insights"]) >= 1
        assert data["insights"][0]["title"]


class TestRecruiterAI:
    """Recruiter AI returns an answer (LLM or deterministic grounded fallback)"""

    def test_why_top_above_second(self, api_client, base_url):
        response = api_client.post(f"{base_url}/api/recruiter-ai/query", json={
            "job_id": JOB_ID, "question": "Why is the top candidate ranked above #2?",
        }, timeout=90)
        assert response.status_code == 200
        data = response.json()
        assert len(data["answer"]) > 20
        # grounded answer should mention top candidates or the screening evidence
        assert "Maya" in data["answer"] or "screening" in data["answer"].lower()

    def test_missing_skill_question(self, api_client, base_url):
        response = api_client.post(f"{base_url}/api/recruiter-ai/query", json={
            "job_id": JOB_ID, "question": "Which required skill is most commonly missing?",
        }, timeout=90)
        assert response.status_code == 200
        assert len(response.json()["answer"]) > 20


class TestJobs:
    """Jobs list/detail + create-job CRUD"""

    def test_list_jobs(self, api_client, base_url):
        response = api_client.get(f"{base_url}/api/jobs")
        assert response.status_code == 200
        jobs = response.json()
        assert len(jobs) >= 1
        demo = next(job for job in jobs if job["job_id"] == JOB_ID)
        assert demo["candidate_count"] == 18
        assert "_id" not in demo

    def test_job_detail(self, api_client, base_url):
        response = api_client.get(f"{base_url}/api/jobs/{JOB_ID}")
        assert response.status_code == 200
        job = response.json()
        assert job["title"] == "Backend Platform Engineer"
        assert len(job["requirements"]) >= 1

    def test_create_job_and_verify(self, api_client, base_url):
        create = api_client.post(f"{base_url}/api/jobs", json={
            "title": "TEST_Integration Role", "description": "TEST job description",
            "required_skills": ["Python", "SQL"], "preferred_skills": ["Docker"],
        })
        assert create.status_code == 200
        job = create.json()
        assert job["job_id"].startswith("job-")
        required = [r for r in job["requirements"] if r["required_or_preferred"] == "required"]
        preferred = [r for r in job["requirements"] if r["required_or_preferred"] == "preferred"]
        assert len(required) == 2 and len(preferred) == 1
        # GET to verify persistence
        detail = api_client.get(f"{base_url}/api/jobs/{job['job_id']}")
        assert detail.status_code == 200
        assert detail.json()["title"] == "TEST_Integration Role"

    def test_job_not_found(self, api_client, base_url):
        response = api_client.get(f"{base_url}/api/jobs/job-does-not-exist")
        assert response.status_code == 404
