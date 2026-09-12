import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";

import { api } from "@/src/api";
import { Icon, MetricCard, Pill, PrimaryButton, ScreenHeader, SectionTitle, useUiStyles } from "@/src/components/ui";
import { useActiveJob, useOverview, useScreening } from "@/src/hooks";
import { clearSession, getStoredUser } from "@/src/session";
import { useTheme } from "@/src/theme";

export default function OverviewTab() {
  const styles = useUiStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const overviewQuery = useOverview();
  const job = useActiveJob();
  const screeningQuery = useScreening(job?.job_id);
  const [analyzing, setAnalyzing] = useState(false);
  const [initials, setInitials] = useState("DR");

  useEffect(() => {
    void getStoredUser().then((user) => {
      const parts = user.full_name.split(" ").filter(Boolean);
      setInitials(parts.map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "DR");
    });
  }, []);

  const overview = overviewQuery.data ?? null;
  const rankings = screeningQuery.data?.rankings ?? [];
  const refreshing = overviewQuery.isRefetching || screeningQuery.isRefetching;

  const refresh = async () => {
    await Promise.all([overviewQuery.refetch(), screeningQuery.refetch()]);
  };

  const runAnalysis = async () => {
    if (!job) return;
    setAnalyzing(true);
    try {
      const result = await api.run(job.job_id);
      queryClient.setQueryData(["screening", job.job_id], result);
      await overviewQuery.refetch();
      router.navigate("/(tabs)/rankings");
    } finally {
      setAnalyzing(false);
    }
  };

  const signOut = async () => {
    await clearSession();
    router.replace("/");
  };

  return (
    <View style={styles.flex} testID="overview-screen">
      <ScreenHeader title="Overview" initials={initials} onAvatarPress={signOut} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.brand} />}
      >
        <View style={styles.heroPanel}>
          <View style={styles.heroAccent} />
          <Text style={styles.eyebrow}>EVIDENCE-BASED TALENT INTELLIGENCE</Text>
          <Text style={styles.heroTitle}>Search beyond{`\n`}keywords.</Text>
          <Text style={styles.heroText}>We don&apos;t ask an LLM who should be hired. We build the ranking from measurable evidence.</Text>
          <View style={styles.engineLine}>
            <View style={styles.liveDot} />
            <Text style={styles.engineText}>HYBRID ENGINE ONLINE</Text>
            <Text style={styles.engineMeta}>35% keyword · 35% semantic · 20% evidence · 10% coverage</Text>
          </View>
        </View>

        <SectionTitle eyebrow="LIVE TELEMETRY" title="Workspace pulse" />
        <View style={styles.metricsGrid}>
          <MetricCard testID="metric-jobs" label="Jobs analyzed" value={overview?.jobs_analyzed ?? "—"} icon="briefcase-outline" accent />
          <MetricCard testID="metric-candidates" label="Candidates screened" value={overview?.candidates_screened ?? "—"} icon="account-group-outline" />
          <MetricCard testID="metric-average" label="Average score" value={overview ? `${overview.average_score}` : "—"} icon="chart-line" />
          <MetricCard testID="metric-strong" label="Strong matches" value={overview?.strong_matches ?? "—"} icon="check-decagram-outline" accent />
        </View>

        {job ? (
          <>
            <SectionTitle eyebrow="ACTIVE PIPELINE" title={job.title} action="Open job" onAction={() => router.navigate("/(tabs)/jobs")} />
            <View style={styles.jobSummary} testID="overview-job-card">
              <View style={styles.jobHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.jobCompany}>{job.company} · {job.department}</Text>
                  <Text style={styles.jobTitle}>{job.title}</Text>
                </View>
                <Pill label="DEMO DATASET" tone="success" />
              </View>
              <Text style={styles.jobMeta}>{job.location}  ·  {job.candidate_count ?? rankings.length} candidates  ·  {job.requirements.filter((req) => req.required_or_preferred === "required").length} required signals</Text>
              <View style={styles.jobProgress}>
                <View style={[styles.jobProgressFill, { width: `${Math.min(100, (rankings.length / 18) * 100)}%` }]} />
              </View>
              <View style={styles.jobActions}>
                <PrimaryButton testID="overview-analyze-button" label={analyzing ? "Running hybrid engine" : "Analyze candidates"} icon="play-circle-outline" onPress={() => void runAnalysis()} loading={analyzing} />
                <Pressable testID="overview-inspect-pipeline" onPress={() => router.push({ pathname: "/technical", params: { jobId: job.job_id } })} style={styles.textButton}>
                  <Text style={styles.actionText}>Inspect pipeline</Text>
                  <Icon name="arrow-right" color={colors.brand} size={16} />
                </Pressable>
              </View>
            </View>
          </>
        ) : null}

        <SectionTitle eyebrow="RANKING PHILOSOPHY" title="Score beyond similarity" />
        <View style={styles.philosophyRow}>
          <View style={styles.philosophyIcon}>
            <Icon name="text-search" color={colors.brand} size={20} />
          </View>
          <View style={styles.philosophyCopy}>
            <Text style={styles.philosophyTitle}>A skill mention isn&apos;t skill evidence.</Text>
            <Text style={styles.philosophyText}>Projects, internships and experience carry more weight than a crowded skills list.</Text>
          </View>
        </View>

        <Pressable testID="student-mode-entry" onPress={() => router.push("/student")} style={({ pressed }) => [styles.philosophyRow, pressed && styles.buttonPressed]}>
          <View style={[styles.philosophyIcon, { backgroundColor: colors.surfaceTertiary }]}>
            <Icon name="school-outline" color={colors.info} size={20} />
          </View>
          <View style={styles.philosophyCopy}>
            <Text style={styles.philosophyTitle}>Student Mode · beta</Text>
            <Text style={styles.philosophyText}>See your skill gap and a Learn → Build → Prove → Apply roadmap for this role.</Text>
          </View>
          <Icon name="arrow-right" color={colors.info} size={18} />
        </Pressable>
        <Text style={styles.integrityNote}>Tap your avatar to sign out of the workspace.</Text>
      </ScrollView>
    </View>
  );
}
