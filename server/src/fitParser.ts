import FitParser from "fit-file-parser";

export interface ParsedFitSample {
  timestamp: Date;
  bpm: number;
}

export interface ParsedFitSession {
  startDate: Date;
  endDate: Date;
  heartRateSamples: ParsedFitSample[];
  /** The FIT file's own sport/activity label, when it has one (e.g.
   * "running", "cycling"). Falls back to "fit-import" when the file
   * doesn't carry a recognizable session/sport field. */
  activityType: string;
}

/**
 * Parses a .fit file's record messages into the same
 * { timestamp, bpm } shape HealthKit sessions use, so a FIT-imported
 * session can flow through the exact same stats/segment-detection code
 * as a Watch-recorded one.
 */
export async function parseFitFile(buffer: Buffer): Promise<ParsedFitSession> {
  const parser = new FitParser({
    force: true,
    mode: "list",
    elapsedRecordField: true
  });

  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  const data = await parser.parseAsync(arrayBuffer);

  const records = data.records ?? [];
  const heartRateSamples: ParsedFitSample[] = records
    .filter(
      (record): record is { timestamp: Date; heart_rate: number } =>
        record.timestamp instanceof Date && typeof record.heart_rate === "number"
    )
    .map((record) => ({ timestamp: record.timestamp, bpm: record.heart_rate }))
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  if (heartRateSamples.length === 0) {
    throw new Error("No heart rate samples found in this .fit file.");
  }

  const sessionSport = data.sessions?.[0]?.sport;
  const activityType = typeof sessionSport === "string" ? sessionSport : "fit-import";

  return {
    startDate: heartRateSamples[0].timestamp,
    endDate: heartRateSamples[heartRateSamples.length - 1].timestamp,
    heartRateSamples,
    activityType
  };
}
