# HireLens — PRD

## Original Problem Statement
Build HIRELENS, a hackathon-ready AI talent intelligence platform. Primary focus: recruiter-side Smart Shortlisting Engine that ranks ~18 resumes against a JD using a deterministic hybrid scoring pipeline (keyword 35% + semantic 35% + evidence 20% + coverage 10%, minus critical-requirement penalties). LLMs only for JD extraction, grounded explanations, Recruiter AI, JD insights — never for the numerical score. User chose: Emergent universal LLM key, Demo Login with seeded dataset, bottom tabs + stack detail screens. User later supplied the REAL candidate dataset (Google Drive, 220 files) and asked to replace sample data.

## User Personas
- Recruiter / Hiring Manager / HR / Founder (primary, hackathon demo)
- Student / Candidate (future Phase 5 module, beta-flagged only)

## Architecture
- **Backend** `/app/backend/server.py` (FastAPI, MongoDB) + `/app/backend/ranking_engine.py` (deterministic pipeline: parse → sections → evidence chunks → keyword engine w/ skill ontology + stopword-filtered overlap → 256-dim hashed embeddings + cosine → evidence strength hierarchy → hybrid weighted score → rank).
- **Dataset** `/app/backend/dataset/*.txt` — 18 real resumes from user's Drive (InternLoom-style pool across SDE, Python, Data Science, App Dev, Cyber Security, Content, Founder's Office, IT Support, Sales). Seeded at startup with content-aware reseed check.
- **Frontend** Expo Router: `app/index.tsx` (auth/demo/Google), `app/(tabs)/` (overview, jobs, rankings, ai), stack screens `app/candidate/[id].tsx`, `app/compare.tsx`, `app/technical.tsx`, `app/insights.tsx`, `app/job/new.tsx`. Shared kit `src/components/ui.tsx`, theme `src/theme.ts`, data `src/api.ts` + `src/hooks.ts` (react-query), session `src/session.ts`.

## Implemented (2026-09-12)
- **Real dataset live**: 18 actual resumes parsed & ranked (Meera Pillai 56.2 → Varun Kapoor 1.02, full gradient, deterministic run-twice identical). Fictional sample data removed. JD "Backend Platform Engineer" (id `job-demo-backend-platform`) retained until official JD arrives.
- Ranking engine tuned on real data: stopword-filtered keyword overlap, semantic-only evidence capped at 0.20, penalty 4 pts/missing critical capped at 85% of base.
- Job management: create job + paste JD → LLM-assisted requirement extraction with review screen → confirm & set active; job switcher (persisted active job); delete non-demo jobs (demo job protected, 400); resume batch upload (PDF/DOCX/TXT via PyMuPDF/python-docx).
- Auth: demo login + email/password JWT + Emergent-managed Google Sign-In (session exchange, user upsert, 7-day token), persistent session, sign-out.
- Tabs: Overview (live DB metrics), Jobs, Rankings (top-3 podium + 18 rows + CSV export), Recruiter AI (grounded Q&A, LLM + deterministic fallback). Stack: Candidate detail (breakdown, claimed-vs-demonstrated, requirement matrix, critical gaps), Compare (Why A>B? grounded), Technical View (pipeline + per-requirement telemetry), JD Insights (exact-year/degree/density/duplicate/narrow-stack heuristics), New Job.
- Testing: iteration_1 (20/20 backend + full frontend), iteration_2 (Google auth 8/8), iteration_3 (16/16 backend + full frontend incl. job lifecycle + CSV).

## Backlog
- P0: Swap in official hackathon JD (and any final resumes) when user provides them (~2pm) — via Jobs → New Job or replace demo JD
- P1: Settings screen (weight configurability, account)
- P2: Student mode (profile, opportunity match, skill gap, roadmap, proof-of-skill)
- P2: Production hardening — current_user falls back to demo user on invalid token (intentional for demo)

## Next Tasks
1. Load official hackathon JD + resumes when provided at ~2pm
2. Final pre-demo smoke test on device via Expo Go QR
