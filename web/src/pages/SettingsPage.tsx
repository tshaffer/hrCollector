import { useEffect, useState } from "react";
import { fetchSettings, updateSettings } from "../lib/api";
import { useUsers } from "../lib/userContext";

export default function SettingsPage() {
  const { users, selectedUserId, loading: usersLoading, error: usersError } = useUsers();
  const [thresholdBpm, setThresholdBpm] = useState<string>("");
  const [minSegmentDurationSeconds, setMinSegmentDurationSeconds] = useState<string>("");
  const [mergeGapSeconds, setMergeGapSeconds] = useState<string>("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const currentUserName = users.find((u) => u.id === selectedUserId)?.name;

  useEffect(() => {
    if (!selectedUserId) return;
    setLoading(true);
    setStatus(null);
    fetchSettings(selectedUserId)
      .then((settings) => {
        setThresholdBpm(String(settings.thresholdBpm));
        setMinSegmentDurationSeconds(String(settings.minSegmentDurationSeconds));
        setMergeGapSeconds(String(settings.mergeGapSeconds));
      })
      .catch((err) => setStatus(`Couldn't load settings: ${err.message}`))
      .finally(() => setLoading(false));
  }, [selectedUserId]);

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedUserId) return;

    const threshold = Number(thresholdBpm);
    const minDuration = Number(minSegmentDurationSeconds);
    const gap = Number(mergeGapSeconds);

    if (!Number.isFinite(threshold) || threshold <= 0) {
      setStatus("Heart rate limit must be a positive number.");
      return;
    }
    if (!Number.isFinite(minDuration) || minDuration <= 0) {
      setStatus("Minimum sustained duration must be a positive number.");
      return;
    }
    if (!Number.isFinite(gap) || gap < 0) {
      setStatus("Gap tolerance must be zero or a positive number.");
      return;
    }

    try {
      const saved = await updateSettings(selectedUserId, {
        thresholdBpm: threshold,
        minSegmentDurationSeconds: minDuration,
        mergeGapSeconds: gap
      });
      setThresholdBpm(String(saved.thresholdBpm));
      setMinSegmentDurationSeconds(String(saved.minSegmentDurationSeconds));
      setMergeGapSeconds(String(saved.mergeGapSeconds));
      setStatus(
        "Saved. The heart rate limit only applies to new sessions — past sessions keep the limit that was active when recorded. The segment settings below apply immediately to every session's auto-detected segments."
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to save.");
    }
  }

  if (usersError) return <p className="empty-state">Couldn't load users: {usersError}</p>;
  if (usersLoading || !selectedUserId || loading) return <p className="empty-state">Loading…</p>;

  return (
    <form className="settings-form" onSubmit={handleSave}>
      {currentUserName && <p className="field-hint">Settings for {currentUserName}.</p>}

      <label htmlFor="threshold">Heart rate limit (bpm)</label>
      <input
        id="threshold"
        type="number"
        min={1}
        value={thresholdBpm}
        onChange={(e) => setThresholdBpm(e.target.value)}
      />

      <label htmlFor="minSegmentDuration">
        Minimum sustained duration for an auto-detected segment (seconds)
      </label>
      <input
        id="minSegmentDuration"
        type="number"
        min={1}
        value={minSegmentDurationSeconds}
        onChange={(e) => setMinSegmentDurationSeconds(e.target.value)}
      />
      <p className="field-hint">
        Heart rate has to stay above the limit for at least this long before it's called out as a segment.
      </p>

      <label htmlFor="mergeGap">Gap tolerance (seconds)</label>
      <input
        id="mergeGap"
        type="number"
        min={0}
        value={mergeGapSeconds}
        onChange={(e) => setMergeGapSeconds(e.target.value)}
      />
      <p className="field-hint">
        A brief dip below the limit shorter than this doesn't end a sustained segment.
      </p>

      <button type="submit">Save</button>
      {status && <p className="status-text">{status}</p>}
    </form>
  );
}
