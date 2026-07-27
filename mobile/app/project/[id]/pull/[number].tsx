import type { GithubPullRequest } from "@backsteros/contracts";
import { Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import { GithubPullRequestDetail } from "../../../../components/codebase/github-detail-panes";
import { colors } from "../../../../lib/theme";
import { ui } from "../../../../lib/ui";
import { useMobileApiClient } from "../../../../lib/use-mobile-api-client";

/** Phone stack route: pull request detail for a codebase project. */
export default function ProjectPullDetailScreen() {
  const { id, number: numberParam } = useLocalSearchParams<{
    id: string;
    number: string;
  }>();
  const projectId = typeof id === "string" ? id : "";
  const pullNumber = Number(numberParam);
  const client = useMobileApiClient();

  const [pullRequest, setPullRequest] = useState<GithubPullRequest | null>(
    null,
  );
  const [repository, setRepository] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId || !Number.isFinite(pullNumber) || pullNumber < 1) return;
    setLoading(true);
    setError(null);
    try {
      const body = await client.requestJson<{
        pullRequest: GithubPullRequest;
        repository?: string | null;
      }>(
        `/api/v1/projects/${encodeURIComponent(projectId)}/github/pulls/${pullNumber}`,
      );
      setPullRequest(body.pullRequest);
      setRepository(body.repository ?? null);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not load pull request.",
      );
    } finally {
      setLoading(false);
    }
  }, [client, projectId, pullNumber]);

  useEffect(() => {
    void load();
  }, [load]);

  const title = pullRequest
    ? `#${pullRequest.number} ${pullRequest.title}`
    : "Pull request";

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
      ) : error || !pullRequest ? (
        <View style={[ui.screen, { padding: 16 }]}>
          <Text style={ui.error}>{error ?? "Pull request not found."}</Text>
        </View>
      ) : (
        <GithubPullRequestDetail
          projectId={projectId}
          pullRequest={pullRequest}
          repository={repository}
        />
      )}
    </>
  );
}
