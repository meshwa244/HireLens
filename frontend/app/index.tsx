import * as Linking from "expo-linking";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { api } from "@/src/api";
import { Icon, PrimaryButton, useUiStyles } from "@/src/components/ui";
import { hasSession, saveSession } from "@/src/session";
import { useTheme } from "@/src/theme";

WebBrowser.maybeCompleteAuthSession();

// One-time use guard: the same session_id can surface from the auth-session
// result, a hot deep link and a cold start — exchange it exactly once.
const exchangedSessionIds = new Set<string>();

function extractSessionId(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(/[?#&]session_id=([^&#]+)/);
  return match?.[1] ?? null;
}

function Field({ label, value, onChangeText, placeholder, secureTextEntry, keyboardType, testID }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; secureTextEntry?: boolean; keyboardType?: "email-address" | "default"; testID: string }) {
  const styles = useUiStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput testID={testID} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.muted} secureTextEntry={secureTextEntry} keyboardType={keyboardType} autoCapitalize="none" style={styles.input} />
    </View>
  );
}

export default function AuthScreen() {
  const styles = useUiStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [mode, setMode] = useState<"demo" | "login" | "signup">("demo");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [organization, setOrganization] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");

  const exchangeGoogleSession = async (sessionId: string): Promise<boolean> => {
    if (exchangedSessionIds.has(sessionId)) return false;
    exchangedSessionIds.add(sessionId);
    const result = await api.googleSession(sessionId);
    await saveSession(result.session_token, result.user);
    router.replace("/(tabs)/overview");
    return true;
  };

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        // Web redirect return: session_id is in the URL — process FIRST.
        if (Platform.OS === "web" && typeof window !== "undefined") {
          const sessionId = extractSessionId(`${window.location.search}${window.location.hash}`);
          if (sessionId) {
            try {
              await exchangeGoogleSession(sessionId);
            } catch {
              exchangedSessionIds.delete(sessionId);
              if (mounted) {
                setError("Google sign-in failed. Please try again.");
                setChecking(false);
              }
            } finally {
              window.history.replaceState(window.history.state, "", window.location.pathname);
            }
            return;
          }
        }
        // Mobile cold start: app reopened via deep link carrying session_id.
        if (Platform.OS !== "web") {
          const initial = await Linking.getInitialURL();
          const sessionId = extractSessionId(initial);
          if (sessionId) {
            try {
              await exchangeGoogleSession(sessionId);
            } catch {
              exchangedSessionIds.delete(sessionId);
              if (mounted) setChecking(false);
            }
            return;
          }
        }
        if (await hasSession()) {
          if (mounted) router.replace("/(tabs)/overview");
          return;
        }
      } finally {
        if (mounted) setChecking(false);
      }
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startGoogleSignIn = async () => {
    setError("");
    setGoogleLoading(true);
    try {
      if (Platform.OS === "web") {
        if (typeof window !== "undefined") {
          const redirectUrl = `${window.location.origin}/`;
          window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
        }
        return;
      }
      const redirectUrl = Linking.createURL("");
      const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
      // Android (Expo Go) often returns dismiss with no URL even on success —
      // the deep-link listener and getInitialURL are co-equal sources.
      let captured: string | null = null;
      const subscription = Linking.addEventListener("url", (event) => {
        captured = event.url;
      });
      try {
        const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
        const url = result.type === "success" && result.url ? result.url : captured ?? (await Linking.getInitialURL());
        const sessionId = extractSessionId(url);
        if (sessionId) {
          await exchangeGoogleSession(sessionId);
        }
      } finally {
        subscription.remove();
      }
    } catch {
      setError("Google sign-in failed. Please try again.");
    } finally {
      setGoogleLoading(false);
    }
  };

  const submit = async () => {
    setLoading(true);
    setError("");
    try {
      const result = mode === "demo" ? await api.demoLogin() : mode === "login" ? await api.login(email, password) : await api.signup(fullName, email, password, organization);
      await saveSession(result.token, result.user);
      router.replace("/(tabs)/overview");
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/[{}"]+/g, "") : "Unable to authenticate");
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <View style={styles.loadingRoot} testID="auth-loading">
        <ActivityIndicator color={colors.brand} size="large" />
        <Text style={styles.mutedText}>Authenticating session...</Text>
      </View>
    );
  }

  return (
    <View style={styles.authRoot} testID="auth-screen">
      <StatusBar style="light" />
      <LinearGradient colors={[colors.surface, colors.surfaceSecondary, colors.surface]} style={StyleSheet.absoluteFillObject} />
      <View style={styles.authOrb} />
      <View style={styles.authOrbSmall} />
      <KeyboardAwareScrollView contentContainerStyle={styles.authContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.brandRow}>
          <View style={styles.brandMark}>
            <Icon name="crosshairs-gps" color={colors.onBrandPrimary} size={22} />
          </View>
          <Text style={styles.brandName}>HIRELENS</Text>
        </View>
        <Text style={styles.authTitle}>See beyond the{`\n`}resume.</Text>
        <Text style={styles.authSubtitle}>Hire with evidence.</Text>
        <Text style={styles.authBody}>Evidence-weighted talent intelligence for recruiters who need to know why.</Text>
        <View style={styles.authCard}>
          {mode !== "demo" ? (
            <>
              {mode === "signup" ? <Field testID="signup-name-input" label="FULL NAME" value={fullName} onChangeText={setFullName} placeholder="Your name" /> : null}
              <Field testID="auth-email-input" label="EMAIL" value={email} onChangeText={setEmail} placeholder="you@company.com" keyboardType="email-address" />
              <Field testID="auth-password-input" label="PASSWORD" value={password} onChangeText={setPassword} placeholder="8+ characters" secureTextEntry />
              {mode === "signup" ? <Field testID="signup-organization-input" label="ORGANIZATION" value={organization} onChangeText={setOrganization} placeholder="Company or team" /> : null}
            </>
          ) : (
            <View style={styles.demoCallout}>
              <Icon name="flash-outline" color={colors.brand} size={20} />
              <View style={styles.demoCopy}>
                <Text style={styles.demoTitle}>Ready-to-review demo workspace</Text>
                <Text style={styles.demoText}>18 candidates · deterministic hybrid ranking · evidence detail</Text>
              </View>
            </View>
          )}
          {error ? <Text testID="auth-error-text" style={styles.errorText}>{error}</Text> : null}
          <PrimaryButton testID="auth-submit-button" label={mode === "demo" ? "Enter demo workspace" : mode === "login" ? "Sign in" : "Create recruiter account"} onPress={() => void submit()} icon={mode === "demo" ? "arrow-right" : "lock-outline"} loading={loading} />
          <View style={{ height: 10 }} />
          <PrimaryButton testID="google-signin-button" label="Continue with Google" onPress={() => void startGoogleSignIn()} icon="google" loading={googleLoading} secondary />
          <View style={styles.authSwitch}>
            {mode !== "demo" ? (
              <Pressable testID="auth-use-demo-link" onPress={() => setMode("demo")}>
                <Text style={styles.mutedLink}>Use demo workspace</Text>
              </Pressable>
            ) : null}
            <Pressable testID="auth-switch-mode-link" onPress={() => setMode(mode === "login" ? "signup" : "login")}>
              <Text style={styles.mutedLink}>{mode === "signup" ? "Already have an account? Sign in" : "Sign in with your account"}</Text>
            </Pressable>
          </View>
        </View>
        <Text style={styles.integrityNote}>
          <Icon name="shield-check-outline" color={colors.muted} size={14} /> Ranking job-relevant evidence, not personal identity.
        </Text>
      </KeyboardAwareScrollView>
    </View>
  );
}
