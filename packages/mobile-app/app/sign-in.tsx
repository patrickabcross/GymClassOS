// Sign-in screen — MA1-02.
// The app is sign-in only: no in-app sign-up, no in-app password reset (D-03).
// - "Join / Subscribe" and "Forgot password?" are deep-links to configurable
//   URLs (SUBSCRIBE_URL / RESET_PASSWORD_URL from lib/auth-config, D-06).
// - Phone-fallback (D-12): if the server returns 403 { code: "PHONE_REQUIRED" }
//   on the first post-sign-in profile fetch, an inline phone field appears so
//   the member can link their WhatsApp-only gym_members row by phone_e164.
import { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { signInWithEmail } from "../lib/sign-in-api";
import { apiFetch } from "../lib/api";
import { SUBSCRIBE_URL, RESET_PASSWORD_URL } from "../lib/auth-config";
import { useTheme } from "../lib/theme";

export default function SignInScreen() {
  const router = useRouter();
  const theme = useTheme();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Phone-fallback state (D-12) — shown after 403 PHONE_REQUIRED
  const [phoneRequired, setPhoneRequired] = useState(false);
  const [phone, setPhone] = useState("");
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        outer: {
          flex: 1,
          backgroundColor: theme.colors.background,
        },
        scroll: {
          flexGrow: 1,
          padding: 24,
          paddingTop: 80,
        },
        title: {
          color: theme.colors.foreground,
          fontSize: 28,
          fontFamily: theme.font.bold,
          marginBottom: 4,
        },
        subtitle: {
          color: theme.colors.muted,
          fontSize: 14,
          fontFamily: theme.font.regular,
          marginBottom: 32,
        },
        label: {
          color: theme.colors.muted,
          fontSize: 13,
          fontFamily: theme.font.semibold,
          marginBottom: 6,
          marginTop: 16,
        },
        input: {
          backgroundColor: theme.colors.card,
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.sm,
          paddingHorizontal: 14,
          paddingVertical: 12,
          color: theme.colors.foreground,
          fontFamily: theme.font.regular,
          fontSize: 16,
        },
        inputFocused: {
          borderColor: theme.colors.accent,
        },
        btn: {
          backgroundColor: theme.colors.accent,
          paddingVertical: 14,
          borderRadius: theme.radius.sm,
          alignItems: "center",
          marginTop: 24,
        },
        btnDisabled: {
          opacity: 0.5,
        },
        btnText: {
          color: theme.colors.accentForeground,
          fontFamily: theme.font.bold,
          fontSize: 16,
        },
        secondaryBtn: {
          paddingVertical: 10,
          alignItems: "center",
          marginTop: 12,
        },
        secondaryBtnText: {
          color: theme.colors.muted,
          fontFamily: theme.font.regular,
          fontSize: 14,
          textDecorationLine: "underline",
        },
        error: {
          color: theme.colors.danger,
          fontFamily: theme.font.regular,
          fontSize: 14,
          marginTop: 12,
        },
        divider: {
          height: 1,
          backgroundColor: theme.colors.border,
          marginTop: 32,
          marginBottom: 20,
        },
        phoneSectionTitle: {
          color: theme.colors.foreground,
          fontFamily: theme.font.semibold,
          fontSize: 15,
          marginBottom: 4,
        },
        phoneSectionSubtitle: {
          color: theme.colors.muted,
          fontFamily: theme.font.regular,
          fontSize: 13,
          marginBottom: 8,
        },
        linkRow: {
          flexDirection: "row",
          justifyContent: "center",
          gap: 16,
          marginTop: 32,
          paddingBottom: 48,
        },
      }),
    [theme],
  );

  async function handleSignIn() {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();
    if (!trimmedEmail || !trimmedPassword) {
      setError("Please enter your email and password.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await signInWithEmail(trimmedEmail, trimmedPassword);
      // Check if the server can resolve this email to a gym_members row.
      // If 403 { code: "PHONE_REQUIRED" } → show phone fallback (D-12).
      try {
        await apiFetch("/api/m/profile");
        // Profile loaded — email match succeeded. Navigate to tabs.
        router.replace("/(tabs)");
      } catch (profileErr: any) {
        const msg: string = profileErr?.message ?? "";
        if (msg.includes("PHONE_REQUIRED")) {
          // Server returned 403 { code: "PHONE_REQUIRED" } — show phone field.
          setPhoneRequired(true);
        } else if (msg.includes("401") || msg.includes("403")) {
          // Session valid but no membership. Show contact studio message.
          setError("No membership on file — contact the studio.");
        } else {
          // Unknown error — navigate anyway (profile may load later).
          router.replace("/(tabs)");
        }
      }
    } catch (err: any) {
      setError(err?.message ?? "Sign-in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // Phone-fallback claim: retry profile with x-claim-phone header (D-12).
  // Plan 01's requireMember honors x-claim-phone for the phone lookup.
  async function handlePhoneClaim() {
    const trimmedPhone = phone.trim();
    if (!trimmedPhone) {
      setPhoneError("Please enter your phone number.");
      return;
    }
    setPhoneLoading(true);
    setPhoneError(null);
    try {
      await apiFetch("/api/m/profile", {
        headers: { "x-claim-phone": trimmedPhone } as any,
      });
      router.replace("/(tabs)");
    } catch (err: any) {
      const msg: string = err?.message ?? "";
      if (msg.includes("NO_PHONE_MATCH") || msg.includes("403")) {
        // D-13 copy verbatim
        setPhoneError("No membership on file — contact the studio.");
      } else {
        setPhoneError(msg || "Could not link membership. Please try again.");
      }
    } finally {
      setPhoneLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.outer}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Sign in</Text>
        <Text style={styles.subtitle}>Welcome back to your studio app</Text>

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="next"
          placeholder="you@example.com"
          placeholderTextColor={theme.colors.mutedFaint}
          editable={!loading}
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType="password"
          returnKeyType="done"
          onSubmitEditing={handleSignIn}
          placeholder="••••••••"
          placeholderTextColor={theme.colors.mutedFaint}
          editable={!loading}
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable
          style={[styles.btn, loading && styles.btnDisabled]}
          onPress={handleSignIn}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={theme.colors.accentForeground} />
          ) : (
            <Text style={styles.btnText}>Sign in</Text>
          )}
        </Pressable>

        {/* Phone-fallback expansion (D-12) — shown only after PHONE_REQUIRED */}
        {phoneRequired && (
          <>
            <View style={styles.divider} />
            <Text style={styles.phoneSectionTitle}>Link your membership</Text>
            <Text style={styles.phoneSectionSubtitle}>
              We couldn&apos;t find your account by email. Enter the phone
              number on your gym membership to link it.
            </Text>

            <Text style={styles.label}>Phone number</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              returnKeyType="done"
              onSubmitEditing={handlePhoneClaim}
              placeholder="+44 7700 900000"
              placeholderTextColor={theme.colors.mutedFaint}
              editable={!phoneLoading}
            />

            {phoneError && <Text style={styles.error}>{phoneError}</Text>}

            <Pressable
              style={[styles.btn, phoneLoading && styles.btnDisabled]}
              onPress={handlePhoneClaim}
              disabled={phoneLoading}
            >
              {phoneLoading ? (
                <ActivityIndicator color={theme.colors.accentForeground} />
              ) : (
                <Text style={styles.btnText}>Link my membership</Text>
              )}
            </Pressable>
          </>
        )}

        {/* Deep-link affordances — configurable URLs, no in-app flows (D-03/D-06) */}
        <View style={styles.linkRow}>
          <Pressable
            style={styles.secondaryBtn}
            onPress={() => WebBrowser.openBrowserAsync(SUBSCRIBE_URL)}
          >
            <Text style={styles.secondaryBtnText}>Join / Subscribe</Text>
          </Pressable>

          <Pressable
            style={styles.secondaryBtn}
            onPress={() => WebBrowser.openBrowserAsync(RESET_PASSWORD_URL)}
          >
            <Text style={styles.secondaryBtnText}>Forgot password?</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
