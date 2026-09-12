from __future__ import annotations

import json
import logging
import os
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

import bcrypt
import jwt
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

from ranking_engine import demo_candidates, demo_job, parse_resume, rank_candidates

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get("DB_NAME", "hirelens")]
JWT_SECRET = os.environ.get("AUTH_SECRET", "hirelens-local-development-secret")
LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")

app = FastAPI(title="HireLens API", version="1.0.0")
api_router = APIRouter(prefix="/api")
logger = logging.getLogger("hirelens")


class SignupRequest(BaseModel):
    full_name: str
    email: str
    password: str
    organization: str = ""
    role: str = "Recruiter"


class LoginRequest(BaseModel):
    email: str
    password: str


class JobCreate(BaseModel):
    title: str
    company: str = ""
    department: str = ""
    location: str = ""
    employment_type: str = "Full-time"
    description: str
    required_skills: list[str] = Field(default_factory=list)
    preferred_skills: list[str] = Field(default_factory=list)


class RecruiterQuestion(BaseModel):
    question: str
    job_id: str = "job-demo-backend-platform"


def utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def token_for(user: dict[str, Any]) -> str:
    return jwt.encode({"sub": user["user_id"], "exp": datetime.now(timezone.utc) + timedelta(days=7)}, JWT_SECRET, algorithm="HS256")


async def current_user(authorization: Optional[str] = Header(default=None)) -> dict[str, Any]:
    if not authorization:
        return {"user_id": "demo-user", "full_name": "Demo Recruiter", "role": "Demo User", "demo": True}
    try:
        token = authorization.removeprefix("Bearer ").strip()
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        user = await db.users.find_one({"user_id": payload["sub"]}, {"_id": 0})
        if user:
            return user
    except Exception as exc:
        logger.info("Ignoring invalid optional session: %s", exc)
    return {"user_id": "demo-user", "full_name": "Demo Recruiter", "role": "Demo User", "demo": True}


async def ensure_demo_data() -> None:
    job = demo_job()
    existing = await db.jobs.find_one({"job_id": job["job_id"]}, {"_id": 0})
    if not existing:
        job["created_at"] = utc_iso()
        await db.jobs.insert_one(job.copy())
    candidates = demo_candidates()
    existing_count = await db.candidates.count_documents({"job_id": job["job_id"]})
    if existing_count != len(candidates):
        await db.candidates.delete_many({"job_id": job["job_id"]})
        for candidate in candidates:
            candidate["job_id"] = job["job_id"]
            candidate["created_at"] = utc_iso()
        await db.candidates.insert_many([candidate.copy() for candidate in candidates])
    await recompute_screening(job["job_id"], persist=True)


async def get_job(job_id: str) -> dict[str, Any]:
    job = await db.jobs.find_one({"job_id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


async def recompute_screening(job_id: str, persist: bool = True) -> dict[str, Any]:
    job = await get_job(job_id)
    candidates = await db.candidates.find({"job_id": job_id}, {"_id": 0}).to_list(200)
    rankings = rank_candidates(job, candidates)
    run_id = f"screening-{job_id}"
    result = {
        "screening_id": run_id,
        "job_id": job_id,
        "status": "complete",
        "created_at": utc_iso(),
        "stages": [
            {"label": "JD requirements extracted", "status": "complete"},
            {"label": f"{len(candidates)} resumes parsed", "status": "complete"},
            {"label": "Resume sections normalized", "status": "complete"},
            {"label": "Evidence chunks generated", "status": "complete"},
            {"label": "Keyword retrieval complete", "status": "complete"},
            {"label": "Semantic retrieval complete", "status": "complete"},
            {"label": "Evidence scoring complete", "status": "complete"},
            {"label": "Hybrid ranking calculated", "status": "complete"},
        ],
        "rankings": rankings,
        "engine": {"keyword_weight": 0.35, "semantic_weight": 0.35, "evidence_weight": 0.20, "coverage_weight": 0.10, "semantic_method": "deterministic local hashed embeddings + skill-family expansion"},
    }
    if persist:
        await db.screening_runs.replace_one({"screening_id": run_id}, result.copy(), upsert=True)
    return result


def grounded_fallback(question: str, rankings: list[dict[str, Any]], job: dict[str, Any]) -> str:
    lower = question.lower()
    if "why" in lower and ("above" in lower or ">" in lower) and len(rankings) >= 2:
        first, second = rankings[0], rankings[1]
        stronger = []
        for left, right in zip(first.get("matches", []), second.get("matches", [])):
            delta = left["final_requirement_score"] - right["final_requirement_score"]
            if delta > 0.12:
                stronger.append(left["requirement"])
        factors = ", ".join(stronger[:3]) or "higher weighted requirement coverage"
        return f"{first['name']} ranks above {second['name']} by {first['final_score'] - second['final_score']:.1f} points, primarily due to stronger measured performance on {factors}. This comparison uses keyword, semantic, evidence and coverage components from the deterministic screening run."
    if "missing" in lower:
        missing: dict[str, int] = {}
        for ranking in rankings:
            for item in ranking.get("missing_required", []):
                missing[item] = missing.get(item, 0) + 1
        top = sorted(missing.items(), key=lambda item: -item[1])[:3]
        return "Most commonly missing required requirements: " + ", ".join(f"{name} ({count} candidates)" for name, count in top) + "."
    if "strong" in lower and "evidence" in lower:
        best = sorted(rankings, key=lambda item: item.get("evidence_score", 0), reverse=True)[:3]
        return "Strongest evidence profiles: " + ", ".join(f"{item['name']} ({item['evidence_score'] * 100:.0f}% evidence component)" for item in best) + "."
    return f"The screening run contains {len(rankings)} candidates for {job['title']}. Ask about a candidate comparison, a missing required skill, or demonstrated evidence."


async def llm_text(system: str, prompt: str, session_id: str) -> str | None:
    if not LLM_KEY:
        return None
    try:
        from emergentintegrations.llm.chat import LlmChat, StreamDone, TextDelta, UserMessage

        chat = LlmChat(api_key=LLM_KEY, session_id=session_id, system_message=system).with_model("openai", "gpt-5.4")
        output: list[str] = []
        async for event in chat.stream_message(UserMessage(text=prompt)):
            if isinstance(event, TextDelta):
                output.append(event.content)
            elif isinstance(event, StreamDone):
                break
        return "".join(output).strip() or None
    except Exception as exc:
        logger.warning("LLM fallback activated: %s", exc)
        return None


@api_router.get("/")
async def root() -> dict[str, str]:
    return {"message": "HireLens API", "status": "ready"}


@api_router.post("/auth/demo")
async def demo_login() -> dict[str, Any]:
    user = {"user_id": "demo-user", "full_name": "Demo Recruiter", "email": "demo@hirelens.ai", "role": "Demo User", "demo": True}
    return {"token": token_for(user), "user": user}


@api_router.post("/auth/signup")
async def signup(payload: SignupRequest) -> dict[str, Any]:
    email = payload.email.strip().lower()
    if len(payload.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    if await db.users.find_one({"email": email}, {"_id": 0}):
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    user = {"user_id": str(uuid.uuid4()), "full_name": payload.full_name.strip(), "email": email, "organization": payload.organization.strip(), "role": payload.role, "password_hash": bcrypt.hashpw(payload.password.encode(), bcrypt.gensalt()).decode(), "created_at": utc_iso()}
    await db.users.insert_one(user.copy())
    public = {key: value for key, value in user.items() if key != "password_hash"}
    return {"token": token_for(public), "user": public}


@api_router.post("/auth/login")
async def login(payload: LoginRequest) -> dict[str, Any]:
    user = await db.users.find_one({"email": payload.email.strip().lower()}, {"_id": 0})
    if not user or not bcrypt.checkpw(payload.password.encode(), user["password_hash"].encode()):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    public = {key: value for key, value in user.items() if key != "password_hash"}
    return {"token": token_for(public), "user": public}


@api_router.get("/jobs")
async def list_jobs(user: dict[str, Any] = Depends(current_user)) -> list[dict[str, Any]]:
    jobs = await db.jobs.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    for job in jobs:
        job["candidate_count"] = await db.candidates.count_documents({"job_id": job["job_id"]})
    return jobs


@api_router.post("/jobs")
async def create_job(payload: JobCreate, user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
    job_id = f"job-{uuid.uuid4().hex[:10]}"
    requirements = []
    for index, skill in enumerate(payload.required_skills + payload.preferred_skills):
        tier = "required" if index < len(payload.required_skills) else "preferred"
        requirements.append({"requirement_id": f"req-{index + 1}", "text": f"{skill} experience", "category": "REQUIRED_SKILL" if tier == "required" else "PREFERRED_SKILL", "required_or_preferred": tier, "normalized_skill": skill, "weight": 10 if tier == "required" else 4})
    job = {"job_id": job_id, **payload.model_dump(), "requirements": requirements, "demo": False, "created_at": utc_iso(), "created_by": user["user_id"]}
    await db.jobs.insert_one(job.copy())
    return job


@api_router.get("/jobs/{job_id}")
async def job_detail(job_id: str) -> dict[str, Any]:
    job = await get_job(job_id)
    job["candidate_count"] = await db.candidates.count_documents({"job_id": job_id})
    return job


@api_router.post("/jobs/{job_id}/jd")
async def upload_jd(job_id: str, text: str = Form(...)) -> dict[str, Any]:
    job = await get_job(job_id)
    extracted = await llm_text("Extract job requirements as strict JSON only. Never invent requirements.", f"JD:\n{text}\nReturn JSON with required_skills, preferred_skills, responsibilities, experience, education.", f"jd-{job_id}")
    required = re.findall(r"(?i)\b(Python|Node\.?JS|REST API|SQL|Docker|AWS|Git|React|Kubernetes|CI/CD)\b", text)
    required = list(dict.fromkeys(required))
    if extracted:
        try:
            data = json.loads(extracted)
            required = list(dict.fromkeys(data.get("required_skills", required)))
        except json.JSONDecodeError:
            pass
    job["description"] = text
    job["requirements"] = [{"requirement_id": f"req-{i + 1}", "text": f"{skill} experience", "category": "REQUIRED_SKILL", "required_or_preferred": "required", "normalized_skill": skill, "weight": 10} for i, skill in enumerate(required)]
    await db.jobs.replace_one({"job_id": job_id}, job.copy())
    return job


async def extract_upload_text(file: UploadFile, content: bytes) -> str:
    suffix = Path(file.filename or "resume.txt").suffix.lower()
    if suffix == ".pdf":
        try:
            import fitz

            document = fitz.open(stream=content, filetype="pdf")
            return "\n".join(page.get_text() for page in document)
        except Exception:
            return ""
    if suffix == ".docx":
        try:
            from docx import Document
            import io

            return "\n".join(paragraph.text for paragraph in Document(io.BytesIO(content)).paragraphs)
        except Exception:
            return ""
    return content.decode("utf-8", errors="ignore")


@api_router.post("/jobs/{job_id}/candidates/upload")
async def upload_candidates(job_id: str, files: list[UploadFile] = File(...)) -> dict[str, Any]:
    await get_job(job_id)
    created = []
    for file in files[:50]:
        content = await file.read()
        if len(content) > 8 * 1024 * 1024:
            continue
        text = await extract_upload_text(file, content)
        candidate_id = f"candidate-{uuid.uuid4().hex[:10]}"
        parsed = parse_resume(text or file.filename or "Candidate", candidate_id)
        parsed.update({"job_id": job_id, "email": "", "demo": False, "created_at": utc_iso()})
        await db.candidates.insert_one(parsed.copy())
        created.append({"candidate_id": candidate_id, "name": parsed["name"], "filename": file.filename})
    await recompute_screening(job_id)
    return {"uploaded": created, "count": len(created)}


@api_router.post("/screenings/{job_id}/run")
async def run_screening(job_id: str) -> dict[str, Any]:
    return await recompute_screening(job_id)


@api_router.get("/screenings/{screening_id}")
async def screening_detail(screening_id: str) -> dict[str, Any]:
    result = await db.screening_runs.find_one({"screening_id": screening_id}, {"_id": 0})
    if not result:
        job_id = screening_id.removeprefix("screening-")
        result = await recompute_screening(job_id)
    return result


@api_router.get("/screenings/{screening_id}/rankings")
async def screening_rankings(screening_id: str) -> list[dict[str, Any]]:
    result = await screening_detail(screening_id)
    return result["rankings"]


@api_router.get("/candidates/{candidate_id}")
async def candidate_detail(candidate_id: str) -> dict[str, Any]:
    candidate = await db.candidates.find_one({"candidate_id": candidate_id}, {"_id": 0})
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    result = await recompute_screening(candidate["job_id"], persist=False)
    ranking = next((item for item in result["rankings"] if item["candidate_id"] == candidate_id), None)
    if not ranking:
        raise HTTPException(status_code=404, detail="Candidate ranking not found")
    return {"candidate": {key: value for key, value in candidate.items() if key not in {"raw_text"}}, "ranking": ranking}


@api_router.get("/jobs/{job_id}/technical-analysis")
async def technical_analysis(job_id: str) -> dict[str, Any]:
    job = await get_job(job_id)
    screening = await recompute_screening(job_id, persist=False)
    first = screening["rankings"][0] if screening["rankings"] else None
    return {"job": {"job_id": job["job_id"], "title": job["title"]}, "stages": screening["stages"], "engine": screening["engine"], "sample_candidate": first, "requirements": job["requirements"]}


@api_router.get("/jobs/{job_id}/insights")
async def job_insights(job_id: str) -> dict[str, Any]:
    job = await get_job(job_id)
    requirements = job.get("requirements", [])
    insights = []
    if len([item for item in requirements if item.get("required_or_preferred") == "required"]) >= 6:
        insights.append({"severity": "warning", "title": "High mandatory requirement density", "body": "Consider whether project or internship evidence can satisfy some requirements currently marked mandatory."})
    skills = [item.get("normalized_skill") for item in requirements]
    if {"React", "Node.js"}.issubset(set(skills)):
        insights.append({"severity": "info", "title": "Full-stack scope", "body": "The JD spans frontend and backend technologies. Confirm whether both are genuinely core to the role."})
    if not insights:
        insights.append({"severity": "success", "title": "Balanced requirement set", "body": "No obvious narrow wording patterns were detected by the configured checks."})
    return {"job_id": job_id, "insights": insights, "disclaimer": "These are review prompts, not legal conclusions."}


@api_router.post("/recruiter-ai/query")
async def recruiter_ai(payload: RecruiterQuestion) -> dict[str, Any]:
    job = await get_job(payload.job_id)
    screening = await recompute_screening(payload.job_id, persist=False)
    fallback = grounded_fallback(payload.question, screening["rankings"], job)
    context = {"question": payload.question, "job": job["title"], "rankings": screening["rankings"][:8]}
    response = await llm_text("You are HireLens Recruiter AI. Answer only from the supplied structured evidence. Never invent candidate facts or scores. If evidence is absent, say so. Do not recalculate scores.", json.dumps(context), f"recruiter-{payload.job_id}")
    return {"answer": response or fallback, "grounded": bool(response), "sources": ["deterministic screening run", "candidate requirement matches"], "screening_id": screening["screening_id"]}


@api_router.get("/overview")
async def overview() -> dict[str, Any]:
    jobs = await db.jobs.find({}, {"_id": 0}).to_list(100)
    total_candidates = await db.candidates.count_documents({})
    scores: list[float] = []
    for job in jobs:
        screening = await recompute_screening(job["job_id"], persist=False)
        scores.extend([item["final_score"] for item in screening["rankings"]])
    distribution = {"90–100": 0, "80–89": 0, "70–79": 0, "60–69": 0, "<60": 0}
    for score in scores:
        bucket = "90–100" if score >= 90 else "80–89" if score >= 80 else "70–79" if score >= 70 else "60–69" if score >= 60 else "<60"
        distribution[bucket] += 1
    return {"jobs_analyzed": len(jobs), "candidates_screened": total_candidates, "candidates_ranked": len(scores), "average_score": round(sum(scores) / len(scores), 1) if scores else 0, "strong_matches": len([score for score in scores if score >= 75]), "distribution": distribution, "latest_job": jobs[0] if jobs else None}


app.include_router(api_router)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
async def startup() -> None:
    await ensure_demo_data()


@app.on_event("shutdown")
async def shutdown_db_client() -> None:
    client.close()