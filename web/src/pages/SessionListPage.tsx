import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { fetchSessions, uploadFitFile } from "../lib/api";
import { formatBpm, formatDuration, formatSessionTitle } from "../lib/format";
import { useUsers } from "../lib/userContext";
import type { SessionSummary } from "../types";

export default function SessionListPage() {
  const { selectedUserId, loading: usersLoading, error: usersError } = useUsers();
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!selectedUserId) return;
    setSessions(null);
    setError(null);
    fetchSessions(selectedUserId)
      .then(setSessions)
      .catch((err) => setError(err.message));
  }, [selectedUserId]);

  async function handleFileChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !selectedUserId) return;

    setUploading(true);
    setUploadError(null);
    try {
      await uploadFitFile(file, selectedUserId);
      setSessions(await fetchSessions(selectedUserId));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Failed to upload .fit file.");
    } finally {
      setUploading(false);
    }
  }

  if (usersError) {
    return <p className="empty-state">Couldn't load users: {usersError}</p>;
  }

  if (usersLoading || !selectedUserId) {
    return <p className="empty-state">Loading…</p>;
  }

  return (
    <div>
      <div className="upload-bar">
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          {uploading ? "Uploading…" : "Upload .fit file"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".fit"
          onChange={(e) => void handleFileChosen(e)}
          style={{ display: "none" }}
        />
        {uploadError && <span className="status-text status-error">{uploadError}</span>}
      </div>

      {error && <p className="empty-state">Couldn't load sessions: {error}</p>}

      {!error && sessions === null && <p className="empty-state">Loading…</p>}

      {!error && sessions !== null && sessions.length === 0 && (
        <p className="empty-state">
          No sessions yet. They'll show up here once a Cooldown or Other session syncs from the phone, or you upload
          a .fit file.
        </p>
      )}

      {!error &&
        sessions !== null &&
        sessions.map((session) => {
          const exceeded = (session.stats.maxBpm ?? 0) > session.thresholdBpm;
          const durationSeconds = session.stats.durationSeconds;
          return (
            <Link key={session.id} to={`/sessions/${session.id}`} className="session-card">
              <div className="session-card-top">
                <span className="session-card-title">{formatSessionTitle(session.startDate, session.endDate)}</span>
                <span className="session-card-duration">{formatDuration(durationSeconds)}</span>
              </div>
              <div className="session-card-stats">
                <span>Max {formatBpm(session.stats.maxBpm)}</span>
                <span>Min {formatBpm(session.stats.minBpm)}</span>
                <span>Avg {formatBpm(session.stats.avgBpm)}</span>
                {session.dataSource === "fit" && <span className="badge badge-source">.fit</span>}
                <span className={`badge ${exceeded ? "badge-alert" : "badge-safe"}`}>
                  {exceeded ? `Over ${session.thresholdBpm}` : `Under ${session.thresholdBpm}`}
                </span>
              </div>
            </Link>
          );
        })}
    </div>
  );
}
