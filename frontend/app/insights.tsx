import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";

import { api } from "@/src/api";
import { Icon, Pill, ScreenHeader, useUiStyles } from "@/src/components/ui";
import { useActiveJob } from "@/src/hooks";
import { useTheme } from "@/src/theme";

export default function InsightsScreen() {
  const styles = useUiStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ jobId?: string }>();
  const activeJob = useActiveJob();
  const jobId = params.jobId ?? activeJob?.job_id;
  const { data, isLoading } = useQuery({
    queryKey: ["insights", jobId],
    queryFn: () => api.insights(jobId as string),
    enabled: Boolean(jobId),
  });

  return (
    <View style={styles.flex} testID="insights-screen">
      <ScreenHeader title="JD Insights" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>QUALITY CHECK</Text>
        <Text style={styles.detailName}>Read the JD critically.</Text>
        <Text style={styles.mutedText}>Review prompts help recruiters validate scope without making legal conclusions.</Text>

        {isLoading ? (
          <View style={styles.loadingRoot}>
            <ActivityIndicator color={colors.brand} size="large" />
          </View>
        ) : (
          (data?.insights ?? []).map((insight) => (
            <View key={insight.title} style={styles.insightCard} testID={`insight-${insight.severity}`}>
              <View style={[styles.insightIcon, { backgroundColor: insight.severity === "warning" ? colors.warning : insight.severity === "success" ? colors.success : colors.info }]}>
                <Icon name={insight.severity === "warning" ? "alert-outline" : insight.severity === "success" ? "check" : "information-outline"} color={colors.onWarning} size={19} />
              </View>
              <View style={styles.insightCopy}>
                <Text style={styles.insightTitle}>{insight.title}</Text>
                <Text style={styles.insightBody}>{insight.body}</Text>
              </View>
            </View>
          ))
        )}

        <View style={styles.futureCard} testID="student-beta-card">
          <Pill label="FUTURE-READY" tone="info" />
          <Text style={styles.futureTitle}>Student intelligence architecture</Text>
          <Text style={styles.futureText}>Skill gaps, opportunity matching and Learn → Build → Prove → Apply are prepared as a separate beta surface.</Text>
        </View>
      </ScrollView>
    </View>
  );
}
