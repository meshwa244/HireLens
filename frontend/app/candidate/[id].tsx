import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";

import type { Match } from "@/src/api";
import { EmptyState, Icon, Pill, PrimaryButton, ScreenHeader, SectionTitle, useUiStyles } from "@/src/components/ui";
import { useCandidate } from "@/src/hooks";
import { useTheme } from "@/src/theme";

function Breakdown({ label, value, max, color, testID }: { label: string; value: number; max: number; color: string; testID: string }) {
  const styles = useUiStyles();
  return (
    <View style={styles.breakdownRow} testID={testID}>
      <View style={styles.breakdownLabel}>
        <Text style={styles.breakdownName}>{label}</Text>
        <Text style={styles.breakdownValue}>{value.toFixed(1)} / {max}</Text>
      </View>
      <View style={styles.breakdownTrack}>
        <View style={[styles.breakdownFill, { width: `${Math.min(100, (value / max) * 100)}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

function MatchRow({ match }: { match: Match }) {
  const styles = useUiStyles();
  const { colors } = useTheme();
  const tone = match.match_type === "missing" ? "error" : match.match_type === "exact" ? "success" : match.match_type === "semantic" ? "info" : "warning";
  return (
    <View style={styles.matchRow} testID={`match-row-${match.requirement_id}`}>
      <View style={styles.matchMain}>
        <Text style={styles.matchTitle}>{match.requirement}</Text>
        <Text style={styles.matchEvidence} numberOfLines={2}>{match.evidence_source ? `${match.evidence_source} · ` : ""}{match.evidence.slice(0, 120)}</Text>
      </View>
      <View style={styles.matchScores}>
        <Text style={styles.matchMetric}>K {match.keyword_score.toFixed(2)}</Text>
        <Text style={styles.matchMetric}>S {match.semantic_score.toFixed(2)}</Text>
        <Pill label={match.match_type} tone={tone} />
      </View>
      <Icon name={match.match_type === "missing" ? "close-circle-outline" : "check-circle-outline"} color={match.match_type === "missing" ? colors.error : colors.brand} size={18} />
    </View>
  );
}

export default function CandidateDetailScreen() {
  const styles = useUiStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, isError } = useCandidate(id);

  if (isLoading) {
    return (
      <View style={styles.flex}>
        <ScreenHeader title="Candidate" onBack={() => router.back()} />
        <View style={styles.loadingRoot}>
          <ActivityIndicator color={colors.brand} size="large" />
          <Text style={styles.mutedText}>Extracting candidate telemetry and evidence snippets...</Text>
        </View>
      </View>
    );
  }

  const ranking = data?.ranking;
  if (isError || !ranking) {
    return (
      <View style={styles.flex}>
        <ScreenHeader title="Candidate" onBack={() => router.back()} />
        <EmptyState text="Candidate record not found." />
      </View>
    );
  }

  return (
    <View style={styles.flex} testID="candidate-detail-screen">
      <ScreenHeader title={ranking.name} onBack={() => router.back()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.detailHero}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>CANDIDATE {String(ranking.rank).padStart(2, "0")}</Text>
            <Text style={styles.detailName}>{ranking.name}</Text>
            <Text style={styles.mutedText}>{ranking.matched_required.length} required matches · {ranking.missing_required.length} critical gaps</Text>
          </View>
          <View style={styles.scoreCircle} testID="candidate-final-score">
            <Text style={styles.scoreCircleValue}>{ranking.final_score.toFixed(1)}</Text>
            <Text style={styles.scoreCircleLabel}>/ 100</Text>
          </View>
        </View>

        <View style={styles.breakdownCard}>
          <SectionTitle eyebrow="DETERMINISTIC BREAKDOWN" title="How the score was calculated" />
          <Breakdown testID="breakdown-keyword" label="Keyword relevance" value={ranking.components.keyword_contribution} max={35} color={colors.info} />
          <Breakdown testID="breakdown-semantic" label="Semantic relevance" value={ranking.components.semantic_contribution} max={35} color={colors.brand} />
          <Breakdown testID="breakdown-evidence" label="Evidence strength" value={ranking.components.evidence_contribution} max={20} color={colors.success} />
          <Breakdown testID="breakdown-coverage" label="Requirement coverage" value={ranking.components.coverage_contribution} max={10} color={colors.warning} />
          <View style={styles.penaltyRow}>
            <Text style={styles.penaltyLabel}>Critical requirement penalty</Text>
            <Text style={styles.penaltyValue} testID="breakdown-penalty">−{ranking.critical_penalty.toFixed(1)}</Text>
          </View>
        </View>

        <SectionTitle eyebrow="EVIDENCE FILE" title="Strongest proof" />
        {ranking.strongest_evidence.length ? (
          ranking.strongest_evidence.map((item) => (
            <View key={`${item.requirement}-${item.source}`} style={styles.evidenceCard}>
              <View style={styles.evidenceIcon}>
                <Icon name="check" color={colors.brand} size={17} />
              </View>
              <View style={styles.evidenceCopy}>
                <Text style={styles.evidenceSkill}>{item.requirement}</Text>
                <Text style={styles.evidenceSource}>{item.source?.toUpperCase() ?? "RESUME"}</Text>
                <Text style={styles.evidenceText}>{item.text}</Text>
              </View>
            </View>
          ))
        ) : (
          <EmptyState text="No supporting evidence was found in the uploaded resume." />
        )}

        <View style={styles.claimCard} testID="claimed-vs-demonstrated">
          <SectionTitle eyebrow="ANTI-KEYWORD-STUFFING" title="Claimed vs demonstrated" />
          <View style={styles.skillColumns}>
            <View style={styles.skillCol}>
              <Text style={styles.colLabel}>CLAIMED</Text>
              {ranking.claimed_skills.slice(0, 8).map((skill) => (
                <Text key={skill} style={styles.skillLine}>
                  <Icon name="check" color={colors.muted} size={14} /> {skill}
                </Text>
              ))}
            </View>
            <View style={styles.skillCol}>
              <Text style={styles.colLabel}>DEMONSTRATED</Text>
              {ranking.demonstrated_skills.slice(0, 8).map((skill) => (
                <Text key={skill} style={styles.skillLine}>
                  <Icon name="check-all" color={colors.brand} size={14} /> {skill}
                </Text>
              ))}
            </View>
          </View>
        </View>

        <SectionTitle eyebrow="REQUIREMENT MATRIX" title="Requirement-level matches" />
        {ranking.matches.map((match) => (
          <MatchRow key={match.requirement_id} match={match} />
        ))}

        {ranking.missing_required.length ? (
          <View style={styles.missingCard} testID="missing-critical-card">
            <Text style={styles.missingTitle}>Critical gaps</Text>
            {ranking.missing_required.map((item) => (
              <Text key={item} style={styles.missingText}>
                <Icon name="alert-circle-outline" color={colors.error} size={16} /> {item}
              </Text>
            ))}
          </View>
        ) : null}

        <PrimaryButton testID="candidate-compare-button" label="Compare this candidate" icon="compare-horizontal" onPress={() => router.push({ pathname: "/compare", params: { a: ranking.candidate_id } })} secondary />
      </ScrollView>
    </View>
  );
}
