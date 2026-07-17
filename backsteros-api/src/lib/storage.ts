import { createHash } from "node:crypto";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const DEFAULT_CONTENT_TYPE = "text/markdown; charset=utf-8";
const SNIPPET_LENGTH = 500;

let client: S3Client | null = null;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for object storage`);
  }
  return value;
}

/** True when all env vars needed for Spaces put/get are present. */
export function isSpacesConfigured(): boolean {
  return Boolean(
    process.env.SPACES_ENDPOINT &&
      process.env.SPACES_BUCKET &&
      process.env.SPACES_ACCESS_KEY_ID &&
      process.env.SPACES_SECRET_ACCESS_KEY,
  );
}

export function getStorageClient(): S3Client {
  if (!client) {
    client = new S3Client({
      endpoint: requireEnv("SPACES_ENDPOINT"),
      region: process.env.SPACES_REGION ?? "ams3",
      credentials: {
        accessKeyId: requireEnv("SPACES_ACCESS_KEY_ID"),
        secretAccessKey: requireEnv("SPACES_SECRET_ACCESS_KEY"),
      },
      forcePathStyle: false,
    });
  }

  return client;
}

export function getBucketName(): string {
  return requireEnv("SPACES_BUCKET");
}

function safeSegment(value: string): string {
  const normalized = value.replace(/[^a-zA-Z0-9._-]/g, "_");
  if (!normalized || normalized === "." || normalized === "..") {
    throw new Error("INVALID_STORAGE_SEGMENT");
  }
  return normalized;
}

function safePath(path: string): string {
  return path
    .replace(/^\/+/, "")
    .split("/")
    .filter((segment) => segment && segment !== "." && segment !== "..")
    .map(safeSegment)
    .join("/");
}

export function buildStorageKey(
  type: "project" | "knowledge" | "journal",
  path: string,
  projectKey?: string,
  workspaceId?: string,
): string {
  const normalizedPath = safePath(path);
  if (!normalizedPath) {
    throw new Error("INVALID_STORAGE_SEGMENT");
  }
  const prefix = workspaceId
    ? `workspaces/${safeSegment(workspaceId)}/`
    : "";

  switch (type) {
    case "journal":
      return `${prefix}markdown/journal/${normalizedPath}`;
    case "knowledge":
      return `${prefix}markdown/knowledge/${normalizedPath}`;
    case "project": {
      if (!projectKey) {
        throw new Error("PROJECT_KEY_REQUIRED");
      }
      return `${prefix}markdown/projects/${safeSegment(projectKey)}/${normalizedPath}`;
    }
  }
}

export function buildPrivateStorageKey(
  workspaceId: string,
  category: "pdfs" | "avatars",
  entityId: string,
  fileName: string,
): string {
  return `workspaces/${safeSegment(workspaceId)}/private/${category}/${safeSegment(entityId)}/${safeSegment(fileName)}`;
}

export function assertPrivateStorageKey(workspaceId: string, key: string): void {
  const prefix = `workspaces/${safeSegment(workspaceId)}/private/`;
  if (!key.startsWith(prefix)) {
    throw new Error("STORAGE_KEY_OUTSIDE_WORKSPACE");
  }
}

export function checksumForContent(content: string | Uint8Array): string {
  return createHash("sha256")
    .update(typeof content === "string" ? Buffer.from(content, "utf8") : content)
    .digest("hex");
}

export function snippetForContent(content: string): string {
  const trimmed = content.trim();
  if (trimmed.length <= SNIPPET_LENGTH) {
    return trimmed;
  }
  return `${trimmed.slice(0, SNIPPET_LENGTH)}…`;
}

export async function putObject(
  key: string,
  body: string | Uint8Array,
  contentType = DEFAULT_CONTENT_TYPE,
): Promise<{ etag: string | null; byteSize: number }> {
  const bytes = typeof body === "string" ? Buffer.from(body, "utf8") : Buffer.from(body);
  const result = await getStorageClient().send(
    new PutObjectCommand({
      Bucket: getBucketName(),
      Key: key,
      Body: bytes,
      ContentType: contentType,
    }),
  );

  return {
    etag: result.ETag?.replaceAll('"', "") ?? null,
    byteSize: bytes.byteLength,
  };
}

export async function getObject(key: string): Promise<{
  body: string;
  bytes: Uint8Array;
  etag: string | null;
  contentType: string;
  byteSize: number;
}> {
  const result = await getStorageClient().send(
    new GetObjectCommand({
      Bucket: getBucketName(),
      Key: key,
    }),
  );

  if (!result.Body) {
    throw new Error("OBJECT_EMPTY");
  }

  const bytes = Buffer.from(await result.Body.transformToByteArray());

  return {
    body: bytes.toString("utf8"),
    bytes,
    etag: result.ETag?.replaceAll('"', "") ?? null,
    contentType: result.ContentType ?? DEFAULT_CONTENT_TYPE,
    byteSize: bytes.byteLength,
  };
}

export async function deleteObject(key: string): Promise<void> {
  await getStorageClient().send(
    new DeleteObjectCommand({
      Bucket: getBucketName(),
      Key: key,
    }),
  );
}
