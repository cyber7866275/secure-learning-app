/** Types mirroring the backend (NestJS) response shapes. Do not drift: if a
 *  backend DTO changes, update here. See backend src modules' dto files. */

export interface Page<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export type UserStatus = 'ACTIVE' | 'BLOCKED';
export type ContentStatus = 'DRAFT' | 'PUBLISHED' | 'HIDDEN';
export type PermissionTarget = 'PDF' | 'VIDEO' | 'CATEGORY';

export interface User {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  status: UserStatus;
  maxDevices: number;
  accessExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Device {
  id: string;
  fingerprint: string;
  name: string | null;
  ip: string | null;
  lastSeenAt: string;
  revoked: boolean;
}

export interface UserDetail extends User {
  devices: Device[];
}

export interface TaxonomyNode {
  id: string;
  name: string;
}

export interface Category extends TaxonomyNode {
  type: 'PDF' | 'VIDEO' | 'BOTH';
  sortOrder: number;
}

export interface Subject extends TaxonomyNode {
  categoryId: string;
  sortOrder: number;
}

export interface Chapter extends TaxonomyNode {
  subjectId: string;
  sortOrder: number;
}

export interface Pdf {
  id: string;
  title: string;
  status: ContentStatus;
  storageKey: string;
  pageCount: number | null;
  fileSize: number | null;
  categoryId: string | null;
  subjectId: string | null;
  chapterId: string | null;
  category?: TaxonomyNode | null;
  subject?: TaxonomyNode | null;
  chapter?: TaxonomyNode | null;
  createdAt: string;
}

export interface Video {
  id: string;
  title: string;
  status: ContentStatus;
  storageKey: string;
  durationSec: number | null;
  processingStatus: 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';
  processingError?: string | null;
  categoryId: string | null;
  subjectId: string | null;
  chapterId: string | null;
  category?: TaxonomyNode | null;
  subject?: TaxonomyNode | null;
  chapter?: TaxonomyNode | null;
  createdAt: string;
}

export interface Permission {
  id: string;
  userId: string;
  target: PermissionTarget;
  targetId: string;
  granted: boolean;
  expiresAt: string | null;
  createdAt: string;
  user: { id: string; name: string; phone: string };
}

export interface Banner {
  id: string;
  title: string;
  body: string | null;
  imageKey: string | null;
  active: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: string;
}

export interface CreateContentResponse {
  pdf?: Pdf;
  video?: Video;
  uploadUrl: string;
  storageKey: string;
  expiresInSec: number;
}

export interface ReplaceResponse {
  uploadUrl: string;
  storageKey: string;
  expiresInSec: number;
}

// ------------------------------------------------------- stage 6 analytics --

export type AnalyticsMetric = 'opens' | 'plays' | 'watch_time' | 'logins' | 'signups';

export interface AnalyticsOverview {
  totalUsers: number;
  activeUsers30d: number;
  totalPdfs: number;
  totalVideos: number;
  opensToday: number;
  playsToday: number;
  watchTimeTodaySec: number;
  deniedToday: number;
  unseenAlerts: number;
}

export interface TimeseriesPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

export interface ContentStats {
  id: string;
  title: string;
  opens: number;
  uniqueUsers: number;
  totalWatchTimeSec: number;
  lastOpenedAt: string | null;
}

export interface UserActivityEvent {
  contentType: string;
  contentId: string;
  event: string;
  createdAt: string;
}

export interface UserActivity {
  user: { id: string; name: string; phone: string; email: string | null };
  pdfsOpened: number;
  videosPlayed: number;
  totalWatchTimeSec: number;
  lastActiveAt: string | null;
  recentEvents: UserActivityEvent[];
}

// -------------------------------------------------------- stage 6 security --

export interface AlertUser {
  id: string;
  name: string;
  phone: string;
  email: string | null;
}

export interface SecurityAlert {
  id: string;
  type: string;
  userId: string | null;
  detail: string;
  seen: boolean;
  createdAt: string;
  user: AlertUser | null;
}

export interface LoginAttempt {
  id: string;
  identifier: string;
  success: boolean;
  ip: string | null;
  deviceFingerprint: string | null;
  userId: string | null;
  createdAt: string;
  user: AlertUser | null;
}

export interface DeniedAttempt {
  id: string;
  contentType: string;
  contentId: string;
  meta: Record<string, unknown> | null;
  createdAt: string;
  user: AlertUser | null;
}
