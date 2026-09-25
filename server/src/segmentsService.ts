import { getSettings } from "./models/Settings.js";
import { SegmentModel } from "./models/Segment.js";
import { SessionModel, type SessionDocument } from "./models/Session.js";
import { detectAutoSegments } from "./segmentDetection.js";
import { computeSessionStats, type HeartRateSampleInput } from "./stats.js";

export type SessionDoc = SessionDocument & { _id: unknown };

function sliceSamples(samples: HeartRateSampleInput[], start: Date, end: Date) {
  const startMs = start.getTime();
  const endMs = end.getTime();
  return samples.filter((s) => {
    const t = new Date(s.timestamp).getTime();
    return t >= startMs && t <= endMs;
  });
}

/**
 * Re-runs auto-detection for one session and replaces its auto segments —
 * but only the ones the user hasn't touched. An auto segment the user has
 * relabeled (edited: true) survives a resync or a settings change; manual
 * segments are never touched here at all.
 */
export async function regenerateAutoSegments(
  session: SessionDoc,
  minSegmentDurationSeconds: number,
  mergeGapSeconds: number
) {
  const detected = detectAutoSegments(
    session.heartRateSamples ?? [],
    session.thresholdBpm,
    minSegmentDurationSeconds,
    mergeGapSeconds,
    session.startDate,
    session.endDate
  );

  await SegmentModel.deleteMany({ sessionId: session._id, source: "auto", edited: false });

  if (detected.length > 0) {
    await SegmentModel.insertMany(
      detected.map((seg) => ({
        sessionId: session._id,
        startTime: seg.startTime,
        endTime: seg.endTime,
        source: "auto",
        label: "",
        edited: false
      }))
    );
  }
}

/** Re-runs auto-detection for every session belonging to one user, using
 * that user's own settings. Used when that user's settings change, since
 * (unlike thresholdBpm) minSegmentDurationSeconds/mergeGapSeconds aren't
 * snapshotted per session. */
export async function regenerateAutoSegmentsForUser(
  userId: string,
  minSegmentDurationSeconds: number,
  mergeGapSeconds: number
) {
  const sessions = await SessionModel.find({ userId });
  for (const session of sessions) {
    await regenerateAutoSegments(session as SessionDoc, minSegmentDurationSeconds, mergeGapSeconds);
  }
  return sessions.length;
}

/** Re-runs auto-detection across every session for every user, each with
 * its own owner's settings — used at startup, to cover sessions recorded
 * before this feature existed or while the server wasn't running to catch
 * a settings change. */
export async function regenerateAllAutoSegments() {
  const sessions = await SessionModel.find({});
  for (const session of sessions) {
    const settings = await getSettings(String(session.userId));
    await regenerateAutoSegments(session as SessionDoc, settings.minSegmentDurationSeconds, settings.mergeGapSeconds);
  }
  return sessions.length;
}

export function segmentToResponse(doc: { _id: unknown; sessionId: unknown; startTime: Date; endTime: Date; source: string; label: string; edited: boolean }, stats: ReturnType<typeof computeSessionStats>) {
  return {
    id: String(doc._id),
    sessionId: String(doc.sessionId),
    startTime: doc.startTime,
    endTime: doc.endTime,
    source: doc.source,
    label: doc.label,
    edited: doc.edited,
    stats
  };
}

/** Fetches every segment for a session with its own time-weighted stats
 * (max/avg bpm, duration, % actually above threshold within the span). */
export async function getSegmentsWithStats(session: SessionDoc) {
  const docs = await SegmentModel.find({ sessionId: session._id }).sort({ startTime: 1 });
  const samples = session.heartRateSamples ?? [];
  return docs.map((doc) => {
    const stats = computeSessionStats(
      sliceSamples(samples, doc.startTime, doc.endTime),
      session.thresholdBpm,
      doc.startTime,
      doc.endTime
    );
    return segmentToResponse(doc, stats);
  });
}

/** Computes stats for an arbitrary [startTime, endTime] span within a
 * session, for the segments API (create/update) which doesn't have the
 * parent session doc already loaded. */
export async function statsForSpan(sessionId: unknown, startTime: Date, endTime: Date) {
  const session = await SessionModel.findById(sessionId);
  if (!session) return null;
  const samples = sliceSamples((session.heartRateSamples ?? []) as HeartRateSampleInput[], startTime, endTime);
  return computeSessionStats(samples, session.thresholdBpm, startTime, endTime);
}
