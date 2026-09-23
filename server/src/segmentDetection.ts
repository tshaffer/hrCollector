import type { HeartRateSampleInput } from "./stats.js";

export interface DetectedSegment {
  startTime: Date;
  endTime: Date;
}

interface Run {
  start: number; // ms
  end: number; // ms
  above: boolean;
}

/**
 * Finds periods where heart rate was sustained above `thresholdBpm` for at
 * least `minDurationSeconds`, tolerating brief dips below threshold (up to
 * `mergeGapSeconds`) so one or two noisy low readings in the middle of an
 * otherwise-sustained episode don't shatter it into several tiny segments.
 *
 * Uses the same step-function model as computeSessionStats: each sample's
 * bpm is treated as holding constant until the next sample arrives (or
 * until the session ends, for the last sample).
 *
 * Algorithm: build the above/below run-length encoding of the step
 * function, merge consecutive above-runs across gaps no longer than
 * mergeGapSeconds, then keep only merged runs whose total span is at
 * least minDurationSeconds.
 */
export function detectAutoSegments(
  samples: HeartRateSampleInput[],
  thresholdBpm: number,
  minDurationSeconds: number,
  mergeGapSeconds: number,
  startDate: Date | string,
  endDate: Date | string
): DetectedSegment[] {
  if (samples.length === 0) return [];

  const end = new Date(endDate).getTime();
  const sorted = [...samples]
    .map((s) => ({ timeMs: new Date(s.timestamp).getTime(), bpm: s.bpm }))
    .sort((a, b) => a.timeMs - b.timeMs);

  // Step 1: run-length-encode the above/below step function.
  const runs: Run[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];
    const nextTimeMs = i + 1 < sorted.length ? sorted[i + 1].timeMs : end;
    if (nextTimeMs <= current.timeMs) continue; // zero-length interval guard
    const above = current.bpm > thresholdBpm;
    const last = runs[runs.length - 1];
    if (last && last.above === above && last.end === current.timeMs) {
      last.end = nextTimeMs;
    } else {
      runs.push({ start: current.timeMs, end: nextTimeMs, above });
    }
  }

  // Step 2: merge above-runs separated by a below-run no longer than the
  // gap tolerance.
  const mergeGapMs = Math.max(0, mergeGapSeconds) * 1000;
  const merged: { start: number; end: number }[] = [];
  for (const run of runs) {
    if (!run.above) continue;
    const last = merged[merged.length - 1];
    if (last && run.start - last.end <= mergeGapMs) {
      last.end = Math.max(last.end, run.end);
    } else {
      merged.push({ start: run.start, end: run.end });
    }
  }

  // Step 3: keep only episodes sustained for at least minDurationSeconds.
  const minDurationMs = Math.max(0, minDurationSeconds) * 1000;
  return merged
    .filter((seg) => seg.end - seg.start >= minDurationMs)
    .map((seg) => ({ startTime: new Date(seg.start), endTime: new Date(seg.end) }));
}
