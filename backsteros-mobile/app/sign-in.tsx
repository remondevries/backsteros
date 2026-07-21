import { useSignIn, useOAuth } from "@clerk/clerk-expo";
import { Link, Redirect } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
} from "react-native";

import { colors } from "../lib/theme";
import { ui } from "../lib/ui";
import { KeyboardAwareScrollView } from "../components/keyboard-aware-scroll-view";
import { TextInput } from "../components/app-text-input";

export default function SignInScreen() {
  const { isSignedIn } = useAuth();
  const { signIn, setActive, isLoaded } = useSignIn();
  const { startOAuthFlow } = useOAuth({ strategy: "oauth_github" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onEmailSignIn = useCallback(async () => {
    if (!isLoaded || !signIn) return;
    setBusy(true);
    setError(null);
    try {
      const result = await signIn.create({
        identifier: email.trim(),
        password,
      });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
      } else {
        setError("Additional sign-in steps required in Clerk.");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }, [email, isLoaded, password, setActive, signIn]);

  const onGithub = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const { createdSessionId, setActive: setOAuthActive } =
        await startOAuthFlow();
      if (createdSessionId && setOAuthActive) {
        await setOAuthActive({ session: createdSessionId });
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }, [startOAuthFlow]);

  if (isSignedIn) {
    return <Redirect href="/(app)/inbox" />;
  }

  return (
    <KeyboardAwareScrollView
      style={ui.screen}
      bottomClearance={24}
      contentContainerStyle={{
        flexGrow: 1,
        padding: 24,
        gap: 12,
        justifyContent: "center",
      }}
    >
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 280,
          backgroundColor: "rgba(255,255,255,0.04)",
        }}
      />
      <Text style={ui.title}>Sign in</Text>
      <Text style={[ui.body, { marginBottom: 8 }]}>
        Sync your workspace on this device. No offline demo data.
      </Text>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        placeholder="Email"
        placeholderTextColor={colors.muted}
        value={email}
        onChangeText={setEmail}
        style={ui.input}
      />
      <TextInput
        secureTextEntry
        placeholder="Password"
        placeholderTextColor={colors.muted}
        value={password}
        onChangeText={setPassword}
        style={ui.input}
      />
      {error ? <Text style={ui.error}>{error}</Text> : null}
      <Pressable
        onPress={() => void onEmailSignIn()}
        disabled={busy}
        style={ui.button}
      >
        {busy ? (
          <ActivityIndicator color={colors.buttonText} />
        ) : (
          <Text style={ui.buttonLabel}>Sign in</Text>
        )}
      </Pressable>
      <Pressable
        onPress={() => void onGithub()}
        disabled={busy}
        style={ui.buttonSecondary}
      >
        <Text style={ui.buttonSecondaryLabel}>Continue with GitHub</Text>
      </Pressable>
      <Link href="/" style={{ marginTop: 8, color: colors.muted }}>
        Back
      </Link>
    </KeyboardAwareScrollView>
  );
}
