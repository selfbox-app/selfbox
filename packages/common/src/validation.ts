import { z } from "zod";
import { MAX_FILE_SIZE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "./constants";

export const paginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE),
});

export const sortSchema = z.object({
  field: z.enum(["name", "size", "createdAt", "updatedAt"]).default("name"),
  direction: z.enum(["asc", "desc"]).default("asc"),
});

export const uuidSchema = z.string().uuid();

export const fileUploadSchema = z.object({
  name: z.string().min(1).max(255),
  size: z.number().int().min(1).max(MAX_FILE_SIZE),
  mimeType: z.string().min(1).max(255),
  folderId: z.string().uuid().nullable().optional(),
});

export const createFolderSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[^/\\:*?"<>|]+$/, "Invalid folder name"),
  parentId: z.string().uuid().nullable().optional(),
});

export const renameFolderSchema = z.object({
  id: z.string().uuid(),
  name: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[^/\\:*?"<>|]+$/, "Invalid folder name"),
});

export const renameFileSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
});

export const moveItemSchema = z.object({
  id: z.string().uuid(),
  targetFolderId: z.string().uuid().nullable(),
});

export const createShareLinkSchema = z.object({
  fileId: z.string().uuid().optional(),
  folderId: z.string().uuid().optional(),
  access: z.enum(["view", "download"]).default("view"),
  password: z.string().min(1).max(255).optional(),
  expiresAt: z.coerce.date().optional(),
  maxDownloads: z.number().int().min(1).optional(),
});

export const createUploadLinkSchema = z.object({
  folderId: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(255),
  maxFiles: z.number().int().min(1).optional(),
  maxFileSize: z.number().int().min(1).max(MAX_FILE_SIZE).optional(),
  allowedMimeTypes: z.array(z.string()).optional(),
  expiresAt: z.coerce.date().optional(),
  password: z.string().min(1).max(255).optional(),
});

// ── Tracked link schemas ───────────────────────────────────────────────────

export const createTrackedLinkSchema = z.object({
  fileId: z.string().uuid().optional(),
  folderId: z.string().uuid().optional(),
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  access: z.enum(["view", "download"]).default("view"),
  password: z.string().min(1).max(255).optional(),
  requireEmail: z.boolean().default(false),
  expiresAt: z.coerce.date().optional(),
  validFrom: z.coerce.date().optional(),
  validUntil: z.coerce.date().optional(),
  maxViews: z.number().int().min(1).optional(),
});

export const updateTrackedLinkSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  access: z.enum(["view", "download"]).optional(),
  password: z.string().min(1).max(255).optional().nullable(),
  requireEmail: z.boolean().optional(),
  expiresAt: z.coerce.date().optional().nullable(),
  validFrom: z.coerce.date().optional().nullable(),
  validUntil: z.coerce.date().optional().nullable(),
  maxViews: z.number().int().min(1).optional().nullable(),
  isActive: z.boolean().optional(),
});

// ── Workspace schemas ──────────────────────────────────────────────────────

export const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(100).trim(),
});

export const updateWorkspaceSchema = z.object({
  name: z.string().min(1).max(100).trim().optional(),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(
      /^[a-z0-9-]+$/,
      "Slug must be lowercase letters, numbers, and hyphens",
    )
    .optional(),
});

export const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "member"]).default("member"),
});

export const updateMemberRoleSchema = z.object({
  memberId: z.string().uuid(),
  role: z.enum(["admin", "member"]),
});

// ── Slug utility ───────────────────────────────────────────────────────────

// ── Upload schemas ─────────────────────────────────────────────────────

export const initiateUploadSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileSize: z.number().int().min(1).max(MAX_FILE_SIZE),
  contentType: z.string().min(1).max(255),
  folderId: z.string().uuid().nullable().optional(),
});

export const completeUploadSchema = z.object({
  fileId: z.string().uuid(),
  uploadId: z.string().optional(),
  parts: z
    .array(
      z.object({
        partNumber: z.number().int().min(1),
        etag: z.string().min(1),
      }),
    )
    .optional(),
});

export const abortUploadSchema = z.object({
  fileId: z.string().uuid(),
  uploadId: z.string().optional(),
});

// ── Desktop sync schemas ────────────────────────────────────────────────

export const desktopDeviceStartSchema = z.object({
  platform: z.enum(["macos", "windows", "linux"]),
  clientName: z.string().min(1).max(120).optional(),
  clientVersion: z.string().min(1).max(40).optional(),
});

export const desktopDeviceApproveSchema = z.object({
  userCode: z
    .string()
    .min(4)
    .max(16)
    .regex(/^[A-Z0-9-]+$/),
});

export const desktopDeviceExchangeSchema = z.object({
  deviceCode: z.string().min(24).max(255),
});

export const desktopDeviceRefreshSchema = z.object({
  refreshToken: z.string().min(24).max(255),
});

export const desktopWorkspaceSchema = z.object({
  workspaceId: z.string().uuid(),
});

export const desktopSyncChangesSchema = z.object({
  workspaceId: z.string().uuid(),
  cursor: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

// ── Desktop file/folder mutation schemas ──────────────────────────────────

/**
 * Optional client-supplied key that makes a mutation retry-safe: the server
 * caches the response against the first (key, device) it sees and returns
 * that same response on subsequent requests with the same key. Generated by
 * the desktop client before journaling a pending op.
 */
const idempotencyKey = z.string().min(8).max(100).optional();

export const desktopFolderCreateSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[^/\\:*?"<>|]+$/, "Invalid folder name"),
  parentId: z.string().uuid().nullable().optional(),
  idempotencyKey,
});

export const desktopFolderRenameSchema = z.object({
  workspaceId: z.string().uuid(),
  id: z.string().uuid(),
  name: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[^/\\:*?"<>|]+$/, "Invalid folder name"),
  expectedVersion: z.number().int().min(1),
  idempotencyKey,
});

export const desktopFolderMoveSchema = z.object({
  workspaceId: z.string().uuid(),
  id: z.string().uuid(),
  targetFolderId: z.string().uuid().nullable(),
  expectedVersion: z.number().int().min(1),
  idempotencyKey,
});

export const desktopFolderDeleteSchema = z.object({
  workspaceId: z.string().uuid(),
  id: z.string().uuid(),
  expectedVersion: z.number().int().min(1),
  idempotencyKey,
});

export const desktopFileUploadInitiateSchema = z.object({
  workspaceId: z.string().uuid(),
  fileName: z.string().min(1).max(255),
  fileSize: z.number().int().min(1).max(MAX_FILE_SIZE),
  contentType: z.string().min(1).max(255),
  folderId: z.string().uuid().nullable().optional(),
  checksum: z
    .string()
    .regex(/^[a-f0-9]{64}$/, "Must be a lowercase hex SHA-256 hash"),
});

export const desktopFileUploadCompleteSchema = z.object({
  workspaceId: z.string().uuid(),
  fileId: z.string().uuid(),
  uploadId: z.string().optional(),
  parts: z
    .array(
      z.object({
        partNumber: z.number().int().min(1),
        etag: z.string().min(1),
      }),
    )
    .optional(),
});

export const desktopFileUpdateInitiateSchema = z.object({
  workspaceId: z.string().uuid(),
  fileId: z.string().uuid(),
  fileSize: z.number().int().min(1).max(MAX_FILE_SIZE),
  contentType: z.string().min(1).max(255),
  checksum: z
    .string()
    .regex(/^[a-f0-9]{64}$/, "Must be a lowercase hex SHA-256 hash"),
  expectedVersion: z.number().int().min(1),
});

export const desktopFileUpdateCompleteSchema = z.object({
  workspaceId: z.string().uuid(),
  fileId: z.string().uuid(),
  uploadId: z.string().optional(),
  parts: z
    .array(
      z.object({
        partNumber: z.number().int().min(1),
        etag: z.string().min(1),
      }),
    )
    .optional(),
});

export const desktopFileDownloadUrlSchema = z.object({
  workspaceId: z.string().uuid(),
  fileId: z.string().uuid(),
});

export const desktopFileRenameSchema = z.object({
  workspaceId: z.string().uuid(),
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  expectedVersion: z.number().int().min(1),
  idempotencyKey,
});

export const desktopFileMoveSchema = z.object({
  workspaceId: z.string().uuid(),
  id: z.string().uuid(),
  targetFolderId: z.string().uuid().nullable(),
  expectedVersion: z.number().int().min(1),
  idempotencyKey,
});

export const desktopFileDeleteSchema = z.object({
  workspaceId: z.string().uuid(),
  id: z.string().uuid(),
  expectedVersion: z.number().int().min(1),
  idempotencyKey,
});

// ── Tag schemas ──────────────────────────────────────────────────────────

export const createTagSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

export const updateTagSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100).trim().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional()
    .nullable(),
});

export const deleteTagSchema = z.object({
  id: z.string().uuid(),
});

export const setFileTagsSchema = z.object({
  fileId: z.string().uuid(),
  tagIds: z.array(z.string().uuid()),
});

export const createKnowledgeBaseSchema = z.object({
  tagIds: z.array(z.string().uuid()).min(1),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  schemaPrompt: z.string().max(10000).optional(),
});

export const updateKnowledgeBaseSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  schemaPrompt: z.string().max(10000).optional(),
  model: z.string().max(80).optional(),
});

export function generateSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/^-+|-+$/g, "");

  return slug || "workspace";
}

export function generateTagSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100)
    .replace(/^-+|-+$/g, "");

  return slug || "tag";
}
