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

export function buildStorageKey(
  type: "project" | "knowledge" | "journal",
  path: string,
  projectKey?: string,
): string {
  const normalizedPath = path.replace(/^\/+/, "");

  switch (type) {
    case "journal":
      return `markdown/journal/${normalizedPath}`;
    case "knowledge":
      return `markdown/knowledge/${normalizedPath}`;
    case "project":
      if (!projectKey) {
        throw new Error("PROJECT_KEY_REQUIRED");
      }
      return `markdown/projects/${projectKey}/${normalizedPath}`;
  }
}

export function checksumForContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
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
  body: string,
  contentType = DEFAULT_CONTENT_TYPE,
): Promise<{ etag: string | null; byteSize: number }> {
  const bytes = Buffer.from(body, "utf8");
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
