/**
 * Backend API client.
 *
 * Auth model: the access token lives ONLY in memory (module variable). The
 * refresh token is persisted in localStorage so an admin stays signed in
 * across reloads. On 401 the client calls POST /auth/refresh once and retries
 * the original request; if that fails it clears auth and redirects to /login.
 */
import type { TokenPair } from './types';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') || 'http://localhost:3000';

const REFRESH_KEY = 'sl_admin_refresh_token';

let accessToken: string | null = null;
let refreshPromise: Promise<void> | null = null;

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(REFRESH_KEY);
}

export function setTokens(pair: TokenPair) {
  accessToken = pair.accessToken;
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(REFRESH_KEY, pair.refreshToken);
  }
}

export function clearAuth() {
  accessToken = null;
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(REFRESH_KEY);
  }
}

export function isAuthed(): boolean {
  return accessToken !== null || getRefreshToken() !== null;
}

function redirectToLogin() {
  if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
}

async function doRefresh(): Promise<void> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) throw new ApiError(401, 'Not signed in');
  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) throw new ApiError(res.status, 'Session expired');
  const pair = (await res.json()) as TokenPair;
  setTokens(pair);
}

async function request<T>(path: string, init: RequestInit, retried: boolean): Promise<T> {
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
  };
  const isFormData = init.body instanceof FormData;
  if (!isFormData && init.body !== undefined && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  const res = await fetch(`${API_URL}${path}`, { ...init, headers });

  if (res.status === 401 && !retried && getRefreshToken()) {
    try {
      // De-dupe concurrent refreshes.
      if (!refreshPromise) {
        refreshPromise = doRefresh().finally(() => {
          refreshPromise = null;
        });
      }
      await refreshPromise;
      return request<T>(path, init, true);
    } catch {
      clearAuth();
      redirectToLogin();
      throw new ApiError(401, 'Session expired. Please sign in again.');
    }
  }

  if (res.status === 401) {
    clearAuth();
    redirectToLogin();
    throw new ApiError(401, 'Session expired. Please sign in again.');
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      const m = (body as { message?: string | string[] }).message;
      if (Array.isArray(m)) message = m.join(', ');
      else if (typeof m === 'string') message = m;
    } catch {
      /* keep default */
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  return request<T>(path, init, false);
}

export const get = <T>(path: string) => api<T>(path);
export const post = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
export const patch = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
export const put = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: 'PUT', body: JSON.stringify(body) });
export const del = <T>(path: string) => api<T>(path, { method: 'DELETE' });

/** Backend admin login: POST /auth/admin/login -> TokenPair. */
export async function adminLogin(email: string, password: string): Promise<void> {
  const pair = await post<TokenPair>('/auth/admin/login', { email, password });
  setTokens(pair);
}

export async function logout(): Promise<void> {
  const refreshToken = getRefreshToken();
  try {
    if (refreshToken) {
      await post('/auth/logout', { refreshToken });
    }
  } catch {
    /* ignore logout errors */
  }
  clearAuth();
  redirectToLogin();
}

/**
 * Upload a file to a presigned PUT URL with progress callbacks.
 * Uses XMLHttpRequest because fetch has no upload-progress events.
 */
export function uploadWithProgress(
  url: string,
  file: File,
  contentType: string,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Upload failed (network error)'));
    xhr.send(file);
  });
}
