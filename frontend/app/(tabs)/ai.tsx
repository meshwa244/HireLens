import { useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { Icon, ScreenHeader, useUiStyles } from "@/src/components/ui";
import { useActiveJob } from "@/src/hooks";
import { useTheme } from "@/src/theme";

const SUGGESTIONS = [
  "Why is the top candidate ranked above #2?",
  "Who has strong Docker evidence?",
  "Which required skill is most commonly missing?",
];

export default function RecruiterAITab() {
  const styles = useUiStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const job = useActiveJob();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);

  const ask = async (value = question) => {
    if (!value.trim() || !job) return;
    setQuestion(value);
    setLoading(true);
    try {
      const result = await api.ask(job.job_id, value);
      setAnswer(result.answer);
    } catch {
      setAnswer("The grounded assistant is unavailable. The deterministic screening data is still available in Rankings and Technical View.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.flex} testID="recruiter-ai-screen">
      <ScreenHeader title="Recruiter AI" />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "translate-with-padding" : "height"} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.aiScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.aiIntro}>
            <View style={styles.aiOrb}>
              <Icon name="message-text-outline" color={colors.onBrandPrimary} size={25} />
            </View>
            <Text style={styles.aiTitleLarge}>Ask the evidence base.</Text>
            <Text style={[styles.mutedText, { textAlign: "center", marginTop: 8 }]}>Grounded answers from the current screening run. The assistant never invents candidate facts.</Text>
          </View>
          <View style={styles.suggestionWrap}>
            {SUGGESTIONS.map((item) => (
              <Pressable testID={`ai-suggestion-${SUGGESTIONS.indexOf(item)}`} key={item} onPress={() => void ask(item)} style={styles.suggestion}>
                <Text style={styles.suggestionText}>{item}</Text>
                <Icon name="arrow-top-right" color={colors.brand} size={15} />
              </Pressable>
            ))}
          </View>
          {loading ? (
            <View style={styles.aiEmpty} testID="ai-loading">
              <ActivityIndicator color={colors.brand} />
              <Text style={styles.mutedText}>Querying indexed candidate evidence base...</Text>
            </View>
          ) : answer ? (
            <View style={styles.answerCard} testID="ai-answer-card">
              <View style={styles.aiHeader}>
                <Icon name="shield-check-outline" color={colors.brand} size={18} />
                <Text style={styles.aiTitle}>Grounded response</Text>
              </View>
              <Text style={styles.answerText}>{answer}</Text>
              <Text style={styles.sourceText}>Sources · deterministic screening run · requirement matches</Text>
            </View>
          ) : (
            <View style={styles.aiEmpty}>
              <Icon name="text-box-search-outline" color={colors.muted} size={28} />
              <Text style={styles.emptyTitle}>Your recruiter copilot is ready.</Text>
              <Text style={[styles.mutedText, { textAlign: "center" }]}>Ask why a candidate ranked higher, who demonstrates a skill, or what the pool is missing.</Text>
            </View>
          )}
        </ScrollView>
        <View style={[styles.chatComposer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TextInput testID="ai-question-input" value={question} onChangeText={setQuestion} placeholder="Ask about this candidate pool..." placeholderTextColor={colors.muted} style={styles.chatInput} multiline />
          <Pressable testID="ai-send-button" onPress={() => void ask()} style={styles.sendButton} disabled={loading}>
            {loading ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Icon name="arrow-up" color={colors.onBrandPrimary} size={20} />}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
