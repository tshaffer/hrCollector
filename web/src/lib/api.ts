import type { Segment, SessionDetail, SessionSummary, Settings, User } from "../types";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4100";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${body}`);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export function fetchUsers(): Promise<User[]> {
  return request<User[]>("/api/users");
}

export function fetchSessions(userId: string): Promise<SessionSummary[]> {
  return request<SessionSummary[]>(`/api/sessions?summary=1&userId=${encodeURIComponent(userId)}`);
}

export function fetchSession(id: string): Promise<SessionDetail> {
  return request<SessionDetail>(`/api/sessions/${id}`);
}

/** Uploads a .fit file for the given user. Uses fetch directly (not the
 * `request` helper above) because a multipart body needs the browser to
 * set its own Content-Type with the form boundary — forcing
 * "application/json" like every other call here would break the upload. */
export async function uploadFitFile(file: File, userId: string): Promise<SessionDetail> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("userId", userId);

  const response = await fetch(`${BASE_URL}/api/sessions/fit-upload`, {
    method: "POST",
    body: formData
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${body}`);
  }
  return response.json() as Promise<SessionDetail>;
}

export function fetchSettings(userId: string): Promise<Settings> {
  return request<Settings>(`/api/settings?userId=${encodeURIComponent(userId)}`);
}

export function updateSettings(userId: string, settings: Settings): Promise<Settings> {
  return request<Settings>("/api/settings", {
    method: "PUT",
    body: JSON.stringify({ userId, ...settings })
  });
}

export function createSegment(input: {
  sessionId: string;
  startTime: string;
  endTime: string;
  label?: string;
}): Promise<Segment> {
  return request<Segment>("/api/segments", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateSegmentLabel(id: string, label: string): Promise<Segment> {
  return request<Segment>(`/api/segments/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ label })
  });
}

export function deleteSegment(id: string): Promise<void> {
  return request<void>(`/api/segments/${id}`, { method: "DELETE" });
}
