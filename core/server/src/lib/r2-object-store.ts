/**
 * Private BacksterOS R2 bucket (ADR-035). Not the WordPress `ld-wp-media` bucket.
 * Credentials come from the process env. `index.ts` may fill them from
 * `~/.config/secrets/backsteros-r2.env` before listen.
 */

import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

/** Ignore sub-second clock skew so our own upload does not look stale. */
export const R2_LOCAL_FRESHNESS_SLACK_MS = 2_000;

export type R2Config = {
  bucket: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
};

let client: S3Client | null = null;
let clientKey = "";

export function readR2Config(
  env: NodeJS.ProcessEnv = process.env,
): R2Config | null {
  const bucket = env.BACKSTEROS_R2_BUCKET?.trim() || "";
  const endpoint = env.BACKSTEROS_R2_ENDPOINT?.trim() || "";
  const accessKeyId = env.BACKSTEROS_R2_ACCESS_KEY_ID?.trim() || "";
  const secretAccessKey = env.BACKSTEROS_R2_SECRET_ACCESS_KEY?.trim() || "";
  if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) return null;
  return {
    bucket,
    endpoint,
    accessKeyId,
    secretAccessKey,
    region: env.BACKSTEROS_R2_REGION?.trim() || "auto",
  };
}

export function isR2Configured(env: NodeJS.ProcessEnv = process.env): boolean {
  return readR2Config(env) != null;
}

/**
 * Cloud-core refuses blob bytes until the shared store exists. Once R2 is
 * configured, missing objects are a normal 404 from storage.
 */
export function blobReadsRequireLocalCore(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    env.CORE_REPLICATION_ROLE?.trim().toLowerCase() === "cloud" &&
    !isR2Configured(env)
  );
}

export function shouldRefreshLocalFromRemote(
  localMtimeMs: number | null,
  remoteMtimeMs: number | null,
): boolean {
  if (remoteMtimeMs == null) return false;
  if (localMtimeMs == null) return true;
  return remoteMtimeMs > localMtimeMs + R2_LOCAL_FRESHNESS_SLACK_MS;
}

function r2Client(): { client: S3Client; bucket: string } {
  const config = readR2Config();
  if (!config) {
    throw new Error("R2_NOT_CONFIGURED");
  }
  const key = `${config.endpoint}|${config.bucket}|${config.accessKeyId}`;
  if (!client || clientKey !== key) {
    client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
    clientKey = key;
  }
  return { client, bucket: config.bucket };
}

function isMissingObject(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String(error.name) : "";
  const code =
    "$metadata" in error
      ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata
          ?.httpStatusCode
      : undefined;
  return name === "NotFound" || name === "NoSuchKey" || code === 404;
}

export async function headR2Object(
  key: string,
): Promise<{
  lastModifiedMs: number;
  etag: string | null;
  size: number | null;
} | null> {
  const { client: s3, bucket } = r2Client();
  try {
    const out = await s3.send(
      new HeadObjectCommand({ Bucket: bucket, Key: key }),
    );
    return {
      lastModifiedMs: out.LastModified?.getTime() ?? 0,
      etag: out.ETag ?? null,
      size: out.ContentLength ?? null,
    };
  } catch (error) {
    if (isMissingObject(error)) return null;
    throw error;
  }
}

export async function putR2Object(
  key: string,
  body: Uint8Array,
  contentType: string,
): Promise<void> {
  const { client: s3, bucket } = r2Client();
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function getR2Object(
  key: string,
): Promise<{ bytes: Buffer; contentType: string | null } | null> {
  const { client: s3, bucket } = r2Client();
  try {
    const out = await s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    if (!out.Body) return null;
    const bytes = Buffer.from(await out.Body.transformToByteArray());
    return { bytes, contentType: out.ContentType ?? null };
  } catch (error) {
    if (isMissingObject(error)) return null;
    throw error;
  }
}

export async function deleteR2Object(key: string): Promise<void> {
  const { client: s3, bucket } = r2Client();
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch (error) {
    if (isMissingObject(error)) return;
    throw error;
  }
}

/** @returns false when the source key is not in the bucket. */
export async function copyR2Object(
  fromKey: string,
  toKey: string,
): Promise<boolean> {
  if (fromKey === toKey) return true;
  const head = await headR2Object(fromKey);
  if (!head) return false;
  const { client: s3, bucket } = r2Client();
  await s3.send(
    new CopyObjectCommand({
      Bucket: bucket,
      Key: toKey,
      CopySource: `${bucket}/${encodeURIComponent(fromKey).replace(/%2F/g, "/")}`,
    }),
  );
  return true;
}
