export interface User {
  id: string;
  name: string;
}

export interface HeartRateSample {
  timestamp: string;
  bpm: number;
}

export interface SessionStats {
  maxBpm: number | null;
  minBpm: number | null;
  avgBpm: number | null;
  secondsAboveThreshold: number;
  percentAboveThreshold: number | null;
  durationSeconds: number;
}

export type SegmentSource = "auto" | "manual";

export interface Segment {
  id: string;
  sessionId: string;
  startTime: string;
  endTime: string;
  source: SegmentSource;
  label: string;
  edited: boolean;
  stats: SessionStats;
}

export type DataSource = "healthkit" | "fit";

export interface SessionSummary {
  id: string;
  userId: string;
  workoutId: string;
  activityType: string;
  dataSource: DataSource;
  startDate: string;
  endDate: string;
  thresholdBpm: number;
  stats: SessionStats;
}

export interface SessionDetail extends SessionSummary {
  heartRateSamples: HeartRateSample[];
  segments: Segment[];
}

export interface Settings {
  thresholdBpm: number;
  /** How long heart rate must stay above threshold before an auto segment
   * is created for it. */
  minSegmentDurationSeconds: number;
  /** Brief dips below threshold shorter than this don't end a sustained
   * episode. */
  mergeGapSeconds: number;
}
