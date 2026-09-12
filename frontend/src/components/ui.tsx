import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { makeStyles, useTheme } from "@/src/theme";

export type IconName = keyof typeof MaterialCommunityIcons.glyphMap;
export type Tone = "neutral" | "success" | "warning" | "error" | "info";

export function Icon({ name, color, size = 20 }: { name: IconName; color: string; size?: number }) {
  return <MaterialCommunityIcons name={name} color={color} size={size} />;
}

export function Pill({ label, tone = "neutral", testID }: { label: string; tone?: Tone; testID?: string }) {
  const styles = useUiStyles();
  return (
    <View testID={testID} style={[styles.pill, styles[`pill_${tone}`]]}>
      <Text style={[styles.pillText, styles[`pillText_${tone}`]]}>{label}</Text>
    </View>
  );
}

export function MetricCard({ label, value, icon, accent, testID }: { label: string; value: string | number; icon: IconName; accent?: boolean; testID?: string }) {
  const styles = useUiStyles();
  const { colors } = useTheme();
  return (
    <View testID={testID} style={styles.metricCard}>
      <View style={[styles.metricIcon, accent && { backgroundColor: colors.brandTertiary }]}>
        <Icon name={icon} color={accent ? colors.brand : colors.muted} size={18} />
      </View>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

export function PrimaryButton({ label, onPress, icon, loading = false, secondary = false, testID }: { label: string; onPress: () => void; icon?: IconName; loading?: boolean; secondary?: boolean; testID?: string }) {
  const styles = useUiStyles();
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} accessibilityRole="button" onPress={onPress} disabled={loading} style={({ pressed }) => [styles.primaryButton, secondary && styles.secondaryButton, pressed && styles.buttonPressed]}>
      {loading ? (
        <ActivityIndicator color={secondary ? colors.brand : colors.onBrandPrimary} />
      ) : (
        <>
          {icon ? <Icon name={icon} color={secondary ? colors.brand : colors.onBrandPrimary} size={18} /> : null}
          <Text style={[styles.primaryButtonText, secondary && styles.secondaryButtonText]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function SectionTitle({ eyebrow, title, action, onAction }: { eyebrow?: string; title: string; action?: string; onAction?: () => void }) {
  const styles = useUiStyles();
  return (
    <View style={styles.sectionHeader}>
      <View style={{ flex: 1 }}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {action && onAction ? (
        <Pressable testID={`section-action-${action.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`} onPress={onAction} hitSlop={8} style={{ minHeight: 44, justifyContent: "center" }}>
          <Text style={styles.actionText}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function EmptyState({ text, testID }: { text: string; testID?: string }) {
  const styles = useUiStyles();
  return (
    <View testID={testID} style={styles.emptyState}>
      <Icon name="database-off-outline" color={styles.topIcon.color as string} size={32} />
      <Text style={styles.emptyTitle}>{text}</Text>
    </View>
  );
}

export function ScreenHeader({ title, eyebrow, onBack, initials, onAvatarPress }: { title: string; eyebrow?: string; onBack?: () => void; initials?: string; onAvatarPress?: () => void }) {
  const styles = useUiStyles();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
      {onBack ? (
        <Pressable testID="screen-back-button" onPress={onBack} style={styles.iconButton} hitSlop={8}>
          <Icon name="arrow-left" color={styles.topIcon.color as string} size={22} />
        </Pressable>
      ) : (
        <View style={styles.brandRow}>
          <View style={styles.tinyMark}>
            <Icon name="crosshairs-gps" color={styles.tinyMarkIcon.color as string} size={13} />
          </View>
          <Text style={styles.topBrand}>HIRELENS</Text>
        </View>
      )}
      <View style={styles.topBarTitle}>
        <Text style={styles.topEyebrow}>{eyebrow ?? (onBack ? "SCREENING FILE" : "RECRUITER WORKSPACE")}</Text>
        <Text style={styles.topTitle} numberOfLines={1}>{title}</Text>
      </View>
      <Pressable testID="header-avatar-button" onPress={onAvatarPress} disabled={!onAvatarPress} style={styles.avatar}>
        <Text style={styles.avatarText}>{initials ?? "DR"}</Text>
      </Pressable>
    </View>
  );
}

export function DetailStat({ label, value }: { label: string; value: string }) {
  const styles = useUiStyles();
  return (
    <View style={styles.detailStat}>
      <Text style={styles.detailValue}>{value}</Text>
      <Text style={styles.detailLabel}>{label}</Text>
    </View>
  );
}

export function SmallAction({ icon, label, onPress, testID }: { icon: IconName; label: string; onPress: () => void; testID?: string }) {
  const styles = useUiStyles();
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [styles.smallAction, pressed && styles.buttonPressed]}>
      <Icon name={icon} color={colors.brand} size={18} />
      <Text style={styles.smallActionText}>{label}</Text>
    </Pressable>
  );
}

export function WeightRow({ label, value, color }: { label: string; value: string; color: string }) {
  const styles = useUiStyles();
  return (
    <View style={styles.weightRow}>
      <View style={[styles.weightDot, { backgroundColor: color }]} />
      <Text style={styles.weightLabel}>{label}</Text>
      <Text style={styles.weightValue}>{value}</Text>
    </View>
  );
}

export function Telemetry({ label, value }: { label: string; value: number }) {
  const styles = useUiStyles();
  return (
    <View>
      <Text style={styles.telemetryLabel}>{label}</Text>
      <Text style={styles.telemetryValue}>{value.toFixed(2)}</Text>
    </View>
  );
}

export const useUiStyles = makeStyles((colors) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.surface },
    scrollContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32, gap: 16 },
    loadingRoot: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", gap: 14 },
    authRoot: { flex: 1, backgroundColor: colors.surface },
    authContent: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 24, paddingTop: 44, paddingBottom: 40 },
    authOrb: { position: "absolute", width: 320, height: 320, borderRadius: 160, right: -130, top: -50, backgroundColor: colors.brandTertiary, opacity: 0.55 },
    authOrbSmall: { position: "absolute", width: 160, height: 160, borderRadius: 80, left: -90, bottom: 80, backgroundColor: colors.surfaceTertiary, opacity: 0.6 },
    brandRow: { flexDirection: "row", alignItems: "center", gap: 9 },
    brandMark: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
    brandName: { color: colors.onSurface, fontWeight: "800", letterSpacing: 2.5, fontSize: 16 },
    authTitle: { color: colors.onSurface, fontSize: 42, lineHeight: 42, fontWeight: "800", marginTop: 42, letterSpacing: -1 },
    authSubtitle: { color: colors.brand, fontSize: 29, fontWeight: "700", marginTop: 4 },
    authBody: { color: colors.muted, fontSize: 15, lineHeight: 22, maxWidth: 320, marginTop: 14 },
    authCard: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: 20, padding: 18, marginTop: 28 },
    demoCallout: { flexDirection: "row", gap: 12, paddingVertical: 4, marginBottom: 18 },
    demoCopy: { flex: 1 },
    demoTitle: { color: colors.onSurfaceSecondary, fontSize: 15, fontWeight: "700" },
    demoText: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 3 },
    authSwitch: { alignItems: "center", gap: 10, marginTop: 16 },
    mutedLink: { color: colors.muted, textDecorationLine: "underline", fontSize: 13 },
    integrityNote: { color: colors.muted, fontSize: 12, textAlign: "center", marginTop: 24 },
    field: { marginBottom: 12 },
    fieldLabel: { color: colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1.2, marginBottom: 6 },
    input: { minHeight: 46, backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border, borderRadius: 10, color: colors.onSurface, paddingHorizontal: 12, fontSize: 15 },
    topBar: { minHeight: 76, paddingHorizontal: 20, paddingBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: colors.divider, backgroundColor: colors.surface },
    topBarTitle: { flex: 1, marginLeft: 14 },
    topEyebrow: { color: colors.muted, fontSize: 9, letterSpacing: 1.2, fontWeight: "800" },
    topTitle: { color: colors.onSurface, fontSize: 19, fontWeight: "800", marginTop: 2 },
    topBrand: { color: colors.onSurface, fontSize: 14, letterSpacing: 2, fontWeight: "800" },
    tinyMark: { width: 24, height: 24, borderRadius: 8, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
    tinyMarkIcon: { color: colors.onBrandPrimary },
    topIcon: { color: colors.muted },
    avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
    avatarText: { color: colors.onSurfaceSecondary, fontSize: 11, fontWeight: "800" },
    iconButton: { width: 44, height: 44, alignItems: "flex-start", justifyContent: "center" },
    eyebrow: { color: colors.brand, fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
    sectionTitle: { color: colors.onSurface, fontSize: 22, fontWeight: "800", marginTop: 4 },
    actionText: { color: colors.brand, fontSize: 13, fontWeight: "800" },
    sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 6, gap: 10 },
    mutedText: { color: colors.muted, fontSize: 13, lineHeight: 19 },
    heroPanel: { backgroundColor: colors.surfaceSecondary, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 22, overflow: "hidden" },
    heroAccent: { position: "absolute", width: 120, height: 120, borderRadius: 60, right: -35, top: -36, backgroundColor: colors.brandTertiary },
    heroTitle: { color: colors.onSurface, fontSize: 35, lineHeight: 35, fontWeight: "900", marginTop: 16, letterSpacing: -0.6 },
    heroText: { color: colors.onSurfaceTertiary, fontSize: 14, lineHeight: 21, marginTop: 14, maxWidth: 290 },
    engineLine: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 22, paddingTop: 13, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 7 },
    liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.brand },
    engineText: { color: colors.brand, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
    engineMeta: { color: colors.muted, fontSize: 10, width: "100%", marginLeft: 14 },
    metricsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    metricCard: { width: "48.4%", minHeight: 112, backgroundColor: colors.surfaceSecondary, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 13 },
    metricIcon: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceTertiary },
    metricValue: { color: colors.onSurface, fontSize: 25, fontWeight: "800", marginTop: 8 },
    metricLabel: { color: colors.muted, fontSize: 11, marginTop: 2 },
    jobSummary: { backgroundColor: colors.surfaceSecondary, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16 },
    jobHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
    jobCompany: { color: colors.muted, fontSize: 12 },
    jobTitle: { color: colors.onSurface, fontSize: 19, fontWeight: "800", marginTop: 5 },
    jobMeta: { color: colors.onSurfaceTertiary, fontSize: 12, marginTop: 15 },
    jobProgress: { backgroundColor: colors.surfaceTertiary, height: 6, borderRadius: 3, marginTop: 16, overflow: "hidden" },
    jobProgressFill: { height: 6, backgroundColor: colors.brand, borderRadius: 3 },
    jobActions: { marginTop: 16, gap: 12 },
    textButton: { minHeight: 44, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
    philosophyRow: { flexDirection: "row", gap: 12, backgroundColor: colors.surfaceSecondary, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: colors.border },
    philosophyIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
    philosophyCopy: { flex: 1 },
    philosophyTitle: { color: colors.onSurfaceSecondary, fontSize: 14, fontWeight: "800" },
    philosophyText: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 4 },
    primaryButton: { minHeight: 48, borderRadius: 11, paddingHorizontal: 16, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
    primaryButtonText: { color: colors.onBrandPrimary, fontSize: 14, fontWeight: "900" },
    secondaryButton: { backgroundColor: colors.brandTertiary, borderWidth: 1, borderColor: colors.brandSecondary },
    secondaryButtonText: { color: colors.brand },
    buttonPressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
    pill: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, alignSelf: "flex-start", backgroundColor: colors.surfaceTertiary },
    pillText: { color: colors.onSurfaceTertiary, fontSize: 10, fontWeight: "800", letterSpacing: 0.3 },
    pill_success: { backgroundColor: colors.brandTertiary },
    pillText_success: { color: colors.onBrandTertiary },
    pill_warning: { backgroundColor: colors.surfaceTertiary },
    pillText_warning: { color: colors.warning },
    pill_error: { backgroundColor: colors.surfaceTertiary },
    pillText_error: { color: colors.error },
    pill_info: { backgroundColor: colors.surfaceTertiary },
    pillText_info: { color: colors.info },
    pill_neutral: { backgroundColor: colors.surfaceTertiary },
    pillText_neutral: { color: colors.onSurfaceTertiary },
    largeJobCard: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 18 },
    detailGrid: { flexDirection: "row", marginTop: 20, paddingVertical: 14, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.divider, justifyContent: "space-between" },
    detailStat: { flex: 1 },
    detailValue: { color: colors.onSurface, fontSize: 20, fontWeight: "800" },
    detailLabel: { color: colors.muted, fontSize: 9, letterSpacing: 1, marginTop: 4 },
    jobDescription: { color: colors.onSurfaceTertiary, fontSize: 13, lineHeight: 20, marginTop: 16 },
    chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginVertical: 17 },
    actionGrid: { flexDirection: "row", gap: 8, marginTop: 10 },
    smallAction: { flex: 1, minHeight: 62, paddingHorizontal: 7, borderRadius: 11, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center", gap: 6 },
    smallActionText: { color: colors.onSurfaceSecondary, fontSize: 10, textAlign: "center", fontWeight: "700" },
    emptyState: { minHeight: 220, alignItems: "center", justifyContent: "center", gap: 12, padding: 30 },
    emptyTitle: { color: colors.onSurfaceSecondary, fontSize: 15, fontWeight: "700", textAlign: "center" },
    rankingHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
    compareButton: { minHeight: 42, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5 },
    compareButtonText: { color: colors.onBrandPrimary, fontSize: 12, fontWeight: "900" },
    topGrid: { flexDirection: "row", gap: 9 },
    topCard: { flex: 1, minHeight: 174, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 11 },
    topCardPrimary: { borderColor: colors.brandSecondary, backgroundColor: colors.brandTertiary },
    rankBadge: { width: 26, height: 22, backgroundColor: colors.surfaceTertiary, borderRadius: 6, alignItems: "center", justifyContent: "center" },
    rankBadgeText: { color: colors.brand, fontSize: 10, fontWeight: "900" },
    topName: { color: colors.onSurface, fontSize: 13, fontWeight: "800", marginTop: 12 },
    topScore: { color: colors.brand, fontSize: 26, fontWeight: "900", marginTop: 6 },
    topMeta: { color: colors.muted, fontSize: 10, lineHeight: 14, marginTop: 2 },
    miniBar: { height: 4, backgroundColor: colors.surfaceTertiary, borderRadius: 2, marginVertical: 11, overflow: "hidden" },
    miniBarFill: { height: 4, backgroundColor: colors.brand, borderRadius: 2 },
    candidateRow: { minHeight: 70, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: 13, padding: 11, flexDirection: "row", alignItems: "center", gap: 10 },
    rankNumber: { width: 30, alignItems: "center" },
    rankNumberText: { color: colors.muted, fontSize: 11, fontWeight: "900" },
    candidateMain: { flex: 1 },
    candidateName: { color: colors.onSurfaceSecondary, fontSize: 14, fontWeight: "800" },
    candidateSub: { color: colors.muted, fontSize: 10, marginTop: 4 },
    candidateScore: { alignItems: "flex-end", gap: 5 },
    rowScore: { color: colors.onSurface, fontSize: 17, fontWeight: "900" },
    detailHero: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: colors.surfaceSecondary, padding: 18, borderRadius: 16, borderWidth: 1, borderColor: colors.border },
    detailName: { color: colors.onSurface, fontSize: 30, fontWeight: "900", marginTop: 8, letterSpacing: -0.5 },
    scoreCircle: { width: 86, height: 86, borderRadius: 43, borderWidth: 5, borderColor: colors.brand, alignItems: "center", justifyContent: "center", backgroundColor: colors.brandTertiary },
    scoreCircleValue: { color: colors.brand, fontSize: 23, fontWeight: "900" },
    scoreCircleLabel: { color: colors.onBrandTertiary, fontSize: 10, marginTop: -2 },
    breakdownCard: { backgroundColor: colors.surfaceSecondary, padding: 16, borderRadius: 15, borderWidth: 1, borderColor: colors.border },
    breakdownRow: { marginTop: 14 },
    breakdownLabel: { flexDirection: "row", justifyContent: "space-between" },
    breakdownName: { color: colors.onSurfaceSecondary, fontSize: 12 },
    breakdownValue: { color: colors.muted, fontSize: 12, fontWeight: "800" },
    breakdownTrack: { height: 6, backgroundColor: colors.surfaceTertiary, borderRadius: 3, marginTop: 7, overflow: "hidden" },
    breakdownFill: { height: 6, borderRadius: 3 },
    penaltyRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 17, paddingTop: 14, borderTopWidth: 1, borderColor: colors.divider },
    penaltyLabel: { color: colors.muted, fontSize: 12 },
    penaltyValue: { color: colors.error, fontSize: 13, fontWeight: "900" },
    evidenceCard: { backgroundColor: colors.surfaceSecondary, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, flexDirection: "row", gap: 11 },
    evidenceIcon: { width: 28, height: 28, borderRadius: 8, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
    evidenceCopy: { flex: 1 },
    evidenceSkill: { color: colors.onSurfaceSecondary, fontSize: 13, fontWeight: "800" },
    evidenceSource: { color: colors.brand, fontSize: 9, fontWeight: "900", letterSpacing: 1, marginTop: 3 },
    evidenceText: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 6 },
    claimCard: { backgroundColor: colors.surfaceSecondary, borderRadius: 15, borderWidth: 1, borderColor: colors.border, padding: 16 },
    skillColumns: { flexDirection: "row", gap: 18, marginTop: 14 },
    skillCol: { flex: 1 },
    colLabel: { color: colors.muted, fontSize: 9, letterSpacing: 1, fontWeight: "900", marginBottom: 9 },
    skillLine: { color: colors.onSurfaceSecondary, fontSize: 12, marginBottom: 8 },
    matchRow: { backgroundColor: colors.surfaceSecondary, padding: 13, borderRadius: 13, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", gap: 8 },
    matchMain: { flex: 1 },
    matchTitle: { color: colors.onSurfaceSecondary, fontSize: 12, fontWeight: "800" },
    matchEvidence: { color: colors.muted, fontSize: 10, marginTop: 4 },
    matchScores: { alignItems: "flex-end", gap: 3 },
    matchMetric: { color: colors.muted, fontSize: 9, fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }) },
    missingCard: { padding: 15, borderRadius: 13, borderWidth: 1, borderColor: colors.error, backgroundColor: colors.surfaceSecondary },
    missingTitle: { color: colors.error, fontWeight: "900", fontSize: 13, marginBottom: 8 },
    missingText: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 5 },
    compareHero: { flexDirection: "row", alignItems: "stretch", gap: 8, marginTop: 20 },
    compareCol: { flex: 1, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: 15, padding: 14 },
    compareColPrimary: { borderColor: colors.brandSecondary, backgroundColor: colors.brandTertiary },
    compareRank: { color: colors.brand, fontWeight: "900", fontSize: 12 },
    compareName: { color: colors.onSurfaceSecondary, fontSize: 14, fontWeight: "800", marginTop: 12 },
    compareScore: { color: colors.brand, fontSize: 30, fontWeight: "900", marginTop: 13 },
    compareCaption: { color: colors.muted, fontSize: 10 },
    vs: { width: 26, justifyContent: "center", alignItems: "center" },
    vsText: { color: colors.muted, fontSize: 10, fontWeight: "900" },
    compareTable: { backgroundColor: colors.surfaceSecondary, borderRadius: 15, borderWidth: 1, borderColor: colors.border, marginTop: 16, overflow: "hidden" },
    compareTableRow: { minHeight: 45, borderBottomWidth: 1, borderBottomColor: colors.divider, flexDirection: "row", alignItems: "center" },
    compareTableLabel: { color: colors.muted, fontSize: 12, flex: 1, paddingLeft: 13 },
    compareTableValue: { color: colors.onSurfaceSecondary, fontSize: 13, fontWeight: "800", width: 72, textAlign: "right", paddingRight: 13 },
    explanationCard: { backgroundColor: colors.brandTertiary, borderRadius: 15, padding: 16, marginTop: 16 },
    aiHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
    aiTitle: { color: colors.brand, fontSize: 14, fontWeight: "900" },
    explanationText: { color: colors.onBrandTertiary, fontSize: 13, lineHeight: 20, marginTop: 11 },
    pipelineCard: { backgroundColor: colors.surfaceSecondary, borderRadius: 15, borderWidth: 1, borderColor: colors.border, padding: 16, marginTop: 18 },
    pipelineRow: { minHeight: 34, flexDirection: "row", alignItems: "center", gap: 10, position: "relative" },
    pipelineIcon: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", zIndex: 2 },
    pipelineText: { color: colors.onSurfaceSecondary, fontSize: 12, fontWeight: "700" },
    pipelineLine: { position: "absolute", width: 1, height: 14, backgroundColor: colors.brandSecondary, left: 12, bottom: -8 },
    engineCard: { backgroundColor: colors.surfaceSecondary, borderRadius: 15, borderWidth: 1, borderColor: colors.border, padding: 16 },
    weightRow: { flexDirection: "row", alignItems: "center", minHeight: 36, borderBottomWidth: 1, borderBottomColor: colors.divider },
    weightDot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
    weightLabel: { flex: 1, color: colors.onSurfaceSecondary, fontSize: 12 },
    weightValue: { color: colors.onSurface, fontSize: 13, fontWeight: "900" },
    methodNote: { color: colors.muted, fontSize: 10, lineHeight: 16, marginTop: 13 },
    telemetryCard: { backgroundColor: colors.surfaceSecondary, borderRadius: 15, borderWidth: 1, borderColor: colors.border, padding: 15 },
    telemetryHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
    telemetryTitle: { color: colors.onSurfaceSecondary, fontSize: 13, fontWeight: "800", flex: 1 },
    telemetryValues: { flexDirection: "row", justifyContent: "space-between", marginTop: 17 },
    telemetryLabel: { color: colors.muted, fontSize: 9, letterSpacing: 0.7 },
    telemetryValue: { color: colors.brand, fontSize: 18, fontWeight: "900", marginTop: 4 },
    finalRequirement: { color: colors.muted, fontSize: 10, marginTop: 13 },
    insightCard: { flexDirection: "row", gap: 12, backgroundColor: colors.surfaceSecondary, borderRadius: 15, borderWidth: 1, borderColor: colors.border, padding: 15 },
    insightIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
    insightCopy: { flex: 1 },
    insightTitle: { color: colors.onSurfaceSecondary, fontSize: 14, fontWeight: "800" },
    insightBody: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 5 },
    futureCard: { backgroundColor: colors.surfaceTertiary, borderRadius: 15, padding: 16, borderWidth: 1, borderColor: colors.border, marginTop: 6 },
    futureTitle: { color: colors.onSurface, fontSize: 16, fontWeight: "800", marginTop: 14 },
    futureText: { color: colors.muted, fontSize: 12, lineHeight: 19, marginTop: 5 },
    aiScroll: { padding: 20, paddingBottom: 150, gap: 18 },
    aiIntro: { alignItems: "center", paddingTop: 16 },
    aiOrb: { width: 54, height: 54, borderRadius: 18, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center", marginBottom: 15 },
    aiTitleLarge: { color: colors.onSurface, fontSize: 25, fontWeight: "900" },
    suggestionWrap: { gap: 9 },
    suggestion: { minHeight: 48, paddingHorizontal: 14, borderRadius: 11, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", gap: 8 },
    suggestionText: { color: colors.onSurfaceSecondary, fontSize: 12, flex: 1 },
    answerCard: { backgroundColor: colors.brandTertiary, borderRadius: 15, padding: 16 },
    answerText: { color: colors.onBrandTertiary, fontSize: 14, lineHeight: 21, marginTop: 11 },
    sourceText: { color: colors.muted, fontSize: 10, marginTop: 15 },
    aiEmpty: { alignItems: "center", gap: 10, paddingHorizontal: 18, paddingTop: 22 },
    chatComposer: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 12, backgroundColor: colors.surfaceSecondary, borderTopWidth: 1, borderTopColor: colors.divider, flexDirection: "row", alignItems: "flex-end", gap: 9 },
    chatInput: { flex: 1, maxHeight: 90, minHeight: 44, borderRadius: 12, backgroundColor: colors.surfaceTertiary, color: colors.onSurface, paddingHorizontal: 13, paddingTop: 12, fontSize: 13 },
    sendButton: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
    errorText: { color: colors.error, fontSize: 12, marginBottom: 10 },
    chipRow: { flexGrow: 0 },
    chipRowContent: { gap: 8, paddingHorizontal: 20, alignItems: "center" },
    selectChip: { flexShrink: 0, height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
    selectChipActive: { borderColor: colors.brandSecondary, backgroundColor: colors.brandTertiary },
    selectChipText: { color: colors.onSurfaceTertiary, fontSize: 12, fontWeight: "700" },
    selectChipTextActive: { color: colors.onBrandTertiary },
  }),
);
