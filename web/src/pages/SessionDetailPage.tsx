import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import HeartRateChart from "../components/HeartRateChart";
import { fetchSession } from "../lib/api";
import { formatBpm, formatDuration, formatPercent, formatSessionTitle } from "../lib/format";
import type { SessionDetail } from "../types";

export default function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetchSession(id)
      .then(setSession)
      .catch((err) => setError(err.message));
  }, [id]);

  if (error) return <p className="empty-state">Couldn't load this session: {error}</p>;
  if (!session) return <p className="empty-state">Loading…</p>;

  const { stats } = session;

  return (
    <div>
      <Link to="/" className="back-link">
        ← All sessions
      </Link>
      <h2>{formatSessionTitle(session.startDate, session.endDate)}</h2>

      <div className="stat-grid">
        <div className="stat-tile">
          <div className="stat-tile-label">Duration</div>
          <div className="stat-tile-value">{formatDuration(stats.durationSeconds)}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-label">Max heart rate</div>
          <div className="stat-tile-value">{formatBpm(stats.maxBpm)}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-label">Average heart rate</div>
          <div className="stat-tile-value">{formatBpm(stats.avgBpm)}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-label">Time over {session.thresholdBpm} bpm</div>
          <div className="stat-tile-value">{formatDuration(stats.secondsAboveThreshold)}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-label">% of session over limit</div>
          <div className="stat-tile-value">{formatPercent(stats.percentAboveThreshold)}</div>
        </div>
      </div>

      <HeartRateChart samples={session.heartRateSamples} thresholdBpm={session.thresholdBpm} />
    </div>
  );
}
