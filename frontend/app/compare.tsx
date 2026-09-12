import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

import { api, type Ranking } from "@/src/api";
import { EmptyState, Icon, PrimaryButton, ScreenHeader, useUiStyles } from "@/src/components/ui";
import { useActiveJob, useScreening } from "@/src/hooks";
import { useTheme } from "@/src/theme";

function CompareCol({ item, tone }: { item: Ranking; tone?: "primary" }) {
  const styles = useUiStyles();
  return (
    <View style={[styles.compareCol, tone === "primary" && styles.compareColPrimary]}>
      <Text style={styles.compareRank}>#{item.rank}</Text>
      <Text style={styles.compareName} numberOfLines={1}>{item.name}</Text>
      <Text style={styles.compareScore}>{item.final_score.toFixed(1)}</Text>
      <Text style={styles.compareCaption}>final score</Text>
    </View>
  );
}

function ChipRow({ label, side, rankings, selected, onSelect, otherId }: { label: string; side: "a" | "b"; rankings: Ranking[]; selected?: string; onSelect: (id: string) => void; otherId?: string }) {
  const styles = useUiStyles();
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.eyebrow}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow} contentContainerStyle={styles.chipRowContent}>
        {rankings.map((item) => {
          const active = selected === item.candidate_id;
          const disabled = otherId === item.candidate_id;
          return (
            <Pressable
              testID={`compare-chip-${side}-${item.candidate_id}`}
              key={item.candidate_id}
              disabled={disabled}
              onPress={() => onSelect(item.candidate_id)}
              style={[styles.selectChip, active && styles.selectChipActive, disabled && { opacity: 0.35 }]}
            >
              <Text style={[styles.selectChipText, active && styles.selectChipTextActive]}>#{item.rank} {item.name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export default function CompareScreen() {
  const styles = useUiStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ a?: string; b?: string }>();
  const job = useActiveJob();
  const screeningQuery = useScreening(job?.job_id);
  const rankings = screeningQuery.data?.rankings ?? [];
  const [aId, setAId] = useState<string | undefined>(params.a ?? rankings[0]?.candidate_id);
  const [bId, setBId] = useState<string | undefined>(params.b ?? rankings[1]?.candidate_id);
  const [explanation, setExplanation] = useState("");
  const [explaining, setExplaining] = useState(false);

  const effectiveA = aId ?? rankings[0]?.candidate_id;
  const effectiveB = bId ?? rankings[1]?.candidate_id;
  const first = rankings.find((item) => item.candidate_id === effectiveA);
  const second = rankings.find((item) => item.candidate_id === effectiveB);

  const explain = async () => {
    if (!job || !first || !second) return;
    setExplaining(true);
    setExplanation("");
    try {
      const leader = first.rank <= second.rank ? first : second;
      const trailer = leader === first ? second : first;
      const result = await api.ask(job.job_id, `Why is ${leader.name} (rank ${leader.rank}) ranked above ${trailer.name} (rank ${trailer.rank})?`);
      setExplanation(result.answer);
    } catch {
      setExplanation(`${first.name} vs ${second.name}: compare the deterministic components above — keyword, semantic, evidence and coverage contributions come from the screening run, not an LLM.`);
    } finally {
      setExplaining(false);
    }
  };

  return (
    <View style={styles.flex} testID="compare-screen">
      <ScreenHeader title="Compare" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={[styles.scrollContent, { gap: 18 }]} showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>WHY A &gt; B?</Text>
        <Text style={styles.detailName}>Evidence differential</Text>
        <Text style={styles.mutedText}>A deterministic view of the factors separating two candidates.</Text>

        {rankings.length >= 2 ? (
          <>
            <ChipRow label="CANDIDATE A" side="a" rankings={rankings} selected={effectiveA} onSelect={(id) => { setAId(id); setExplanation(""); }} otherId={effectiveB} />
            <ChipRow label="CANDIDATE B" side="b" rankings={rankings} selected={effectiveB} onSelect={(id) => { setBId(id); setExplanation(""); }} otherId={effectiveA} />
          </>
        ) : null}

        {first && second ? (
          <>
            <View style={styles.compareHero} testID="compare-hero">
              <CompareCol item={first} tone="primary" />
              <View style={styles.vs}>
                <Text style={styles.vsText}>VS</Text>
              </View>
              <CompareCol item={second} />
            </View>
            <View style={styles.compareTable} testID="compare-table">
              {([
                ["Final score", first.final_score.toFixed(1), second.final_score.toFixed(1)],
                ["Keyword", `${(first.keyword_score * 100).toFixed(0)}%`, `${(second.keyword_score * 100).toFixed(0)}%`],
                ["Semantic", `${(first.semantic_score * 100).toFixed(0)}%`, `${(second.semantic_score * 100).toFixed(0)}%`],
                ["Evidence", `${(first.evidence_score * 100).toFixed(0)}%`, `${(second.evidence_score * 100).toFixed(0)}%`],
                ["Coverage", `${(first.coverage_score * 100).toFixed(0)}%`, `${(second.coverage_score * 100).toFixed(0)}%`],
                ["Missing critical", String(first.missing_required.length), String(second.missing_required.length)],
              ] as const).map(([label, left, right]) => (
                <View key={label} style={styles.compareTableRow}>
                  <Text style={styles.compareTableLabel}>{label}</Text>
                  <Text style={styles.compareTableValue}>{left}</Text>
                  <Text style={styles.compareTableValue}>{right}</Text>
                </View>
              ))}
            </View>
            <PrimaryButton testID="compare-explain-button" label={explaining ? "Grounding explanation" : "Explain the difference"} icon="lightbulb-on-outline" onPress={() => void explain()} loading={explaining} secondary />
            {explanation ? (
              <View style={styles.explanationCard} testID="compare-explanation-card">
                <View style={styles.aiHeader}>
                  <Icon name="lightbulb-on-outline" color={styles.aiTitle.color as string} size={20} />
                  <Text style={styles.aiTitle}>Grounded ranking explanation</Text>
                </View>
                <Text style={styles.explanationText}>{explanation}</Text>
              </View>
            ) : (
              <View style={styles.explanationCard}>
                <View style={styles.aiHeader}>
                  <Icon name="scale-balance" color={styles.aiTitle.color as string} size={20} />
                  <Text style={styles.aiTitle}>Deterministic summary</Text>
                </View>
                <Text style={styles.explanationText}>
                  {first.name} vs {second.name}: the delta is {Math.abs(first.final_score - second.final_score).toFixed(1)} points, driven by keyword, semantic, evidence and coverage components from the screening run — never an LLM-generated score.
                </Text>
              </View>
            )}
          </>
        ) : (
          <EmptyState text="Select at least two ranked candidates." />
        )}
        {explaining ? <ActivityIndicator color={colors.brand} /> : null}
      </ScrollView>
    </View>
  );
}
