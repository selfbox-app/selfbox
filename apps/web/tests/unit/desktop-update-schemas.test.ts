import { describe, expect, it } from "vitest";
import {
  desktopFileUpdateInitiateSchema,
  desktopFileUpdateCompleteSchema,
} from "@selfbox/common";

describe("desktop file update schemas", () => {
  const validUuid = "6ba7b810-9dad-41d1-80b4-00c04fd430c8";
  const validChecksum = "a".repeat(64);

  describe("desktopFileUpdateInitiateSchema", () => {
    it("accepts a valid payload", () => {
      const parsed = desktopFileUpdateInitiateSchema.parse({
        workspaceId: validUuid,
        fileId: validUuid,
        fileSize: 1234,
        contentType: "text/markdown",
        checksum: validChecksum,
        expectedVersion: 3,
      });
      expect(parsed.fileId).toBe(validUuid);
      expect(parsed.expectedVersion).toBe(3);
    });

    it("rejects uppercase hex in checksum", () => {
      expect(() =>
        desktopFileUpdateInitiateSchema.parse({
          workspaceId: validUuid,
          fileId: validUuid,
          fileSize: 1234,
          contentType: "text/markdown",
          checksum: "A".repeat(64),
          expectedVersion: 1,
        }),
      ).toThrow();
    });

    it("rejects checksum of wrong length", () => {
      expect(() =>
        desktopFileUpdateInitiateSchema.parse({
          workspaceId: validUuid,
          fileId: validUuid,
          fileSize: 1234,
          contentType: "text/markdown",
          checksum: "abc123",
          expectedVersion: 1,
        }),
      ).toThrow();
    });

    it("requires expectedVersion >= 1", () => {
      expect(() =>
        desktopFileUpdateInitiateSchema.parse({
          workspaceId: validUuid,
          fileId: validUuid,
          fileSize: 1234,
          contentType: "text/markdown",
          checksum: validChecksum,
          expectedVersion: 0,
        }),
      ).toThrow();
    });

    it("rejects zero-byte files", () => {
      expect(() =>
        desktopFileUpdateInitiateSchema.parse({
          workspaceId: validUuid,
          fileId: validUuid,
          fileSize: 0,
          contentType: "text/plain",
          checksum: validChecksum,
          expectedVersion: 1,
        }),
      ).toThrow();
    });
  });

  describe("desktopFileUpdateCompleteSchema", () => {
    it("accepts a minimal payload", () => {
      const parsed = desktopFileUpdateCompleteSchema.parse({
        workspaceId: validUuid,
        fileId: validUuid,
      });
      expect(parsed.fileId).toBe(validUuid);
      expect(parsed.uploadId).toBeUndefined();
    });

    it("accepts a multipart payload", () => {
      const parsed = desktopFileUpdateCompleteSchema.parse({
        workspaceId: validUuid,
        fileId: validUuid,
        uploadId: "mp-abc",
        parts: [
          { partNumber: 1, etag: "etag-1" },
          { partNumber: 2, etag: "etag-2" },
        ],
      });
      expect(parsed.parts).toHaveLength(2);
      expect(parsed.parts![0]!.partNumber).toBe(1);
    });

    it("rejects empty etag", () => {
      expect(() =>
        desktopFileUpdateCompleteSchema.parse({
          workspaceId: validUuid,
          fileId: validUuid,
          uploadId: "mp-abc",
          parts: [{ partNumber: 1, etag: "" }],
        }),
      ).toThrow();
    });
  });
});
