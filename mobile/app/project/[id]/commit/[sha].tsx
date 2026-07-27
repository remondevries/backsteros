import type { GithubCommit } from "@backsteros/contracts";
import { Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import { GithubCommitDetail } from "../../../../components/codebase/github-detail-panes";
import { commitSubject } from "../../../../lib/github-format";
import { colors } from "../../../../lib/theme";
import { ui } from "../../../../lib/ui";
import { useMobileApiClient } from "../../../../lib/use-mobile-api-client";

/** Phone stack route: commit detail for a codebase project. */
export default function ProjectCommitDetailScreen() {
  const { id, sha } = useLocalSearchParams<{ id: string; sha: string }>();
  const projectId = typeof id === "string" ? id : "";
  const commitSha = typeof sha === "string" ? sha : "";
  const client = useMobileApiClient();

  const [commit, setCommit] = useState<GithubCommit | null>(null);
  const [repository, setRepository] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId || !commitSha) return;
    setLoading(true);
    setError(null);
    try {
      const body = await client.requestJson<{
        commit: GithubCommit;
        repository?: string | null;
      }>(
        `/api/v1/projects/${encodeURIComponent(projectId)}/github/commits/${encodeURIComponent(commitSha)}`,
      );
      setCommit(body.commit);
      setRepository(body.repository ?? null);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not load commit.",
      );
    } finally {
      setLoading(false);
    }
  }, [client, commitSha, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const title = commit ? commitSubject(commit.message) : "Commit";

  return (
    <>
      <Stack.Screen
        options={{
          title,
          headerBackButtonDisplayMode: "minimal",
        }}
      />
      {loading ? (
        <View style={ui.centered}>
          <ActivityIndicator color={colors.muted} />
        </View>
      ) : error || !commit ? (
        <View style={[ui.screen, { padding: 16 }]}>
          <Text style={ui.error}>{error ?? "Commit not found."}</Text>
        </View>
      ) : (
        <GithubCommitDetail
          projectId={projectId}
          commit={commit}
          repository={repository}
        />
      )}
    </>
  );
}
