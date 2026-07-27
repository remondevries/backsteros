"use client";

import type { GithubConnectionStatus } from "@backsteros/contracts";
import { GithubSettingsSectionView } from "@backsteros/ui";
import { useUser } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";

import { apiErrorMessage, useConsoleApi } from "@/lib/api-context";
import {
  fetchGithubConnectionStatus,
  startGithubOauthConnect,
} from "@/lib/github-oauth";

type SettingsGithubTabProps = {
  title: string;
  description: string;
};

export function SettingsGithubTab({
  title,
  description,
}: SettingsGithubTabProps) {
  const { client } = useConsoleApi();
  const { user, isLoaded } = useUser();
  const [status, setStatus] = useState<GithubConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [testOk, setTestOk] = useState<boolean | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await fetchGithubConnectionStatus(client);
      setStatus(next);
      return next;
    } catch (error) {
      setStatus(null);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void refresh().catch(() => {
      // status card shows empty / not connected
    });
  }, [refresh]);

  const connectLabel =
    status?.connected ||
    user?.externalAccounts.some((account) => account.provider === "github")
      ? "Reconnect GitHub"
      : "Connect GitHub";

  return (
    <GithubSettingsSectionView
      title={title}
      headerDescription={description}
      loading={loading || !isLoaded}
      connected={status?.connected ?? false}
      login={status?.login ?? null}
      scopes={status?.scopes ?? []}
      missingScopes={status?.missingScopes ?? []}
      organizations={status?.organizations ?? []}
      repositoryCount={status?.repositoryCount ?? null}
      reason={actionError ?? status?.reason ?? null}
      connecting={connecting}
      testing={testing}
      testMessage={testMessage}
      testOk={testOk}
      connectLabel={connectLabel}
      connectDisabled={!user}
      onConnect={() => {
        if (!user) return;
        setConnecting(true);
        setActionError(null);
        void startGithubOauthConnect(user)
          .catch((error) => {
            setActionError(
              error instanceof Error
                ? error.message
                : "Could not start GitHub connection.",
            );
          })
          .finally(() => {
            setConnecting(false);
          });
      }}
      onTestConnection={() => {
        void (async () => {
          setTesting(true);
          setTestMessage(null);
          setTestOk(null);
          setActionError(null);
          try {
            const next = await refresh();
            if (!next.connected) {
              setTestOk(false);
              setTestMessage(next.reason ?? "GitHub is not connected.");
              return;
            }
            if (next.missingScopes.length > 0) {
              setTestOk(false);
              setTestMessage(
                `Connected as ${next.login}, but missing scopes: ${next.missingScopes.join(", ")}.`,
              );
              return;
            }
            const orgLabel =
              next.organizations.length > 0
                ? `${next.organizations.length} organization${next.organizations.length === 1 ? "" : "s"}`
                : "no organizations";
            setTestOk(true);
            setTestMessage(
              `Connected as ${next.login} with ${orgLabel} visible.`,
            );
          } catch (error) {
            setTestOk(false);
            setTestMessage(apiErrorMessage(error));
          } finally {
            setTesting(false);
          }
        })();
      }}
    />
  );
}
