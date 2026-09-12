from __future__ import annotations

import csv
import io
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
from fastapi import APIRouter, Depends, FastAPI, File, Form, Header, HTTPException, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

from ranking_engine import canonical_skill, demo_candidates, demo_job, extract_known_skills, parse_resume, rank_candidates

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


class EngineWeights(BaseModel):
    keyword: float = 0.35
    semantic: float = 0.35
    evidence: float = 0.20
    coverage: float = 0.10


def utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def token_for(user: dict[str, Any]) -> str:
    return jwt.encode({"sub": user["user_id"], "exp": datetime.now(timezone.utc) + timedelta(days=7)}, JWT_SECRET, algorithm="HS256")


async def current_user(authorization: Optional[str] = Header(default=None)) -> dict[str, Any]:
    demo = {"user_id": "demo-user", "full_name": "Demo Recruiter", "role": "Demo User", "demo": True}
    if not authorization:
        return demo
    token = authorization.removeprefix("Bearer ").strip()
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        user = await db.users.find_one({"user_id": payload["sub"]}, {"_id": 0})
        if user:
            return user
    except Exception:
        pass
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if session:
        expires = session.get("expires_at")
        if expires and expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if expires and expires > datetime.now(timezone.utc):
            user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
            if user:
                return user
    return demo


DATASET_DIR = ROOT_DIR / "dataset"


def dataset_candidates() -> list[dict[str, Any]]:
    """Parse the real applicant pool bundled in /dataset (18 resumes)."""
    candidates: list[dict[str, Any]] = []
    for index, path in enumerate(sorted(DATASET_DIR.glob("*.txt")), start=1):
        text = path.read_text(encoding="utf-8", errors="ignore")
        if not text.strip():
            continue
        parsed = parse_resume(text, f"candidate-ds-{index:02d}")
        if parsed["name"].isupper():
            parsed["name"] = parsed["name"].title()
        email_match = re.search(r"[\w.+-]+@[\w-]+\.[\w.]+", text)
        parsed["email"] = email_match.group(0) if email_match else ""
        parsed["demo"] = True
        parsed["source_file"] = path.name
        candidates.append(parsed)
    return candidates


async def ensure_demo_data() -> None:
    job = demo_job()
    existing = await db.jobs.find_one({"job_id": job["job_id"]}, {"_id": 0})
    if not existing:
        job["created_at"] = utc_iso()
        await db.jobs.insert_one(job.copy())
    candidates = dataset_candidates() or demo_candidates()
    existing = await db.candidates.find({"job_id": job["job_id"]}, {"_id": 0, "candidate_id": 1, "name": 1}).to_list(300)
    existing_sig = sorted(f"{item['candidate_id']}:{item['name']}" for item in existing)
    expected_sig = sorted(f"{candidate['candidate_id']}:{candidate['name']}" for candidate in candidates)
    if existing_sig != expected_sig:
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
    # Name-aware "Why is X ranked above Y?" — deterministic comparison of any pair.
    mentioned = [item for item in rankings if any(len(part) > 2 and part in lower for part in item["name"].lower().split())]
    if len(mentioned) >= 2:
        first, second = sorted(mentioned[:2], key=lambda item: item["rank"])
        stronger = []
        for left, right in zip(first.get("matches", []), second.get("matches", [])):
            delta = left["final_requirement_score"] - right["final_requirement_score"]
            if delta > 0.12:
                stronger.append(left["requirement"])
        factors = ", ".join(stronger[:3]) or "higher weighted requirement coverage"
        missing_note = f" {second['name']} is also missing required signals: {', '.join(second['missing_required'][:3])}." if second.get("missing_required") else ""
        return f"{first['name']} (rank {first['rank']}, {first['final_score']:.1f}) ranks above {second['name']} (rank {second['rank']}, {second['final_score']:.1f}) by {first['final_score'] - second['final_score']:.1f} points, primarily due to stronger measured performance on {factors}.{missing_note} This comparison uses keyword, semantic, evidence and coverage components from the deterministic screening run."
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


class SessionExchangeRequest(BaseModel):
    session_id: str


@api_router.post("/auth/session")
async def auth_session(payload: SessionExchangeRequest) -> dict[str, Any]:
    import httpx

    async with httpx.AsyncClient(timeout=10) as http_client:
        response = await http_client.get("https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data", headers={"X-Session-ID": payload.session_id})
    if response.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid or expired Google session")
    data = response.json()
    email = str(data.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=401, detail="Google account has no email")
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        user = {
            "user_id": f"user_{uuid.uuid4().hex[:12]}",
            "full_name": str(data.get("name") or email.split("@")[0]),
            "email": email,
            "organization": "",
            "role": "Recruiter",
            "auth_provider": "google",
            "picture": data.get("picture"),
            "created_at": utc_iso(),
        }
        await db.users.insert_one(user.copy())
    session_token = str(data["session_token"])
    now = datetime.now(timezone.utc)
    await db.user_sessions.insert_one({"session_token": session_token, "user_id": user["user_id"], "created_at": now, "expires_at": now + timedelta(days=7)})
    public = {key: value for key, value in user.items() if key != "password_hash"}
    return {"session_token": session_token, "user": public}


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


def sectioned_skill_split(text: str) -> tuple[list[str], list[str]]:
    """Split a JD into required vs preferred skills using explicit section headers."""
    segments = re.split(r"(?im)^\s*(must[- ]have(?:\s+skills)?|good[- ]to[- ]have(?:\s+skills)?|nice[- ]to[- ]have(?:\s+skills)?|preferred\s+(?:qualifications|skills)|requirements|key responsibilities|responsibilities|soft skills|about the role)\s*$", text)
    required_text = preferred_text = ""
    current = "neutral"
    for segment in segments:
        label = segment.lower().strip()
        if re.fullmatch(r"(?i)(must[- ]have(?:\s+skills)?|requirements|key responsibilities|responsibilities)", label):
            current = "required"
            continue
        if re.fullmatch(r"(?i)(good[- ]to[- ]have(?:\s+skills)?|nice[- ]to[- ]have|preferred(?:\s+qualifications)?)", label):
            current = "preferred"
            continue
        if re.fullmatch(r"(?i)(soft skills|about the role)", label):
            current = "neutral"
            continue
        if current == "required":
            required_text += " " + segment
        elif current == "preferred":
            preferred_text += " " + segment
    required = extract_known_skills(required_text)
    preferred = [skill for skill in extract_known_skills(preferred_text) if skill not in required]
    return required, preferred


@api_router.post("/jobs/{job_id}/jd")
async def upload_jd(job_id: str, text: str = Form(...)) -> dict[str, Any]:
    job = await get_job(job_id)
    extracted = await llm_text(
        "Extract job requirements as strict JSON only. Never invent requirements. Skills must be short canonical technology names (e.g. Node.js, PostgreSQL, Docker).",
        f"JD:\n{text}\nReturn JSON with keys: required_skills (list), preferred_skills (list), responsibilities (list), experience (list), education (list).",
        f"jd-{job_id}",
    )
    required: list[str] = []
    preferred: list[str] = []
    if extracted:
        try:
            data = json.loads(extracted.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip())
            required = [str(item) for item in data.get("required_skills", [])]
            preferred = [str(item) for item in data.get("preferred_skills", [])]
        except json.JSONDecodeError:
            pass
    # Section-aware extraction (MUST-HAVE vs GOOD-TO-HAVE) grounds or repairs
    # the LLM output — LLMs routinely drop skills from long JDs.
    section_required, section_preferred = sectioned_skill_split(text)
    required = list(dict.fromkeys([canonical_skill(skill) for skill in required if skill.strip()] + [skill for skill in section_required if skill not in {canonical_skill(s) for s in required}]))[:14]
    taken = set(required)
    preferred = [skill for skill in dict.fromkeys([canonical_skill(skill) for skill in preferred if skill.strip()] + section_preferred) if skill not in taken][:8]
    if not required:
        required = extract_known_skills(text)[:14]
    job["description"] = text
    requirements = [
        {"requirement_id": f"req-{index + 1}", "text": f"{skill} experience", "category": "REQUIRED_SKILL", "required_or_preferred": "required", "normalized_skill": skill, "weight": 10}
        for index, skill in enumerate(required)
    ] + [
        {"requirement_id": f"req-{len(required) + index + 1}", "text": f"{skill} familiarity", "category": "PREFERRED_SKILL", "required_or_preferred": "preferred", "normalized_skill": skill, "weight": 4}
        for index, skill in enumerate(preferred)
    ]
    job["requirements"] = requirements
    await db.jobs.replace_one({"job_id": job_id}, job.copy())
    return job


@api_router.delete("/jobs/{job_id}")
async def delete_job(job_id: str) -> dict[str, str]:
    job = await get_job(job_id)
    if job.get("demo"):
        raise HTTPException(status_code=400, detail="The seeded demo dataset cannot be deleted")
    await db.jobs.delete_one({"job_id": job_id})
    await db.candidates.delete_many({"job_id": job_id})
    await db.screening_runs.delete_one({"screening_id": f"screening-{job_id}"})
    return {"deleted": job_id}


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


@api_router.post("/jobs/{job_id}/weights")
async def set_engine_weights(job_id: str, payload: EngineWeights) -> dict[str, Any]:
    job = await get_job(job_id)
    weights = {"keyword": payload.keyword, "semantic": payload.semantic, "evidence": payload.evidence, "coverage": payload.coverage}
    if any(value < 0 or value > 1 for value in weights.values()) or not (0.95 <= sum(weights.values()) <= 1.05):
        raise HTTPException(status_code=400, detail="Weights must be 0–1 and sum to 1.0")
    job["weights"] = weights
    await db.jobs.replace_one({"job_id": job_id}, job.copy())
    screening = await recompute_screening(job_id)
    return {"weights": weights, "top_candidates": [{"rank": item["rank"], "name": item["name"], "final_score": item["final_score"]} for item in screening["rankings"][:3]]}


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


@api_router.get("/screenings/{screening_id}/export.csv")
async def export_rankings_csv(screening_id: str) -> Response:
    result = await screening_detail(screening_id)
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["Rank", "Candidate", "Final Score", "Keyword Score", "Semantic Score", "Evidence Score", "Coverage Score", "Critical Penalty", "Matched Required", "Missing Required", "Matched Preferred"])
    for item in result["rankings"]:
        writer.writerow([
            item["rank"],
            item["name"],
            item["final_score"],
            item["keyword_score"],
            item["semantic_score"],
            item["evidence_score"],
            item["coverage_score"],
            item["critical_penalty"],
            "; ".join(item["matched_required"]),
            "; ".join(item["missing_required"]),
            "; ".join(item["matched_preferred"]),
        ])
    return Response(
        content=buffer.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=hirelens-{screening_id}.csv"},
    )


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
    description = job.get("description", "")
    insights = []
    year_match = re.search(r"(?i)(exactly\s+\d+\s+years?|\d+\s*\+\s*years?|minimum\s+of\s+\d+\s+years?)", description)
    if year_match:
        insights.append({"severity": "warning", "title": "Potentially restrictive experience wording", "body": f"The JD mentions \"{year_match.group(0)}\" of experience. Consider whether equivalent project or internship evidence could satisfy the requirement."})
    if re.search(r"(?i)\b(b\.?\s?tech|bachelor'?s?|master'?s?|degree\s+in|mba|ph\.?d)\b", description):
        insights.append({"severity": "info", "title": "Degree-specific requirement", "body": "The JD names a specific degree. Accepting equivalent demonstrated skill evidence may widen a strong pool without lowering the bar."})
    required_items = [item for item in requirements if item.get("required_or_preferred") == "required"]
    if len(required_items) >= 6:
        insights.append({"severity": "warning", "title": "High mandatory requirement density", "body": f"{len(required_items)} requirements are marked mandatory. Confirm each is genuinely critical — mandatory items dominate the deterministic score."})
    seen: set[str] = set()
    dupes: set[str] = set()
    for item in requirements:
        skill = item.get("normalized_skill", "")
        if skill in seen:
            dupes.add(skill)
        seen.add(skill)
    if dupes:
        insights.append({"severity": "warning", "title": "Duplicate requirements", "body": "These signals appear more than once: " + ", ".join(sorted(dupes)) + ". Duplicates double-count their weight."})
    frontend_frameworks = {"React", "Vue", "Angular", "Svelte"}
    framework_hits = frontend_frameworks.intersection(item.get("normalized_skill", "") for item in required_items)
    if len(framework_hits) >= 2:
        insights.append({"severity": "warning", "title": "Potentially narrow framework stack", "body": f"Multiple frontend frameworks are mandatory ({', '.join(sorted(framework_hits))}). Are all genuinely required?"})
    cloud_providers = {"AWS", "Azure", "GCP"}
    cloud_hits = cloud_providers.intersection(item.get("normalized_skill", "") for item in required_items)
    if len(cloud_hits) >= 2:
        insights.append({"severity": "warning", "title": "Multiple cloud providers mandatory", "body": f"The JD requires {', '.join(sorted(cloud_hits))}. Cloud skills transfer well — consider marking one as preferred."})
    tone_hits = re.findall(r"(?i)\b(rockstar|ninja|guru|young and|native speaker|native english|he will|she will|guys)\b", description)
    if tone_hits:
        insights.append({"severity": "warning", "title": "Potentially exclusionary language", "body": f"Phrases like \"{tone_hits[0]}\" can signal bias and may deter qualified candidates. Consider neutral, skill-focused wording."})
    llm_flags = await llm_text(
        "You review job descriptions for narrow or biased phrasing. Return strict JSON only: {\"flags\": [{\"title\": str, \"body\": str}]} with at most 2 flags, only for genuine issues (overly narrow technology stacks, unnecessary mandatory requirements, exact-year or degree rigidity, gendered or exclusionary wording). Return {\"flags\": []} if the JD is well written. Never make legal claims.",
        f"Job description:\n{description}",
        f"insights-{job_id}",
    )
    if llm_flags:
        try:
            parsed = json.loads(llm_flags.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip())
            for flag in parsed.get("flags", [])[:2]:
                insights.append({"severity": "info", "title": f"AI review: {flag.get('title', 'Wording note')}", "body": str(flag.get("body", ""))})
        except json.JSONDecodeError:
            pass
    if not insights:
        insights.append({"severity": "success", "title": "Balanced requirement set", "body": "No obvious narrow wording patterns were detected by the configured checks."})
    return {"job_id": job_id, "insights": insights, "disclaimer": "These are review prompts, not legal conclusions."}


@api_router.post("/recruiter-ai/query")
async def recruiter_ai(payload: RecruiterQuestion) -> dict[str, Any]:
    job = await get_job(payload.job_id)
    screening = await recompute_screening(payload.job_id, persist=False)
    fallback = grounded_fallback(payload.question, screening["rankings"], job)
    compact = [
        {"rank": item["rank"], "name": item["name"], "final_score": item["final_score"], "components": item["components"], "matched_required": item["matched_required"], "missing_required": item["missing_required"], "strongest_evidence": item["strongest_evidence"][:3]}
        for item in screening["rankings"]
    ]
    context = {"question": payload.question, "job": job["title"], "rankings": compact}
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
    await db.users.create_index("email", unique=True, sparse=True)
    await db.users.create_index("user_id", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("user_id")
    await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
    await ensure_demo_data()


@app.on_event("shutdown")
async def shutdown_db_client() -> None:
    client.close()