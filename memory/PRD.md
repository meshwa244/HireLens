# HireLens — PRD

## Original Problem Statement
Build HIRELENS, a hackathon-ready AI talent intelligence platform. Primary focus: recruiter-side Smart Shortlisting Engine that ranks ~18 resumes against a JD using a deterministic hybrid scoring pipeline (keyword 35% + semantic 35% + evidence 20% + coverage 10%, minus critical-requirement penalties). LLMs only for JD extraction, grounded explanations, Recruiter AI, JD insights — never for the numerical score. User chose: Emergent universal LLM key, Demo Login with seeded 18-candidate dataset, bottom tabs + stack detail screens.

## User Personas
- Recruiter / Hiring Manager / HR / Founder (primary, hackathon demo)
- Student / Candidate (future Phase 5 module, beta-flagged only)

## Architecture
- **Backend** `/app/backend/server.py` (FastAPI, MongoDB) + `/app/backend/ranking_engine.py` (deterministic pipeline: parse → sections → evidence chunks → keyword engine w/ skill ontology + aliases → hashed local embeddings + cosine → evidence strength hierarchy → hybrid weighted score → rank).
- **Frontend** Expo Router: `app/index.tsx` (auth/demo), `app/(tabs)/` (overview, jobs, rankings, ai), stack screens `app/candidate/[id].tsx`, `app/compare.tsx`, `app/technical.tsx`, `app/insights.tsx`. Shared kit `src/components/ui.tsx`, theme `src/theme.ts`, data layer `src/api.ts` + `src/hooks.ts` (react-query), session `src/session.ts` (secure token storage).
- **DB**: jobs, candidates, users, screening_runs collections (MongoDB).

## Implemented (2026-09-12)
- Seeded demo job (Backend Platform Engineer, 10 weighted requirements) + 18 realistic demo resumes, all scored by the real engine (top-3: Maya Chen 74.2, Leo Martin 67.97, Arjun Mehta 66.85; deterministic, run-twice identical).
- Auth: demo login + real email/password signup/login with JWT, persistent session, sign-out.
- Tabs: Overview (live DB metrics, pipeline card, analyze trigger), Jobs (JD detail, requirement chips, resume upload via DocumentPicker, technical/insights links), Rankings (top-3 podium + 18-row list), Recruiter AI (grounded Q&A with LLM + deterministic fallback, chat composer).
- Stack screens: Candidate detail (score circle, 4-component breakdown, penalty, evidence cards, claimed-vs-demonstrated, requirement matrix, critical gaps), Compare (A/B chip selection, VS table, grounded "Why A > B?" via LLM), Technical View (pipeline stages, engine weights, per-requirement telemetry), JD Insights (quality/bias review prompts, student beta card).
- Testing: 20/20 backend pytest + full Playwright frontend pass (iteration_1).

## Backlog
- P0: Emergent-managed Google Auth on auth screen (real login flow)
- P0: New job creation + JD paste/PDF upload UI wired to existing POST endpoints
- P1: CSV export of rankings
- P1: Deeper JD quality analysis (exact-year/degree restriction detection)
- P2: Student mode (profile, opportunity match, skill gap, roadmap, proof-of-skill)
- P2: Settings screen (weight configurability, account)

## Next Tasks
1. Integrate Emergent-managed Google Auth (call integration_expert first)
2. Job creation form + JD upload/paste flow
3. Rankings CSV export
