import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import HeartRateChart from "../components/HeartRateChart";
import { deleteSegment, fetchSession, fetchSessions, updateSegmentLabel } from "../lib/api";
import { formatBpm, formatDuration, formatPercent, formatSessionTitle } from "../lib/format";
import { useUsers } from "../lib/userContext";
import type { Segment, SessionDetail, SessionSummary } from "../types";

function SegmentRow({
  segment,
  isNested,
  onChange,
  onDelete,
  onHover
}: {
  segment: Segment;
  isNested: boolean;
  onChange: (segment: Segment) => void;
  onDelete: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  const [label, setLabel] = useState(segment.label);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const dirty = label !== segment.label;

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await updateSegmentLabel(segment.id, label);
      onChange(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update label.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this segment?")) return;
    setDeleting(true);
    try {
      await deleteSegment(segment.id);
      onDelete(segment.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete segment.");
      setDeleting(false);
    }
  }

  const start = new Date(segment.startTime);
  const end = new Date(segment.endTime);
  const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" });

  return (
    <tr
      className={isNested ? "segment-row segment-row-nested" : "segment-row"}
      onMouseEnter={() => onHover(segment.id)}
      onMouseLeave={() => onHover(null)}
    >
      <td>
        {isNested && <span className="segment-nest-indicator" title="Falls entirely within another segment below/above">↳</span>}
        {timeFormatter.format(start)}–{timeFormatter.format(end)}
        <span className="segment-source"> · {segment.source === "auto" ? "auto-detected" : "manual"}</span>
      </td>
      <td>{formatDuration(segment.stats.durationSeconds)}</td>
      <td>{formatBpm(segment.stats.maxBpm)}</td>
      <td>{formatBpm(segment.stats.avgBpm)}</td>
      <td>
        <input
          type="text"
          value={label}
          placeholder="Unlabeled"
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && dirty) void handleSave();
          }}
        />
      </td>
      <td className="segment-actions">
        {dirty && (
          <button type="button" onClick={() => void handleSave()} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        )}
        <button type="button" className="segment-delete" onClick={() => void handleDelete()} disabled={deleting}>
          {deleting ? "Deleting…" : "Delete"}
        </button>
      </td>
    </tr>
  );
}

export default function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { selectedUserId } = useUsers();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hoveredSegmentId, setHoveredSegmentId] = useState<string | null>(null);
  // The current user's full session list, most-recent-first (same order
  // the list page shows), just to figure out this session's neighbors
  // for Previous/Next. Fetched once per selected user — it doesn't
  // change as you step between sessions.
  const [sessionList, setSessionList] = useState<SessionSummary[] | null>(null);

  useEffect(() => {
    if (!id) return;
    fetchSession(id)
      .then(setSession)
      .catch((err) => setError(err.message));
  }, [id]);

  useEffect(() => {
    if (!selectedUserId) return;
    fetchSessions(selectedUserId)
      .then(setSessionList)
      .catch(() => setSessionList(null));
  }, [selectedUserId]);

  if (error) return <p className="empty-state">Couldn't load this session: {error}</p>;
  if (!session) return <p className="empty-state">Loading…</p>;

  const { stats } = session;

  function handleSegmentCreated(segment: Segment) {
    setSession((current) => (current ? { ...current, segments: [...current.segments, segment] } : current));
  }

  function handleSegmentChanged(updated: Segment) {
    setSession((current) =>
      current
        ? { ...current, segments: current.segments.map((s) => (s.id === updated.id ? updated : s)) }
        : current
    );
  }

  function handleSegmentDeleted(id: string) {
    setSession((current) => (current ? { ...current, segments: current.segments.filter((s) => s.id !== id) } : current));
  }

  const sortedSegments = [...session.segments].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );

  // A segment is "nested" when another segment's time range fully
  // contains it (and is strictly longer, so two segments with the exact
  // same range don't mark each other as nested). This is expected — a
  // manual segment and an auto-detected one are tracked independently
  // and can legitimately overlap — but it reads as confusing in a flat
  // table, so nested rows get a visual indent instead.
  function isNestedSegment(segment: Segment): boolean {
    const start = new Date(segment.startTime).getTime();
    const end = new Date(segment.endTime).getTime();
    const span = end - start;
    return session!.segments.some((other) => {
      if (other.id === segment.id) return false;
      const otherStart = new Date(other.startTime).getTime();
      const otherEnd = new Date(other.endTime).getTime();
      return otherStart <= start && otherEnd >= end && otherEnd - otherStart > span;
    });
  }

  // sessionList is most-recent-first (same order as the list page), so the
  // previous entry (index - 1) is the newer neighbor and the next entry
  // (index + 1) is the older one.
  const currentIndex = sessionList?.findIndex((s) => s.id === session.id) ?? -1;
  const previousSession = sessionList && currentIndex > 0 ? sessionList[currentIndex - 1] : null;
  const nextSession =
    sessionList && currentIndex >= 0 && currentIndex < sessionList.length - 1 ? sessionList[currentIndex + 1] : null;

  return (
    <div>
      <div className="session-toolbar">
        <Link to="/" className="back-link">
          ← All sessions
        </Link>
        <div className="session-nav-group">
          {previousSession ? (
            <Link to={`/sessions/${previousSession.id}`} className="session-nav-link">
              ← Previous session
            </Link>
          ) : (
            <span className="session-nav-link session-nav-link-disabled">← Previous session</span>
          )}
          {nextSession ? (
            <Link to={`/sessions/${nextSession.id}`} className="session-nav-link">
              Next session →
            </Link>
          ) : (
            <span className="session-nav-link session-nav-link-disabled">Next session →</span>
          )}
        </div>
      </div>
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

      <HeartRateChart
        sessionId={session.id}
        samples={session.heartRateSamples}
        thresholdBpm={session.thresholdBpm}
        segments={session.segments}
        onSegmentCreated={handleSegmentCreated}
        highlightedSegmentId={hoveredSegmentId}
      />
      <p className="field-hint">Press and drag across the chart to mark a segment and give it a label.</p>

      {sortedSegments.length > 0 && (
        <div className="segments-panel">
          <h3>Segments</h3>
          <table className="segments-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Duration</th>
                <th>Max</th>
                <th>Avg</th>
                <th>Label</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sortedSegments.map((segment) => (
                <SegmentRow
                  key={segment.id}
                  segment={segment}
                  isNested={isNestedSegment(segment)}
                  onChange={handleSegmentChanged}
                  onDelete={handleSegmentDeleted}
                  onHover={setHoveredSegmentId}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
