"""Deterministic, inspectable matching pipeline for HireLens.

The semantic layer uses a local hashed embedding with skill-family expansion. It
is intentionally deterministic and does not ask an LLM to produce scores.
"""
from __future__ import annotations

import hashlib
import math
import re
from collections import Counter
from typing import Any


EVIDENCE_STRENGTH = {
    "skills": 0.40,
    "coursework": 0.50,
    "certifications": 0.60,
    "projects": 0.80,
    "internships": 0.90,
    "experience": 1.00,
    "research": 0.70,
    "education": 0.50,
    "achievements": 0.45,
    "summary": 0.35,
}

SKILL_ALIASES = {
    "python": "Python",
    "python programming": "Python",
    "js": "JavaScript",
    "javascript": "JavaScript",
    "ecmascript": "JavaScript",
    "node": "Node.js",
    "nodejs": "Node.js",
    "node.js": "Node.js",
    "express": "Express.js",
    "expressjs": "Express.js",
    "express.js": "Express.js",
    "rest": "REST API",
    "rest api": "REST API",
    "rest apis": "REST API",
    "restful api": "REST API",
    "rest services": "REST API",
    "postgres": "PostgreSQL",
    "postgresql": "PostgreSQL",
    "mysql": "MySQL",
    "sql": "SQL",
    "jest": "Jest",
    "mocha": "Mocha",
    "mongodb": "MongoDB",
    "mongo": "MongoDB",
    "nosql": "NoSQL",
    "docker": "Docker",
    "kubernetes": "Kubernetes",
    "k8s": "Kubernetes",
    "aws": "AWS",
    "azure": "Azure",
    "gcp": "GCP",
    "react": "React",
    "reactjs": "React",
    "react.js": "React",
    "typescript": "TypeScript",
    "ts": "TypeScript",
    "fastapi": "FastAPI",
    "flask": "Flask",
    "django": "Django",
    "git": "Git",
    "github": "GitHub",
    "ci/cd": "CI/CD",
    "cicd": "CI/CD",
    "kafka": "Kafka",
    "redis": "Redis",
    "machine learning": "Machine Learning",
    "ml": "Machine Learning",
    "pandas": "Pandas",
    "numpy": "NumPy",
}

RELATED_SKILLS = {
    "Node.js": {"Express.js", "JavaScript", "FastAPI", "Flask"},
    "Express.js": {"Node.js", "REST API", "JavaScript"},
    "FastAPI": {"Python", "REST API"},
    "Flask": {"Python", "REST API"},
    "REST API": {"Express.js", "FastAPI", "Flask", "Node.js"},
    "PostgreSQL": {"SQL", "MongoDB", "NoSQL"},
    "MongoDB": {"NoSQL", "PostgreSQL", "SQL"},
    "SQL": {"PostgreSQL", "MongoDB"},
    "Docker": {"Kubernetes", "CI/CD"},
    "Kubernetes": {"Docker", "AWS"},
    "AWS": {"Docker", "Kubernetes", "Azure", "GCP"},
    "React": {"JavaScript", "TypeScript"},
    "TypeScript": {"JavaScript", "React"},
}

SECTION_HEADERS = {
    "skills": "skills",
    "technical skills": "skills",
    "core competencies": "skills",
    "competencies": "skills",
    "key skills": "skills",
    "skills & expertise": "skills",
    "skills and expertise": "skills",
    "technical proficiencies": "skills",
    "technical expertise": "skills",
    "areas of expertise": "skills",
    "experience": "experience",
    "work experience": "experience",
    "professional experience": "experience",
    "employment history": "experience",
    "work history": "experience",
    "internship": "internships",
    "internships": "internships",
    "projects": "projects",
    "academic projects": "projects",
    "personal projects": "projects",
    "project work": "projects",
    "project experience": "projects",
    "key projects": "projects",
    "selected projects": "projects",
    "certifications": "certifications",
    "certificates": "certifications",
    "licenses & certifications": "certifications",
    "courses": "coursework",
    "coursework": "coursework",
    "training": "coursework",
    "trainings": "coursework",
    "education": "education",
    "academic background": "education",
    "qualifications": "education",
    "research": "research",
    "publications": "research",
    "summary": "summary",
    "professional summary": "summary",
    "career summary": "summary",
    "objective": "summary",
    "about": "summary",
    "achievements": "achievements",
    "awards": "achievements",
    "accomplishments": "achievements",
}

# Common misspellings of section headers seen in real resumes.
HEADER_TYPOS = {
    "expereince": "experience",
    "exprience": "experience",
    "experiance": "experience",
    "skils": "skills",
    "skillls": "skills",
    "proffessional": "professional",
    "profesional": "professional",
    "eduction": "education",
    "educaton": "education",
    "projets": "projects",
    "certfications": "certifications",
    "certficates": "certifications",
    "acheivements": "achievements",
}


def normalize_text(value: str) -> str:
    value = value.replace("|", ",")
    # Messy resume cleanup: unicode bullets, dashes and symbol separators.
    value = re.sub(r"[•▪◦●○◆·✓✔*–—_]+", " ", value)
    return re.sub(r"\s+", " ", value.strip().lower())


def normalize_heading(line: str) -> str:
    heading = normalize_text(line).rstrip(":").strip()
    words = [HEADER_TYPOS.get(word, word) for word in heading.split()]
    return " ".join(words)


def canonical_skill(value: str) -> str:
    normalized = normalize_text(value).strip(".,:;()[]")
    return SKILL_ALIASES.get(normalized, value.strip())


def tokenize(value: str) -> list[str]:
    return re.findall(r"[a-z0-9+#./-]+", normalize_text(value))


def extract_known_skills(text: str) -> list[str]:
    normalized = normalize_text(text)
    found: list[str] = []
    for alias, canonical in sorted(SKILL_ALIASES.items(), key=lambda item: -len(item[0])):
        if re.search(rf"(?<![a-z0-9]){re.escape(alias)}(?![a-z0-9])", normalized):
            if canonical not in found:
                found.append(canonical)
    return found


def split_sections(text: str) -> dict[str, str]:
    sections: dict[str, list[str]] = {"summary": []}
    current = "summary"
    for raw_line in text.splitlines():
        line = raw_line.strip()
        heading = normalize_heading(line)
        if heading in SECTION_HEADERS and len(line) < 42:
            current = SECTION_HEADERS[heading]
            sections.setdefault(current, [])
            continue
        if line:
            sections.setdefault(current, []).append(line)
    return {key: "\n".join(value).strip() for key, value in sections.items() if value}


def parse_resume(text: str, candidate_id: str, name: str | None = None) -> dict[str, Any]:
    sections = split_sections(text)
    first_line = next((line.strip() for line in text.splitlines() if line.strip()), "Candidate")
    candidate_name = name or (first_line if len(first_line) < 48 else "Candidate")
    claimed = extract_known_skills(sections.get("skills", text))
    chunks: list[dict[str, Any]] = []
    for section, section_text in sections.items():
        if not section_text:
            continue
        skills = extract_known_skills(section_text)
        strength = EVIDENCE_STRENGTH.get(section, 0.40)
        chunks.append(
            {
                "chunk_id": f"{candidate_id}-{section}",
                "section": section,
                "text": section_text[:700],
                "skills": skills,
                "evidence_strength": strength,
                "source": section,
            }
        )
    all_skills = sorted(set(extract_known_skills(text) + claimed))
    return {
        "candidate_id": candidate_id,
        "name": candidate_name,
        "raw_text": text,
        "sections": sections,
        "claimed_skills": claimed,
        "skills": all_skills,
        "evidence_chunks": chunks,
    }


def _expanded_tokens(text: str) -> list[str]:
    tokens = tokenize(text)
    for skill in extract_known_skills(text):
        tokens.extend(tokenize(skill))
        tokens.extend(tokenize(" ".join(RELATED_SKILLS.get(skill, set()))))
    return tokens


def embedding(text: str, dimensions: int = 256) -> list[float]:
    counts = Counter(_expanded_tokens(text))
    vector = [0.0] * dimensions
    for token, count in counts.items():
        digest = hashlib.sha256(token.encode("utf-8")).digest()
        index = int.from_bytes(digest[:4], "big") % dimensions
        vector[index] += float(count)
    magnitude = math.sqrt(sum(value * value for value in vector)) or 1.0
    return [value / magnitude for value in vector]


def cosine_similarity(left: list[float], right: list[float]) -> float:
    return max(0.0, min(1.0, sum(a * b for a, b in zip(left, right))))


def semantic_score(requirement_text: str, chunks: list[dict[str, Any]]) -> tuple[float, dict[str, Any] | None]:
    requirement_embedding = embedding(requirement_text)
    best_score = 0.0
    best_chunk = None
    for chunk in chunks:
        score = cosine_similarity(requirement_embedding, embedding(chunk["text"]))
        if score > best_score:
            best_score = score
            best_chunk = chunk
    return best_score, best_chunk


# Generic JD/resume vocabulary that must never drive a "partial" keyword match.
OVERLAP_STOPWORDS = {
    "and", "or", "the", "a", "an", "to", "of", "in", "on", "for", "with", "through", "via", "into",
    "use", "build", "design", "ship", "deploy", "create", "collaborate", "work", "operate",
    "services", "service", "production", "production-ready", "systems", "system", "platform",
    "experience", "familiarity", "modern", "automated", "delivery", "workflows", "reliable",
    "observability", "relational", "modeling", "review", "code", "cloud", "container",
    "orchestration", "backend", "apis", "api", "frontend", "data", "requirements",
}


def keyword_score(requirement: dict[str, Any], candidate: dict[str, Any]) -> tuple[float, str]:
    required_skill = canonical_skill(requirement.get("normalized_skill") or requirement["text"])
    candidate_skills = set(candidate.get("skills", []))
    if required_skill in candidate_skills:
        return 1.0, "exact"
    related = RELATED_SKILLS.get(required_skill, set())
    if candidate_skills.intersection(related):
        return 0.72, "strong"
    skill_tokens = set(tokenize(required_skill))
    requirement_tokens = {token for token in tokenize(requirement["text"]) if token not in OVERLAP_STOPWORDS and token not in skill_tokens}
    resume_tokens = set(_expanded_tokens(candidate.get("raw_text", "")))
    if not requirement_tokens:
        return 0.0, "missing"
    overlap = len(requirement_tokens.intersection(resume_tokens)) / len(requirement_tokens)
    if overlap >= 0.5:
        return 0.46, "partial"
    if overlap > 0:
        return 0.22, "weak"
    return 0.0, "missing"


def evidence_score(skill: str, candidate: dict[str, Any], matched_chunk: dict[str, Any] | None) -> float:
    if not matched_chunk:
        return 0.0
    exact_chunks = [chunk for chunk in candidate.get("evidence_chunks", []) if skill in chunk.get("skills", [])]
    if not exact_chunks:
        # Semantic-only support: the chunk is topically related but never names
        # the skill — cap low so vague text cannot masquerade as evidence.
        return min(0.20, float(matched_chunk.get("evidence_strength", 0.0)) * 0.25)
    strengths = [float(chunk.get("evidence_strength", 0.0)) for chunk in exact_chunks]
    return min(1.0, max(strengths) + (0.05 * min(2, len(strengths) - 1)))


def calculate_candidate_score(job: dict[str, Any], candidate: dict[str, Any]) -> dict[str, Any]:
    requirements = job.get("requirements", [])
    engine_weights = job.get("weights") or {}
    w_keyword = float(engine_weights.get("keyword", 0.35))
    w_semantic = float(engine_weights.get("semantic", 0.35))
    w_evidence = float(engine_weights.get("evidence", 0.20))
    w_coverage = float(engine_weights.get("coverage", 0.10))
    matches: list[dict[str, Any]] = []
    weighted_keyword = weighted_semantic = weighted_evidence = weighted_coverage = total_weight = 0.0
    for requirement in requirements:
        weight = float(requirement.get("weight", 3))
        keyword, match_type = keyword_score(requirement, candidate)
        semantic, chunk = semantic_score(requirement["text"], candidate.get("evidence_chunks", []))
        skill = canonical_skill(requirement.get("normalized_skill") or requirement["text"])
        evidence = evidence_score(skill, candidate, chunk) if keyword or semantic >= 0.42 else 0.0
        coverage = 1.0 if keyword >= 0.7 or semantic >= 0.58 else (0.5 if semantic >= 0.42 else 0.0)
        if keyword == 0 and semantic < 0.42:
            match_type = "missing"
        elif keyword == 0 and semantic >= 0.42:
            match_type = "semantic"
        elif keyword < 0.7:
            match_type = "partial"
        final_requirement = (keyword * w_keyword) + (semantic * w_semantic) + (evidence * w_evidence) + (coverage * w_coverage)
        total_weight += weight
        weighted_keyword += keyword * weight
        weighted_semantic += semantic * weight
        weighted_evidence += evidence * weight
        weighted_coverage += coverage * weight
        matches.append(
            {
                "requirement_id": requirement["requirement_id"],
                "requirement": requirement["text"],
                "category": requirement.get("category", "REQUIRED_SKILL"),
                "required_or_preferred": requirement.get("required_or_preferred", "required"),
                "weight": weight,
                "keyword_score": round(keyword, 4),
                "semantic_score": round(semantic, 4),
                "evidence_score": round(evidence, 4),
                "coverage_score": round(coverage, 4),
                "final_requirement_score": round(final_requirement, 4),
                "match_type": match_type,
                "evidence": chunk["text"][:260] if chunk else "No supporting evidence was found in the uploaded resume.",
                "evidence_source": chunk.get("source") if chunk else None,
            }
        )
    total_weight = total_weight or 1.0
    keyword_avg = weighted_keyword / total_weight
    semantic_avg = weighted_semantic / total_weight
    evidence_avg = weighted_evidence / total_weight
    coverage_avg = weighted_coverage / total_weight
    required = [match for match in matches if match["required_or_preferred"] == "required"]
    missing_required = [match["requirement"] for match in required if match["match_type"] == "missing"]
    matched_required = [match["requirement"] for match in required if match["match_type"] != "missing"]
    matched_preferred = [match["requirement"] for match in matches if match["required_or_preferred"] == "preferred" and match["match_type"] != "missing"]
    penalty = min(30.0, len(missing_required) * 4.0)
    components = {
        "keyword_contribution": round(keyword_avg * w_keyword * 100, 2),
        "semantic_contribution": round(semantic_avg * w_semantic * 100, 2),
        "evidence_contribution": round(evidence_avg * w_evidence * 100, 2),
        "coverage_contribution": round(coverage_avg * w_coverage * 100, 2),
        "critical_penalty": round(penalty, 2),
    }
    base_score = components["keyword_contribution"] + components["semantic_contribution"] + components["evidence_contribution"] + components["coverage_contribution"]
    # Penalty never erases more than 85% of measured alignment — the bottom of
    # the pool keeps a meaningful gradient instead of collapsing to zero.
    final_score = max(0.0, min(100.0, base_score - min(penalty, base_score * 0.85)))
    strongest = sorted(
        [match for match in matches if match["evidence_score"] > 0],
        key=lambda match: (match["evidence_score"], match["weight"]),
        reverse=True,
    )[:4]
    return {
        "candidate_id": candidate["candidate_id"],
        "name": candidate["name"],
        "final_score": round(final_score, 2),
        "keyword_score": round(keyword_avg, 4),
        "semantic_score": round(semantic_avg, 4),
        "evidence_score": round(evidence_avg, 4),
        "coverage_score": round(coverage_avg, 4),
        "missing_required": missing_required,
        "matched_required": matched_required,
        "matched_preferred": matched_preferred,
        "critical_penalty": round(penalty, 2),
        "components": components,
        "matches": matches,
        "strongest_evidence": [
            {"requirement": item["requirement"], "source": item["evidence_source"], "text": item["evidence"]}
            for item in strongest
        ],
        "claimed_skills": candidate.get("claimed_skills", []),
        "demonstrated_skills": sorted({skill for chunk in candidate.get("evidence_chunks", []) if chunk.get("source") != "skills" for skill in chunk.get("skills", [])}),
        "engine_weights": {"keyword": w_keyword * 100, "semantic": w_semantic * 100, "evidence": w_evidence * 100, "coverage": w_coverage * 100},
    }


def rank_candidates(job: dict[str, Any], candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    results = [calculate_candidate_score(job, candidate) for candidate in candidates]
    results.sort(key=lambda item: (-item["final_score"], item["name"]))
    for rank, result in enumerate(results, start=1):
        result["rank"] = rank
    return results


def demo_job() -> dict[str, Any]:
    return {
        "job_id": "job-demo-backend-platform",
        "title": "Junior Full Stack Developer Intern",
        "company": "TechNova Solutions",
        "department": "Product Engineering",
        "location": "Bengaluru (Hybrid) · 6-Month Internship",
        "employment_type": "Internship",
        "demo": True,
        "description": "TechNova Solutions is looking for a Junior Full Stack Developer Intern. Build and ship features across React (frontend) and Node.js/Express (backend), design and consume REST APIs, work with SQL and NoSQL databases, use Git/GitHub, and collaborate in an agile team.",
        "requirements": [
            {"requirement_id": "req-1", "text": "JavaScript experience", "category": "REQUIRED_SKILL", "required_or_preferred": "required", "normalized_skill": "JavaScript", "weight": 10},
        ],
    }


def demo_candidates() -> list[dict[str, Any]]:
    resumes = [
        ("Maya Chen", "Python, NodeJS, REST API, SQL, Docker, AWS, Git, React\n\nEXPERIENCE\nBackend engineer intern at Lattice. Built and shipped REST APIs with Node.js, PostgreSQL and Docker on AWS. Added CI/CD checks and GitHub code review.\n\nPROJECTS\nBuilt a Kubernetes-monitored payments API with Redis caching."),
        ("Arjun Mehta", "Python, SQL, Docker, AWS, Git, React\n\nPROJECTS\nBuilt a FastAPI service with PostgreSQL, containerized with Docker, and deployed to AWS.\n\nINTERNSHIPS\nSoftware engineering intern: created REST endpoints, reviewed pull requests and maintained CI/CD workflows."),
        ("Sofia Alvarez", "Node.js, Express, REST, MongoDB, Docker, Git, React\n\nEXPERIENCE\nDeveloped Express.js APIs for a SaaS product and shipped Docker images through GitHub Actions.\n\nPROJECTS\nBuilt a React admin console and REST API with SQL reporting."),
        ("Noah Williams", "Python, SQL, Git, AWS\n\nEXPERIENCE\nData platform intern using Python and SQL to build internal services. Deployed scheduled jobs to AWS and documented code reviews.\n\nPROJECTS\nCreated a small Flask REST API."),
        ("Priya Shah", "JavaScript, NodeJS, SQL, Docker, Kubernetes, Git\n\nPROJECTS\nBuilt an Express Node.js REST API and deployed it with Docker and Kubernetes. Used PostgreSQL and GitHub Actions.\n\nCOURSEWORK\nCloud systems and distributed services."),
        ("Ethan Brooks", "Python, FastAPI, SQL, Docker, Git\n\nPROJECTS\nCreated a FastAPI backend with SQL migrations and Docker Compose. Added tests and pull request automation.\n\nEDUCATION\nComputer Science, systems track."),
        ("Lina Park", "Node.js, REST API, AWS, Git, React\n\nEXPERIENCE\nBuilt server-side services with Express and deployed Node.js applications to AWS.\n\nPROJECTS\nReact dashboard with REST integration; limited database ownership."),
        ("Omar Hassan", "Python, SQL, AWS, Git, Kubernetes\n\nINTERNSHIPS\nPlatform intern writing Python service scripts, managing SQL reports and operating Kubernetes workloads in AWS.\n\nPROJECTS\nDesigned a REST API prototype with Flask."),
        ("Camila Rossi", "JavaScript, React, NodeJS, MongoDB, Git\n\nEXPERIENCE\nFrontend engineer with React and Node.js features.\n\nPROJECTS\nShipped an Express REST API and documented MongoDB data models. No cloud deployment evidence."),
        ("Daniel Okafor", "Python, Docker, AWS, Git\n\nPROJECTS\nContainerized a Python worker and deployed it to AWS.\n\nCOURSEWORK\nSQL fundamentals and REST service design."),
        ("Grace Kim", "SQL, PostgreSQL, Python, React, Git\n\nEXPERIENCE\nAnalytics engineer building SQL models and Python data workflows.\n\nPROJECTS\nReact reporting portal with PostgreSQL; no API or cloud deployment evidence."),
        ("Leo Martin", "Node, Express, REST, SQL, Docker, Git, CI/CD\n\nPROJECTS\nBuilt and tested a Node.js REST service with SQL persistence and Docker.\n\nEXPERIENCE\nMaintained GitHub Actions pipelines for a student engineering team."),
        ("Aisha Rahman", "Python, Flask, SQL, Git, AWS, React\n\nEXPERIENCE\nBuilt Flask APIs and SQL data pipelines during an internship.\n\nPROJECTS\nDeployed a small Python service to AWS and created a React client."),
        ("Jon Bell", "Kubernetes, Docker, AWS, Git, Redis\n\nEXPERIENCE\nSite reliability apprentice operating Docker workloads, Kubernetes deployments and Redis services on AWS.\n\nCOURSEWORK\nBackend API architecture."),
        ("Nora Silva", "Java, C++, SQL, Git\n\nPROJECTS\nBuilt a Java service with SQL storage and Git collaboration.\n\nEDUCATION\nComputer Engineering; backend systems coursework."),
        ("Theo Grant", "Python, JavaScript, React, Git\n\nPROJECTS\nCreated a React portfolio and Python scripts.\n\nCOURSEWORK\nIntroductory databases and web services."),
        ("Ivy Thompson", "AWS, Docker, SQL, Git\n\nCERTIFICATIONS\nAWS Cloud Practitioner and Docker fundamentals.\n\nPROJECTS\nContainerized a SQL-backed service for a coursework demo."),
        ("Samir Patel", "Python, NodeJS, REST API, SQL, Docker, AWS, Kubernetes, React, Git, CI/CD\n\nSKILLS\nLists broad backend and cloud technologies.\n\nEDUCATION\nComputer Science graduate."),
    ]
    candidates: list[dict[str, Any]] = []
    for index, (name, resume) in enumerate(resumes, start=1):
        parsed = parse_resume(resume, f"candidate-demo-{index:02d}", name)
        parsed["candidate_id"] = f"candidate-demo-{index:02d}"
        parsed["email"] = f"candidate{index:02d}@demo.hirelens.ai"
        parsed["demo"] = True
        candidates.append(parsed)
    return candidates