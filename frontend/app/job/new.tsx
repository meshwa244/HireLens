import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { api, type Job } from "@/src/api";
import { Icon, Pill, PrimaryButton, ScreenHeader, SectionTitle, useUiStyles } from "@/src/components/ui";
import { useRefreshPipeline, useSetActiveJob } from "@/src/hooks";
import { useTheme } from "@/src/theme";

const EMPLOYMENT_TYPES = ["Full-time", "Contract", "Internship", "Part-time"];

function FormField({ label, value, onChangeText, placeholder, multiline = false, testID }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; multiline?: boolean; testID: string }) {
  const styles = useUiStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        multiline={multiline}
        autoCapitalize="sentences"
        style={[styles.input, multiline && { minHeight: 150, paddingTop: 12, textAlignVertical: "top" }]}
      />
    </View>
  );
}

export default function NewJobScreen() {
  const styles = useUiStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const refreshPipeline = useRefreshPipeline();
  const setActiveJob = useSetActiveJob();
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [department, setDepartment] = useState("");
  const [location, setLocation] = useState("");
  const [employmentType, setEmploymentType] = useState("Full-time");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [extractedJob, setExtractedJob] = useState<Job | null>(null);

  const createAndExtract = async () => {
    if (!title.trim() || !description.trim()) {
      setError("A job title and the job description text are required.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const job = await api.createJob({ title: title.trim(), company: company.trim(), department: department.trim(), location: location.trim(), employment_type: employmentType, description: description.trim() });
      const enriched = await api.uploadJD(job.job_id, description.trim());
      setExtractedJob(enriched);
    } catch {
      setError("Could not create the job. Check the details and try again.");
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!extractedJob) return;
    setBusy(true);
    try {
      await setActiveJob(extractedJob.job_id);
      await refreshPipeline();
      router.back();
    } finally {
      setBusy(false);
    }
  };

  const required = extractedJob?.requirements.filter((item) => item.required_or_preferred === "required") ?? [];
  const preferred = extractedJob?.requirements.filter((item) => item.required_or_preferred === "preferred") ?? [];

  return (
    <View style={styles.flex} testID="new-job-screen">
      <ScreenHeader title="New Job" eyebrow="PIPELINE SETUP" onBack={() => router.back()} />
      <KeyboardAwareScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {!extractedJob ? (
          <>
            <Text style={styles.eyebrow}>STEP 1 · JOB DETAILS</Text>
            <Text style={styles.detailName}>Open a new pipeline.</Text>
            <Text style={styles.mutedText}>Paste the job description — the requirement extraction engine will identify required and preferred skills for your review before anyone is ranked.</Text>
            <View style={{ height: 8 }} />
            <FormField testID="job-title-input" label="JOB TITLE *" value={title} onChangeText={setTitle} placeholder="Backend Platform Engineer" />
            <FormField testID="job-company-input" label="COMPANY" value={company} onChangeText={setCompany} placeholder="Northstar Labs" />
            <FormField testID="job-department-input" label="DEPARTMENT" value={department} onChangeText={setDepartment} placeholder="Engineering" />
            <FormField testID="job-location-input" label="LOCATION" value={location} onChangeText={setLocation} placeholder="Remote · Bengaluru" />
            <Text style={styles.fieldLabel}>EMPLOYMENT TYPE</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow} contentContainerStyle={[styles.chipRowContent, { paddingHorizontal: 0, marginBottom: 14 }]}>
              {EMPLOYMENT_TYPES.map((item) => (
                <Pressable testID={`employment-type-${item.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`} key={item} onPress={() => setEmploymentType(item)} style={[styles.selectChip, employmentType === item && styles.selectChipActive]}>
                  <Text style={[styles.selectChipText, employmentType === item && styles.selectChipTextActive]}>{item}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <FormField testID="jd-text-input" label="JOB DESCRIPTION *" value={description} onChangeText={setDescription} placeholder="Paste the full job description here..." multiline />
            {error ? <Text testID="new-job-error" style={styles.errorText}>{error}</Text> : null}
            <PrimaryButton testID="create-job-submit-button" label={busy ? "Extracting requirements" : "Create job & extract requirements"} icon="text-search" onPress={() => void createAndExtract()} loading={busy} />
          </>
        ) : (
          <>
            <Text style={styles.eyebrow}>STEP 2 · VERIFY EXTRACTION</Text>
            <Text style={styles.detailName}>{extractedJob.title}</Text>
            <Text style={styles.mutedText}>The engine read your JD and classified its requirements. These weights drive the deterministic ranking — critical requirements outweigh preferred ones.</Text>
            <View style={{ height: 8 }} />
            <SectionTitle eyebrow={`REQUIRED · WEIGHT 10`} title={`${required.length} required signals`} />
            <View style={styles.chipWrap} testID="extracted-required-chips">
              {required.length ? required.map((item) => <Pill key={item.requirement_id} label={item.normalized_skill} tone="info" />) : <Text style={styles.mutedText}>No required skills detected — check the JD text.</Text>}
            </View>
            <SectionTitle eyebrow="PREFERRED · WEIGHT 4" title={`${preferred.length} preferred signals`} />
            <View style={styles.chipWrap} testID="extracted-preferred-chips">
              {preferred.length ? preferred.map((item) => <Pill key={item.requirement_id} label={item.normalized_skill} tone="neutral" />) : <Text style={styles.mutedText}>No preferred skills detected.</Text>}
            </View>
            <View style={styles.philosophyRow}>
              <View style={styles.philosophyIcon}>
                <Icon name="shield-check-outline" color={colors.brand} size={20} />
              </View>
              <View style={styles.philosophyCopy}>
                <Text style={styles.philosophyTitle}>Extraction is LLM-assisted, ranking is not.</Text>
                <Text style={styles.philosophyText}>The LLM only structures your JD. Every candidate score comes from the deterministic keyword + semantic + evidence pipeline.</Text>
              </View>
            </View>
            <PrimaryButton testID="confirm-requirements-button" label={busy ? "Opening pipeline" : "Looks right — open pipeline"} icon="check-circle-outline" onPress={() => void confirm()} loading={busy} />
            <PrimaryButton testID="edit-jd-button" label="Edit JD and re-extract" icon="pencil-outline" onPress={() => setExtractedJob(null)} secondary />
          </>
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}
