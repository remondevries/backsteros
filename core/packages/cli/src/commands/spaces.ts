import type { CliClient, CliConfig } from "../config.js";
import { emitResult } from "../output.js";

type SpaceCard = {
  id: string;
  title: string;
  path: string;
  categoryId?: string;
  articleCount?: number;
};

function requireAction(action: string | undefined, usage: string): string {
  if (!action) throw new Error(usage);
  return action;
}

export async function runSpacesCommand(
  client: CliClient,
  config: CliConfig,
  action: string | undefined,
  positionals: string[],
  values: Record<string, string | boolean | undefined>,
): Promise<void> {
  const act = requireAction(
    action,
    "Usage: backsteros spaces <categories|list|create|get|tree|article|heal> …",
  );

  switch (act) {
    case "categories": {
      const res = await client.requestJson<{
        categories: Array<{
          id: string;
          title: string;
          path: string;
          spaceCount: number;
        }>;
      }>("/api/v1/spaces/categories");
      emitResult(
        config.json,
        res,
        res.categories
          .map((c) => `${c.id}\t${c.spaceCount}\t${c.title}`)
          .join("\n") || "(no categories)",
      );
      return;
    }
    case "list": {
      const category =
        typeof values.category === "string" ? values.category : positionals[0];
      if (!category) {
        throw new Error(
          "Usage: backsteros spaces list --category support|knowledge-base|websites",
        );
      }
      const res = await client.requestJson<{ spaces: SpaceCard[] }>(
        `/api/v1/spaces/categories/${encodeURIComponent(category)}/spaces`,
      );
      emitResult(
        config.json,
        res,
        res.spaces
          .map(
            (s) =>
              `${s.path}\t${s.articleCount ?? 0}\t${s.title}\t${s.id}`,
          )
          .join("\n") || "(no spaces)",
      );
      return;
    }
    case "create": {
      const category =
        typeof values.category === "string" ? values.category : undefined;
      const title =
        typeof values.title === "string" ? values.title : undefined;
      if (!category || !title) {
        throw new Error(
          'Usage: backsteros spaces create --category support --title "Portal"',
        );
      }
      const body: Record<string, unknown> = { title };
      if (typeof values.icon === "string") body.icon = values.icon;
      const res = await client.requestJson<{ space: SpaceCard }>(
        `/api/v1/spaces/categories/${encodeURIComponent(category)}/spaces`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      emitResult(
        config.json,
        res,
        `created ${res.space.path}  ${res.space.title}  (${res.space.id})`,
      );
      return;
    }
    case "get": {
      const ref = positionals[0];
      if (!ref) throw new Error("Usage: backsteros spaces get <spaceId>");
      const res = await client.requestJson<{ space: SpaceCard }>(
        `/api/v1/spaces/${encodeURIComponent(ref)}`,
      );
      emitResult(
        config.json,
        res,
        `${res.space.path}  ${res.space.title}  (${res.space.id})`,
      );
      return;
    }
    case "tree": {
      const ref = positionals[0];
      if (!ref) throw new Error("Usage: backsteros spaces tree <spaceId>");
      const res = await client.requestJson<{
        space: SpaceCard;
        nodes: Array<{
          id: string;
          title: string;
          path: string;
          kind: string;
          parentId: string | null;
        }>;
      }>(`/api/v1/spaces/${encodeURIComponent(ref)}/tree`);
      emitResult(
        config.json,
        res,
        [
          `space\t${res.space.path}\t${res.space.title}`,
          ...res.nodes.map(
            (n) => `${n.kind}\t${n.path}\t${n.title}\t${n.id}`,
          ),
        ].join("\n"),
      );
      return;
    }
    case "heal": {
      const res = await client.requestJson<{
        ok: true;
        report: {
          movedPortalToSupport: boolean;
          pathFixes: number;
          vaultReconciles?: number;
        };
      }>("/api/v1/spaces/heal", { method: "POST" });
      emitResult(
        config.json,
        res,
        `healed movedPortal=${res.report.movedPortalToSupport} pathFixes=${res.report.pathFixes} vaultReconciles=${res.report.vaultReconciles ?? 0}`,
      );
      return;
    }
    case "article": {
      const sub = positionals[0];
      if (sub === "create") {
        const spaceId = positionals[1];
        const title =
          typeof values.title === "string" ? values.title : undefined;
        if (!spaceId || !title) {
          throw new Error(
            'Usage: backsteros spaces article create <spaceId> --title "…" [--content "…"]',
          );
        }
        const body: Record<string, unknown> = { title };
        if (typeof values.content === "string") body.content = values.content;
        if (typeof values.parent === "string") {
          body.parentFolderId = values.parent;
        }
        const res = await client.requestJson<{ article: { id: string; path: string; title: string } }>(
          `/api/v1/spaces/${encodeURIComponent(spaceId)}/articles`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          },
        );
        emitResult(
          config.json,
          res,
          `created ${res.article.path}  ${res.article.title}  (${res.article.id})`,
        );
        return;
      }
      if (sub === "get") {
        const id = positionals[1];
        if (!id) {
          throw new Error("Usage: backsteros spaces article get <articleId>");
        }
        const res = await client.requestJson<{
          article: { id: string; path: string; title: string };
          content: string;
        }>(`/api/v1/spaces/articles/${encodeURIComponent(id)}/content`);
        emitResult(
          config.json,
          res,
          `${res.article.path}\n\n${res.content}`,
        );
        return;
      }
      if (sub === "set") {
        const id = positionals[1];
        const content =
          typeof values.content === "string" ? values.content : undefined;
        if (!id || content === undefined) {
          throw new Error(
            "Usage: backsteros spaces article set <articleId> --content \"…\"",
          );
        }
        const res = await client.requestJson<{
          article: { id: string; path: string; title: string };
        }>(`/api/v1/spaces/articles/${encodeURIComponent(id)}/content`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ content }),
        });
        emitResult(
          config.json,
          res,
          `updated ${res.article.path}  (${res.article.id})`,
        );
        return;
      }
      if (sub === "delete") {
        const id = positionals[1];
        if (!id) {
          throw new Error(
            "Usage: backsteros spaces article delete <articleId>",
          );
        }
        const res = await client.requestJson<{ ok: true; id: string }>(
          `/api/v1/spaces/articles/${encodeURIComponent(id)}`,
          { method: "DELETE" },
        );
        emitResult(config.json, res, `deleted ${res.id}`);
        return;
      }
      throw new Error(
        "Usage: backsteros spaces article <create|get|set|delete> …",
      );
    }
    default:
      throw new Error(
        `Unknown spaces action "${act}". Use categories|list|create|get|tree|article|heal.`,
      );
  }
}
