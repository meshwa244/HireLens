import { useQuery, useQueryClient } from "@tanstack/react-query";

import { api, type Job } from "@/src/api";

export function useJobs() {
  return useQuery({ queryKey: ["jobs"], queryFn: () => api.jobs() });
}

export function useActiveJob(): Job | null {
  const { data } = useJobs();
  if (!data?.length) return null;
  // The seeded demo pipeline anchors the workspace; never let a freshly
  // created (candidate-less) job hijack rankings, AI and technical views.
  return data.find((job) => job.demo) ?? data[0];
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
