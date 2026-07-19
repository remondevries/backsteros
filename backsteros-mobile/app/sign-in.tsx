import { useSignIn, useOAuth } from "@clerk/clerk-expo";
import { Link, Redirect } from "expo-router";
import { useAuth } from "@clerk/clerk-expo";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

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
    <View style={{ flex: 1, padding: 24, gap: 12, justifyContent: "center" }}>
      <Text style={{ fontSize: 24, fontWeight: "600" }}>Sign in</Text>
      <Text style={{ color: "#666", marginBottom: 8 }}>
        Sync your workspace on this device. No offline demo data.
      </Text>
      <TextInput
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        style={inputStyle}
      />
      <TextInput
        secureTextEntry
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        style={inputStyle}
      />
      {error ? <Text style={{ color: "#b91c1c" }}>{error}</Text> : null}
      <Pressable
        onPress={() => void onEmailSignIn()}
        disabled={busy}
        style={buttonStyle}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={{ color: "#fff", fontWeight: "600" }}>Sign in</Text>
        )}
      </Pressable>
      <Pressable
        onPress={() => void onGithub()}
        disabled={busy}
        style={[buttonStyle, { backgroundColor: "#24292f" }]}
      >
        <Text style={{ color: "#fff", fontWeight: "600" }}>
          Continue with GitHub
        </Text>
      </Pressable>
      <Link href="/" style={{ marginTop: 8, color: "#666" }}>
        Back
      </Link>
    </View>
  );
}

const inputStyle = {
  borderWidth: 1,
  borderColor: "#ddd",
  borderRadius: 10,
  paddingHorizontal: 12,
  paddingVertical: 10,
  fontSize: 16,
} as const;

const buttonStyle = {
  backgroundColor: "#111",
  borderRadius: 10,
  paddingVertical: 12,
  alignItems: "center" as const,
};
