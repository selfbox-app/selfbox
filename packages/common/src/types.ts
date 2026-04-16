export type StorageProvider = 'local' | 's3' | 'r2' | 'vercel';

export type FileStatus = 'uploading' | 'ready' | 'failed';

export type ShareLinkAccess = 'view' | 'download';

export type UploadLinkStatus = 'active' | 'expired' | 'revoked';

export type SortField = 'name' | 'size' | 'createdAt' | 'updatedAt';
export type SortDirection = 'asc' | 'desc';

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface BreadcrumbItem {
  id: string;
  name: string;
}

// Workspace types
export const WORKSPACE_ROLES = ['owner', 'admin', 'member'] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];
export type InviteStatus = 'pending' | 'accepted' | 'expired';

export const DESKTOP_DEVICE_STATUSES = [
  'pending',
  'approved',
  'revoked',
  'expired',
] as const;
export type DesktopDeviceStatus = (typeof DESKTOP_DEVICE_STATUSES)[number];

export const SYNC_ENTITY_TYPES = ['file', 'folder'] as const;
export type SyncEntityType = (typeof SYNC_ENTITY_TYPES)[number];

export const SYNC_EVENT_TYPES = [
  'created',
  'updated',
  'moved',
  'renamed',
  'deleted',
] as const;
export type SyncEventType = (typeof SYNC_EVENT_TYPES)[number];

export interface DesktopWorkspaceSummary {
  id: string;
  slug: string;
  name: string;
  role: WorkspaceRole;
}
