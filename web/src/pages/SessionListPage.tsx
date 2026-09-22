import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchSessions } from "../lib/api";
import { formatBpm, formatDuration, formatSessionTitle } from "../lib/format";
import type { SessionSummary } from "../types";

export default function SessionListPage() {
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSessions()
      .then(setSessions)
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return <p className="empty-state">Couldn't load sessions: {error}</p>;
  }

  if (sessions === null) {
    return <p className="empty-state">Loading…</p>;
  }

  if (sessions.length === 0) {
    return <p className="empty-state">No sessions yet. They'll show up here once a Cooldown session syncs from the phone.</p>;
  }

  return (
    <div>
      {sessions.map((session) => {
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
              <span>Avg {formatBpm(session.stats.avgBpm)}</span>
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
