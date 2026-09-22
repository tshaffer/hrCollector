import { useEffect, useState } from "react";
import { fetchSettings, updateSettings } from "../lib/api";

export default function SettingsPage() {
  const [thresholdBpm, setThresholdBpm] = useState<string>("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSettings()
      .then((settings) => setThresholdBpm(String(settings.thresholdBpm)))
      .catch((err) => setStatus(`Couldn't load settings: ${err.message}`))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    const value = Number(thresholdBpm);
    if (!Number.isFinite(value) || value <= 0) {
      setStatus("Enter a positive number.");
      return;
    }
    try {
      const saved = await updateSettings(value);
      setThresholdBpm(String(saved.thresholdBpm));
      setStatus("Saved. New sessions will use this limit — past sessions keep the limit that was active when they were recorded.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to save.");
    }
  }

  if (loading) return <p className="empty-state">Loading…</p>;

  return (
    <form className="settings-form" onSubmit={handleSave}>
      <label htmlFor="threshold">Heart rate limit (bpm)</label>
      <input
        id="threshold"
        type="number"
        min={1}
        value={thresholdBpm}
        onChange={(e) => setThresholdBpm(e.target.value)}
      />
      <button type="submit">Save</button>
      {status && <p className="status-text">{status}</p>}
    </form>
  );
}
