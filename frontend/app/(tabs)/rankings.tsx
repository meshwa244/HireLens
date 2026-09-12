import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";

import { api, type Ranking } from "@/src/api";
import { EmptyState, Icon, Pill, ScreenHeader, SectionTitle, useUiStyles } from "@/src/components/ui";
import { useActiveJob, useScreening } from "@/src/hooks";
import { useTheme } from "@/src/theme";
function CandidateRow({ item, onPress }: { item: Ranking; onPress: () => void }) {
  const styles = useUiStyles();
  const { colors } = useTheme();
  const evidenceTone = item.evidence_score > 0.65 ? "success" : item.evidence_score > 0.4 ? "warning" : "error";
  return (
    <Pressable testID={`candidate-row-${item.candidate_id}`} onPress={onPress} style={({ pressed }) => [styles.candidateRow, pressed && styles.buttonPressed]}>
      <View style={styles.rankNumber}>
        <Text style={styles.rankNumberText}>{String(item.rank).padStart(2, "0")}</Text>
      </View>
      <View style={styles.candidateMain}>
        <Text style={styles.candidateName}>{item.name}</Text>
        <Text style={styles.candidateSub}>{item.matched_required.length} required · {item.missing_required.length} critical missing</Text>
      </View>
      <View style={styles.candidateScore}>
        <Text style={[styles.rowScore, item.final_score >= 70 && { color: colors.brand }]}>{item.final_score.toFixed(1)}</Text>
        <Pill label={evidenceTone === "success" ? "Strong" : evidenceTone === "warning" ? "Medium" : "Weak"} tone={evidenceTone} />
      </View>
      <Icon name="chevron-right" color={colors.muted} size={18} />
    </Pressable>
  );
}

export default function RankingsTab() {
  const styles = useUiStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const job = useActiveJob();
  const screeningQuery = useScreening(job?.job_id);
  const rankings = screeningQuery.data?.rankings ?? [];
  const top = rankings.slice(0, 3);

  const openCandidate = (ranking: Ranking) => router.push({ pathname: "/candidate/[id]", params: { id: ranking.candidate_id } });

  return (
    <View style={styles.flex} testID="rankings-screen">
      <ScreenHeader title="Rankings" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={screeningQuery.isRefetching} onRefresh={() => void screeningQuery.refetch()} tintColor={colors.brand} />}
      >
        <View style={styles.rankingHeading}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>SCREENING RUN · COMPLETE</Text>
            <Text style={styles.sectionTitle}>Ranked by evidence</Text>
            <Text style={styles.mutedText}>{rankings.length} candidates · deterministic hybrid engine</Text>
          </View>
          <Pressable testID="rankings-export-button" onPress={() => job && void Linking.openURL(api.exportUrl(job.job_id))} style={[styles.compareButton, { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.borderStrong, marginRight: 8 }]}>
            <Icon name="download-outline" color={colors.brand} size={17} />
            <Text style={[styles.compareButtonText, { color: colors.brand }]}>CSV</Text>
          </Pressable>
          <Pressable testID="rankings-compare-button" onPress={() => router.push("/compare")} style={styles.compareButton}>
            <Icon name="compare-horizontal" color={styles.compareButtonText.color as string} size={17} />
            <Text style={styles.compareButtonText}>Compare</Text>
          </Pressable>
        </View>

        {top.length ? (
          <View style={styles.topGrid} testID="top-three-grid">
            {top.map((item) => (
              <Pressable testID={`top-candidate-${item.rank}`} key={item.candidate_id} onPress={() => openCandidate(item)} style={({ pressed }) => [styles.topCard, item.rank === 1 && styles.topCardPrimary, pressed && styles.buttonPressed]}>
                <View style={styles.rankBadge}>
                  <Text style={styles.rankBadgeText}>0{item.rank}</Text>
                </View>
                <Text style={styles.topName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.topScore}>{item.final_score.toFixed(1)}</Text>
                <Text style={styles.topMeta}>{item.matched_required.length}/{item.matched_required.length + item.missing_required.length} required matched</Text>
                <View style={styles.miniBar}>
                  <View style={[styles.miniBarFill, { width: `${Math.min(100, item.final_score)}%` }]} />
                </View>
                <Pill label={`${Math.round(item.evidence_score * 100)}% evidence`} tone={item.evidence_score > 0.65 ? "success" : "warning"} />
              </Pressable>
            ))}
          </View>
        ) : (
          <EmptyState testID="rankings-empty" text="Run the screening engine to rank candidates." />
        )}

        <SectionTitle eyebrow="FULL CANDIDATE POOL" title={`${rankings.length} candidates`} />
        {rankings.map((item) => (
          <CandidateRow key={item.candidate_id} item={item} onPress={() => openCandidate(item)} />
        ))}
      </ScrollView>
    </View>
  );
}
