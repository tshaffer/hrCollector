export interface HeartRateSampleInput {
  timestamp: Date | string;
  bpm: number;
}

export interface SessionStats {
  maxBpm: number | null;
  /** Time-weighted average — accounts for uneven gaps between samples
   * rather than a naive arithmetic mean of the raw values. */
  avgBpm: number | null;
  secondsAboveThreshold: number;
  percentAboveThreshold: number | null;
  durationSeconds: number;
}

/**
 * Computes session-level heart rate stats, weighting each sample by how
 * long it was "in effect" (the time until the next sample arrives, or
 * until the session ends for the last one) rather than just counting
 * samples. HealthKit doesn't sample at perfectly even intervals — a naive
 * "samples above threshold / total samples" ratio would misrepresent
 * actual time whenever gaps are uneven.
 *
 * The brief gap between `startDate` and the first sample's timestamp (if
 * any) is not attributed to any known bpm value and is excluded from the
 * time-above-threshold calculation — in practice this is a second or two.
 */
export function computeSessionStats(
  samples: HeartRateSampleInput[],
  thresholdBpm: number,
  startDate: Date | string,
  endDate: Date | string
): SessionStats {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const durationSeconds = Math.max(0, (end - start) / 1000);

  if (samples.length === 0) {
    return { maxBpm: null, avgBpm: null, secondsAboveThreshold: 0, percentAboveThreshold: null, durationSeconds };
  }

  const sorted = [...samples]
    .map((s) => ({ timeMs: new Date(s.timestamp).getTime(), bpm: s.bpm }))
    .sort((a, b) => a.timeMs - b.timeMs);

  let maxBpm = -Infinity;
  let weightedSum = 0;
  let weightedSeconds = 0;
  let secondsAboveThreshold = 0;

  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];
    maxBpm = Math.max(maxBpm, current.bpm);

    const nextTimeMs = i + 1 < sorted.length ? sorted[i + 1].timeMs : end;
    const intervalSeconds = Math.max(0, (nextTimeMs - current.timeMs) / 1000);

    weightedSum += current.bpm * intervalSeconds;
    weightedSeconds += intervalSeconds;
    if (current.bpm > thresholdBpm) {
      secondsAboveThreshold += intervalSeconds;
    }
  }

  const avgBpm = weightedSeconds > 0 ? weightedSum / weightedSeconds : sorted[0].bpm;
  const percentAboveThreshold = durationSeconds > 0 ? (secondsAboveThreshold / durationSeconds) * 100 : 0;

  return { maxBpm, avgBpm, secondsAboveThreshold, percentAboveThreshold, durationSeconds };
}
