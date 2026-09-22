import { Router } from "express";
import { SessionModel, type SessionDocument } from "../models/Session.js";
import { getSettings } from "../models/Settings.js";
import { computeSessionStats } from "../stats.js";

export const sessionsRouter = Router();

type SessionDoc = SessionDocument & { _id: unknown };

function toResponse(doc: SessionDoc, { includeSamples }: { includeSamples: boolean }) {
  const stats = computeSessionStats(doc.heartRateSamples ?? [], doc.thresholdBpm, doc.startDate, doc.endDate);
  return {
    id: String(doc._id),
    workoutId: doc.workoutId,
    activityType: doc.activityType,
    startDate: doc.startDate,
    endDate: doc.endDate,
    thresholdBpm: doc.thresholdBpm,
    stats,
    ...(includeSamples ? { heartRateSamples: doc.heartRateSamples } : {})
  };
}

/**
 * Upsert a session by workoutId. The iOS app calls this every time it
 * syncs, including re-syncing sessions it's already sent — this keeps
 * that idempotent instead of creating duplicates. thresholdBpm is only
 * set the first time (via $setOnInsert) so a later change to the global
 * setting never rewrites what an already-recorded session meant.
 */
sessionsRouter.post("/", async (req, res) => {
  const { workoutId, activityType, startDate, endDate, heartRateSamples } = req.body ?? {};

  if (!workoutId || !activityType || !startDate || !endDate || !Array.isArray(heartRateSamples)) {
    return res.status(400).json({
      error: "Expected { workoutId, activityType, startDate, endDate, heartRateSamples: [] }"
    });
  }

  try {
    const settings = await getSettings();
    const doc = await SessionModel.findOneAndUpdate(
      { workoutId },
      {
        $set: { workoutId, activityType, startDate, endDate, heartRateSamples },
        $setOnInsert: { thresholdBpm: settings.thresholdBpm }
      },
      { upsert: true, new: true }
    );
    res.status(200).json(toResponse(doc as SessionDoc, { includeSamples: true }));
  } catch (error) {
    console.error("[POST /api/sessions] failed:", error);
    res.status(500).json({ error: "Failed to save session." });
  }
});

/** List sessions, most recent first, with computed stats for each (for
 * list-view badges like max HR / exceeded-threshold). Add ?summary=1 to
 * omit the raw heart rate sample arrays and keep the payload light. */
sessionsRouter.get("/", async (req, res) => {
  try {
    const docs = await SessionModel.find({}).sort({ startDate: -1 }).limit(200);
    const includeSamples = !req.query.summary;
    res.json(docs.map((doc) => toResponse(doc as SessionDoc, { includeSamples })));
  } catch (error) {
    console.error("[GET /api/sessions] failed:", error);
    res.status(500).json({ error: "Failed to list sessions." });
  }
});

sessionsRouter.get("/:id", async (req, res) => {
  try {
    const doc = await SessionModel.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: "Not found" });
    res.json(toResponse(doc as SessionDoc, { includeSamples: true }));
  } catch (error) {
    console.error("[GET /api/sessions/:id] failed:", error);
    res.status(500).json({ error: "Failed to fetch session." });
  }
});
