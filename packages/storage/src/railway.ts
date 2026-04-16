import { S3StorageAdapter } from "./s3";
import type { S3StorageConfig } from "./s3";

export type RailwayStorageConfig = Partial<S3StorageConfig>;

/**
 * Railway Storage Buckets adapter.
 *
 * Railway buckets are S3-compatible (built on Tigris), so this adapter extends
 * S3StorageAdapter and maps Railway's environment variables to the S3 config.
 *
 * Railway injects these env vars when a bucket is connected to a service:
 *   BUCKET_ENDPOINT / ENDPOINT    — e.g. https://storage.railway.app
 *   BUCKET_ACCESS_KEY_ID / ACCESS_KEY_ID
 *   BUCKET_SECRET_ACCESS_KEY / SECRET_ACCESS_KEY
 *   BUCKET_NAME / BUCKET          — the globally-unique bucket name
 */
export class RailwayStorageAdapter extends S3StorageAdapter {
  constructor(config?: RailwayStorageConfig) {
    super({
      accessKeyId:
        config?.accessKeyId ??
        process.env.BUCKET_ACCESS_KEY_ID ??
        process.env.ACCESS_KEY_ID ??
        "",
      secretAccessKey:
        config?.secretAccessKey ??
        process.env.BUCKET_SECRET_ACCESS_KEY ??
        process.env.SECRET_ACCESS_KEY ??
        "",
      bucket:
        config?.bucket ??
        process.env.BUCKET_NAME ??
        process.env.BUCKET ??
        "selfbox",
      region: config?.region ?? "auto",
      endpoint:
        config?.endpoint ??
        process.env.BUCKET_ENDPOINT ??
        process.env.ENDPOINT ??
        "https://storage.railway.app",
    });
  }
}
