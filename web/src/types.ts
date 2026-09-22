export interface HeartRateSample {
  timestamp: string;
  bpm: number;
}

export interface SessionStats {
  maxBpm: number | null;
  avgBpm: number | null;
  secondsAboveThreshold: number;
  percentAboveThreshold: number | null;
  durationSeconds: number;
}

export interface SessionSummary {
  id: string;
  workoutId: string;
  activityType: string;
  startDate: string;
  endDate: string;
  thresholdBpm: number;
  stats: SessionStats;
}

export interface SessionDetail extends SessionSummary {
  heartRateSamples: HeartRateSample[];
}

export interface Settings {
  thresholdBpm: number;
}
