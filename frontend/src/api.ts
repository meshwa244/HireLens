import Constants from "expo-constants";

import { storage } from "@/src/utils/storage";

export const TOKEN_KEY = "hirelens_token";

const baseUrl = String(
  Constants.expoConfig?.extra?.backendUrl ?? process.env.EXPO_PUBLIC_BACKEND_URL ?? "",
).replace(/\/$/, "");

export type Job = {
  job_id: string;
  title: string;
  company: string;
  department: string;
  location: string;
  employment_type: string;
  description: string;
  demo?: boolean;
  candidate_count?: number;
  requirements: Requirement[];
};

export type Requirement = {
  requirement_id: string;
  text: string;
  category: string;
  required_or_preferred: string;
  normalized_skill: string;
  weight: number;
};

export type Ranking = {
  candidate_id: string;
  name: string;
  rank: number;
  final_score: number;
  keyword_score: number;
  semantic_score: number;
  evidence_score: number;
  coverage_score: number;
  missing_required: string[];
  matched_required: string[];
  matched_preferred: string[];
  critical_penalty: number;
  components: {
    keyword_contribution: number;
    semantic_contribution: number;
    evidence_contribution: number;
    coverage_contribution: number;
    critical_penalty: number;
  };
  matches: Match[];
  strongest_evidence: { requirement: string; source?: string; text: string }[];
  claimed_skills: string[];
  demonstrated_skills: string[];
};

export type Match = {
  requirement_id: string;
  requirement: string;
  category: string;
  required_or_preferred: string;
  weight: number;
  keyword_score: number;
  semantic_score: number;
  evidence_score: number;
  coverage_score: number;
  final_requirement_score: number;
  match_type: string;
  evidence: string;
  evidence_source?: string;
};

export type Overview = {
  jobs_analyzed: number;
  candidates_screened: number;
  candidates_ranked: number;
  average_score: number;
  strong_matches: number;
  distribution: Record<string, number>;
  latest_job?: Job;
};

export type Screening = {
  screening_id: string;
  job_id: string;
  status: string;
  stages: { label: string; status: string }[];
  rankings: Ranking[];
  engine: { keyword_weight: number; semantic_weight: number; evidence_weight: number; coverage_weight: number; semantic_method: string };
};

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = await storage.secureGet(TOKEN_KEY, null);
  const response = await fetch(`${baseUrl}/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  demoLogin: () => request<{ token: string; user: { full_name: string; role: string } }>("/auth/demo", { method: "POST" }),
  googleSession: (session_id: string) => request<{ session_token: string; user: { full_name: string; role: string } }>("/auth/session", { method: "POST", body: JSON.stringify({ session_id }) }),
  createJob: (payload: { title: string; company: string; department: string; location: string; employment_type: string; description: string }) => request<Job>("/jobs", { method: "POST", body: JSON.stringify(payload) }),
  deleteJob: (jobId: string) => request<{ deleted: string }>(`/jobs/${jobId}`, { method: "DELETE" }),
  uploadJD: async (jobId: string, text: string) => {
    const form = new FormData();
    form.append("text", text);
    const token = await storage.secureGet(TOKEN_KEY, null);
    const response = await fetch(`${baseUrl}/api/jobs/${jobId}/jd`, { method: "POST", body: form, headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!response.ok) throw new Error(await response.text());
    return response.json() as Promise<Job>;
  },
  login: (email: string, password: string) => request<{ token: string; user: { full_name: string; role: string } }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  signup: (full_name: string, email: string, password: string, organization: string) => request<{ token: string; user: { full_name: string; role: string } }>("/auth/signup", { method: "POST", body: JSON.stringify({ full_name, email, password, organization, role: "Recruiter" }) }),
  overview: () => request<Overview>("/overview"),
  jobs: () => request<Job[]>("/jobs"),
  job: (jobId: string) => request<Job>(`/jobs/${jobId}`),
  run: (jobId: string) => request<Screening>(`/screenings/${jobId}/run`, { method: "POST" }),
  screening: (jobId: string) => request<Screening>(`/screenings/screening-${jobId}`),
  candidate: (candidateId: string) => request<{ candidate: Record<string, unknown>; ranking: Ranking }>(`/candidates/${candidateId}`),
  technical: (jobId: string) => request<{ stages: Screening["stages"]; engine: Screening["engine"]; sample_candidate: Ranking; requirements: Requirement[] }>(`/jobs/${jobId}/technical-analysis`),
  insights: (jobId: string) => request<{ insights: { severity: string; title: string; body: string }[] }>(`/jobs/${jobId}/insights`),
  ask: (jobId: string, question: string) => request<{ answer: string; grounded: boolean; sources: string[] }>("/recruiter-ai/query", { method: "POST", body: JSON.stringify({ job_id: jobId, question }) }),
  uploadCandidates: async (jobId: string, files: { uri: string; name: string; mimeType?: string }[]) => {
    const form = new FormData();
    files.forEach((file) => form.append("files", { uri: file.uri, name: file.name, type: file.mimeType ?? "application/octet-stream" } as unknown as Blob));
    const response = await fetch(`${baseUrl}/api/jobs/${jobId}/candidates/upload`, { method: "POST", body: form });
    if (!response.ok) throw new Error(await response.text());
    return response.json() as Promise<{ count: number }>;
  },
  exportUrl: (jobId: string) => `${baseUrl}/api/screenings/screening-${jobId}/export.csv`,
};
