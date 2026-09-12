import { useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";

import { api, type Job } from "@/src/api";
import { DetailStat, EmptyState, Icon, Pill, PrimaryButton, ScreenHeader, SectionTitle, SmallAction, useUiStyles } from "@/src/components/ui";
import { useActiveJob, useJobs, useRefreshPipeline, useSetActiveJob } from "@/src/hooks";
import { useTheme } from "@/src/theme";

function ActiveJobCard({ job }: { job: Job }) {
  const styles = useUiStyles();
  const router = useRouter();
  const queryClient = useQueryClient();
  const refreshPipeline = useRefreshPipeline();
  const [analyzing, setAnalyzing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState("");

  const runAnalysis = async () => {
    setAnalyzing(true);
    try {
      const result = await api.run(job.job_id);
      queryClient.setQueryData(["screening", job.job_id], result);
      router.navigate("/(tabs)/rankings");
    } finally {
      setAnalyzing(false);
    }
  };

  const uploadResumes = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "text/plain", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
      multiple: true,
    });
    if (result.canceled) return;
    setUploading(true);
    setNotice("");
    try {
      const uploaded = await api.uploadCandidates(job.job_id, result.assets.map((asset) => ({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType })));
      setNotice(`${uploaded.count} resume${uploaded.count === 1 ? "" : "s"} parsed and ranked by the hybrid engine.`);
      await refreshPipeline();
    } catch {
      setNotice("Upload failed. Check the files and try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={styles.largeJobCard} testID="job-detail-card">
      <View style={styles.jobHeader}>
        <View style={{ flex: 1 }}>
          <Pill label={job.demo ? "DEMO DATASET" : "ACTIVE ROLE"} tone="success" />
          <Text style={[styles.jobTitle, { marginTop: 12 }]}>{job.title}</Text>
          <Text style={styles.jobCompany}>{job.company || "—"} · {job.department || "General"}</Text>
        </View>
        <Icon name="briefcase-outline" color={styles.topIcon.color as string} size={22} />
      </View>
      <View style={styles.detailGrid}>
        <DetailStat label="CANDIDATES" value={String(job.candidate_count ?? 0)} />
        <DetailStat label="REQUIRED" value={String(job.requirements.filter((item) => item.required_or_preferred === "required").length)} />
        <DetailStat label="PREFERRED" value={String(job.requirements.filter((item) => item.required_or_preferred === "preferred").length)} />
      </View>
      <Text style={styles.jobDescription} numberOfLines={5}>{job.description}</Text>
      {job.requirements.length ? (
        <View style={styles.chipWrap}>
          {job.requirements.slice(0, 8).map((item) => (
            <Pill key={item.requirement_id} label={item.normalized_skill} tone={item.required_or_preferred === "required" ? "info" : "neutral"} />
          ))}
        </View>
      ) : (
        <Text style={[styles.mutedText, { marginTop: 14 }]}>No requirements extracted yet. Edit the JD to run requirement extraction.</Text>
      )}
      <PrimaryButton testID="jobs-analyze-button" label={analyzing ? "Running hybrid engine" : "Analyze candidates"} icon="play-circle-outline" onPress={() => void runAnalysis()} loading={analyzing} />
      {notice ? <Text testID="jobs-upload-notice" style={[styles.mutedText, { marginTop: 10 }]}>{notice}</Text> : null}
      <View style={styles.actionGrid}>
        <SmallAction testID="jobs-upload-button" icon="file-upload-outline" label={uploading ? "Parsing..." : "Import resumes"} onPress={() => void uploadResumes()} />
        <SmallAction testID="jobs-technical-button" icon="chart-timeline-variant" label="Technical view" onPress={() => router.push({ pathname: "/technical", params: { jobId: job.job_id } })} />
        <SmallAction testID="jobs-insights-button" icon="alert-circle-outline" label="JD insights" onPress={() => router.push({ pathname: "/insights", params: { jobId: job.job_id } })} />
      </View>
    </View>
  );
}

function OtherJobRow({ job }: { job: Job }) {
  const styles = useUiStyles();
  const { colors } = useTheme();
  const setActiveJob = useSetActiveJob();
  const refreshPipeline = useRefreshPipeline();
  const [deleting, setDeleting] = useState(false);

  const activate = async () => {
    await setActiveJob(job.job_id);
    await refreshPipeline();
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await api.deleteJob(job.job_id);
      await refreshPipeline();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <View style={styles.candidateRow} testID={`job-row-${job.job_id}`}>
      <View style={styles.candidateMain}>
        <Text style={styles.candidateName} numberOfLines={1}>{job.title}</Text>
        <Text style={styles.candidateSub}>{job.candidate_count ?? 0} candidates · {job.requirements.length} requirements</Text>
      </View>
      <Pressable testID={`job-activate-${job.job_id}`} onPress={() => void activate()} style={({ pressed }) => [styles.smallAction, { flex: 0, minHeight: 44, paddingHorizontal: 12 }, pressed && styles.buttonPressed]}>
        <Text style={[styles.smallActionText, { color: colors.brand }]}>Set active</Text>
      </Pressable>
      {job.demo ? null : (
        <Pressable testID={`job-delete-${job.job_id}`} onPress={() => void remove()} disabled={deleting} hitSlop={8} style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}>
          <Icon name="trash-can-outline" color={colors.error} size={19} />
        </Pressable>
      )}
    </View>
  );
}

export default function JobsTab() {
  const styles = useUiStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const jobsQuery = useJobs();
  const activeJob = useActiveJob();
  const refreshPipeline = useRefreshPipeline();
  const jobs = jobsQuery.data ?? [];
  const others = jobs.filter((job) => job.job_id !== activeJob?.job_id);

  return (
    <View style={styles.flex} testID="jobs-screen">
      <ScreenHeader title="Jobs" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={jobsQuery.isRefetching} onRefresh={() => void refreshPipeline()} tintColor={colors.brand} />}
      >
        <SectionTitle eyebrow="PIPELINE LIBRARY" title="Jobs" action="+ New job" onAction={() => router.push("/job/new")} />
        {activeJob ? (
          <ActiveJobCard job={activeJob} />
        ) : (
          <EmptyState text="No open job descriptions found. Create a job to begin smart ranking." />
        )}
        {others.length ? (
          <>
            <SectionTitle eyebrow="OTHER PIPELINES" title={`${others.length} more`} />
            {others.map((job) => (
              <OtherJobRow key={job.job_id} job={job} />
            ))}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}
