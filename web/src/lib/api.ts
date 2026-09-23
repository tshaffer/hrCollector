import type { Segment, SessionDetail, SessionSummary, Settings } from "../types";

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

export function fetchSessions(): Promise<SessionSummary[]> {
  return request<SessionSummary[]>("/api/sessions?summary=1");
}

export function fetchSession(id: string): Promise<SessionDetail> {
  return request<SessionDetail>(`/api/sessions/${id}`);
}

export function fetchSettings(): Promise<Settings> {
  return request<Settings>("/api/settings");
}

export function updateSettings(settings: Settings): Promise<Settings> {
  return request<Settings>("/api/settings", {
    method: "PUT",
    body: JSON.stringify(settings)
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
