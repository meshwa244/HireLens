import { useQuery, useQueryClient } from "@tanstack/react-query";

import { api, type Job } from "@/src/api";
import { storage } from "@/src/utils/storage";

const ACTIVE_JOB_KEY = "hirelens_active_job_id";

export function useJobs() {
  return useQuery({ queryKey: ["jobs"], queryFn: () => api.jobs() });
}

export function useActiveJob(): Job | null {
  const { data: jobs } = useJobs();
  const { data: activeId } = useQuery({
    queryKey: ["activeJobId"],
    queryFn: () => storage.getItem(ACTIVE_JOB_KEY, null),
  });
  if (!jobs?.length) return null;
  return jobs.find((job) => job.job_id === activeId) ?? jobs.find((job) => job.demo) ?? jobs[0];
}

export function useSetActiveJob() {
  const queryClient = useQueryClient();
  return async (jobId: string) => {
    await storage.setItem(ACTIVE_JOB_KEY, jobId);
    await queryClient.invalidateQueries({ queryKey: ["activeJobId"] });
  };
}

export function useOverview() {
  return useQuery({ queryKey: ["overview"], queryFn: () => api.overview() });
}

export function useScreening(jobId?: string) {
  return useQuery({
    queryKey: ["screening", jobId],
    queryFn: () => api.screening(jobId as string),
    enabled: Boolean(jobId),
  });
}

export function useCandidate(candidateId?: string) {
  return useQuery({
    queryKey: ["candidate", candidateId],
    queryFn: () => api.candidate(candidateId as string),
    enabled: Boolean(candidateId),
  });
}

export function useRefreshPipeline() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["overview"] }),
      queryClient.invalidateQueries({ queryKey: ["jobs"] }),
      queryClient.invalidateQueries({ queryKey: ["screening"] }),
      queryClient.invalidateQueries({ queryKey: ["candidate"] }),
    ]);
  };
}
