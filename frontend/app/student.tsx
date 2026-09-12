import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

import { api, type StudentGap } from "@/src/api";
import { EmptyState, Icon, ScreenHeader, SectionTitle, useUiStyles } from "@/src/components/ui";
import { useActiveJob, useScreening } from "@/src/hooks";
import { useTheme } from "@/src/theme";

function GapList({ label, items, tone }: { label: string; items: string[]; tone: "success" | "warning" | "error" }) {
  const styles = useUiStyles();
  const { colors } = useTheme();
  if (!items.length) return null;
  return (
    <View style={styles.breakdownCard} testID={`gap-${tone}`}>
      <Text style={[styles.colLabel, { marginBottom: 10 }]}>{label}</Text>
      {items.map((item) => (
        <Text key={item} style={styles.skillLine}>
          <Icon name={tone === "success" ? "check-all" : tone === "warning" ? "minus-circle-outline" : "alert-circle-outline"} color={tone === "success" ? colors.brand : tone === "warning" ? colors.warning : colors.error} size={14} /> {item}
        </Text>
      ))}
    </View>
  );
}

export default function StudentScreen() {
  const styles = useUiStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const job = useActiveJob();
  const screeningQuery = useScreening(job?.job_id);
  const rankings = screeningQuery.data?.rankings ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const gapQuery = useQuery<StudentGap>({
    queryKey: ["student-gap", selectedId],
    queryFn: () => api.studentGap(selectedId as string),
    enabled: Boolean(selectedId),
  });
  const gap = gapQuery.data;

  return (
    <View style={styles.flex} testID="student-screen">
      <ScreenHeader title="Student Mode" eyebrow="BETA · FUTURE-READY" onBack={() => router.back()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scrollContent, { gap: 18 }]}>
        <Text style={styles.eyebrow}>DON&apos;T JUST LEARN. BUILD PROOF.</Text>
        <Text style={styles.detailName}>Your skill gap, decoded.</Text>
        <Text style={styles.mutedText}>Pick a profile to see estimated alignment with <Text style={{ color: colors.onSurfaceSecondary, fontWeight: "700" }}>{job?.title ?? "the active role"}</Text> — powered by the same deterministic engine recruiters see.</Text>

        <Text style={styles.eyebrow}>CHOOSE A PROFILE</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow} contentContainerStyle={[styles.chipRowContent, { paddingHorizontal: 0 }]}>
          {rankings.map((item) => (
            <Pressable
              testID={`student-pick-${item.candidate_id}`}
              key={item.candidate_id}
              onPress={() => setSelectedId(item.candidate_id)}
              style={[styles.selectChip, selectedId === item.candidate_id && styles.selectChipActive]}
            >
              <Text style={[styles.selectChipText, selectedId === item.candidate_id && styles.selectChipTextActive]}>{item.name}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {gapQuery.isFetching ? (
          <View style={styles.loadingRoot}>
            <ActivityIndicator color={colors.brand} />
            <Text style={styles.mutedText}>Comparing profile evidence against the JD...</Text>
          </View>
        ) : gap ? (
          <>
            <View style={styles.detailHero} testID="student-fit-card">
              <View style={{ flex: 1 }}>
                <Text style={styles.eyebrow}>ESTIMATED PROFILE ALIGNMENT</Text>
                <Text style={[styles.jobTitle, { marginTop: 8 }]}>{gap.candidate.name}</Text>
                <Text style={styles.mutedText}>Pool rank #{gap.rank} of {gap.pool_size} · {gap.job_title}</Text>
              </View>
              <View style={styles.scoreCircle}>
                <Text style={styles.scoreCircleValue}>{gap.fit_score.toFixed(0)}</Text>
                <Text style={styles.scoreCircleLabel}>/ 100</Text>
              </View>
            </View>

            <GapList label="STRONG EVIDENCE" tone="success" items={gap.strong.map((item) => item.requirement)} />
            <GapList label="MODERATE — CLAIMED, THIN PROOF" tone="warning" items={gap.moderate.map((item) => item.requirement)} />
            <GapList label="MISSING FOR THIS ROLE" tone="error" items={[...gap.missing_required, ...gap.missing_preferred]} />

            {gap.roadmap.length ? (
              <>
                <SectionTitle eyebrow="LEARN → BUILD → PROVE → APPLY" title="Your roadmap" />
                {gap.roadmap.map((item, index) => (
                  <View key={item.skill} style={styles.evidenceCard} testID={`roadmap-${index}`}>
                    <View style={styles.evidenceIcon}>
                      <Icon name="map-marker-path" color={colors.brand} size={17} />
                    </View>
                    <View style={styles.evidenceCopy}>
                      <Text style={styles.evidenceSkill}>{item.skill}</Text>
                      {item.steps.map((step, stepIndex) => (
                        <Text key={step} style={styles.evidenceText}>{stepIndex + 1}. {step}</Text>
                      ))}
                    </View>
                  </View>
                ))}
              </>
            ) : (
              <View style={styles.explanationCard}>
                <View style={styles.aiHeader}>
                  <Icon name="check-decagram-outline" color={styles.aiTitle.color as string} size={20} />
                  <Text style={styles.aiTitle}>No critical gaps detected</Text>
                </View>
                <Text style={styles.explanationText}>This profile already covers the role&apos;s key requirements. Focus on deepening demonstrated evidence.</Text>
              </View>
            )}

            <View style={styles.claimCard} testID="proof-of-skill">
              <SectionTitle eyebrow="PROOF OF SKILL" title="Claimed vs demonstrated" />
              {gap.proof_of_skill.map((item) => (
                <View key={item.skill} style={[styles.weightRow, { borderBottomColor: colors.divider }]}>
                  <Icon name={item.demonstrated ? "check-circle" : "circle-outline"} color={item.demonstrated ? colors.brand : colors.muted} size={16} />
                  <Text style={[styles.weightLabel, { marginLeft: 10 }]}>{item.skill}</Text>
                  <Text style={[styles.weightValue, { color: item.demonstrated ? colors.brand : colors.warning }]}>{item.proof_score}</Text>
                </View>
              ))}
            </View>

            <Text style={[styles.methodNote, { textAlign: "center" }]}>{gap.disclaimer}</Text>
          </>
        ) : (
          <EmptyState text="Select a profile above to generate its skill gap and roadmap." />
        )}
      </ScrollView>
    </View>
  );
}
