import type { StorageProvider } from "./interface";
import { LocalStorageAdapter } from "./local";
import { S3StorageAdapter } from "./s3";
import type { S3StorageConfig } from "./s3";
import { R2StorageAdapter } from "./r2";
import type { R2StorageConfig } from "./r2";
import { VercelBlobAdapter } from "./vercel";
import { RailwayStorageAdapter } from "./railway";
import type { RailwayStorageConfig } from "./railway";
import { verifyLocalFileSignature } from "./local-signing";

import type { VercelBlobConfig } from "./vercel";

export type {
  StorageProvider,
  S3StorageConfig,
  R2StorageConfig,
  VercelBlobConfig,
  RailwayStorageConfig,
};
export {
  LocalStorageAdapter,
  S3StorageAdapter,
  R2StorageAdapter,
  VercelBlobAdapter,
  RailwayStorageAdapter,
};
export { verifyLocalFileSignature };

export function createStorage(): StorageProvider {
  const provider =
    process.env.BLOB_STORAGE_PROVIDER ??
    (process.env.RAILWAY_ENVIRONMENT_NAME ? "railway" : "local");

  switch (provider) {
    case "s3":
      return new S3StorageAdapter();
    case "r2":
      return new R2StorageAdapter();
    case "vercel":
      return new VercelBlobAdapter();
    case "railway":
      return new RailwayStorageAdapter();
    case "local":
    default:
      return new LocalStorageAdapter();
  }
}

/**
 * Credential shapes expected per provider (stored as encrypted JSON).
 */
export type StorageCredentials =
  | { provider: "s3"; accessKeyId: string; secretAccessKey: string }
  | {
      provider: "r2";
      accountId: string;
      accessKeyId: string;
      secretAccessKey: string;
    }
  | { provider: "vercel"; readWriteToken: string }
  | { provider: "railway"; accessKeyId: string; secretAccessKey: string };

export interface WorkspaceStorageConfig {
  provider: "s3" | "r2" | "vercel" | "railway";
  bucket: string;
  region?: string | null;
  endpoint?: string | null;
  credentials: StorageCredentials;
}

/**
 * Create a storage adapter from a workspace's custom config.
 * Falls back to the default (env-var) storage when no config is provided.
 */
export function createStorageFromConfig(
  config: WorkspaceStorageConfig,
): StorageProvider {
  const creds = config.credentials;
  switch (creds.provider) {
    case "s3":
      return new S3StorageAdapter({
        accessKeyId: creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey,
        bucket: config.bucket,
        region: config.region ?? undefined,
        endpoint: config.endpoint ?? undefined,
      });
    case "r2":
      return new R2StorageAdapter({
        accountId: creds.accountId,
        accessKeyId: creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey,
        bucket: config.bucket,
        publicUrl: undefined,
      });
    case "vercel":
      return new VercelBlobAdapter({
        token: creds.readWriteToken,
      });
    case "railway":
      return new RailwayStorageAdapter({
        accessKeyId: creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey,
        bucket: config.bucket,
        region: config.region ?? "auto",
        endpoint: config.endpoint ?? "https://storage.railway.app",
      });
    default:
      return createStorage();
  }
}
