import { createHash } from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { parseFitFile } from "../fitParser.js";
import { SessionModel } from "../models/Session.js";
import { getSettings } from "../models/Settings.js";
import { getSegmentsWithStats, regenerateAutoSegments, type SessionDoc } from "../segmentsService.js";
import { computeSessionStats } from "../stats.js";

export const sessionsRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

export function sessionToResponse(doc: SessionDoc, { includeSamples }: { includeSamples: boolean }) {
  const stats = computeSessionStats(doc.heartRateSamples ?? [], doc.thresholdBpm, doc.startDate, doc.endDate);
  return {
    id: String(doc._id),
    userId: String(doc.userId),
    workoutId: doc.workoutId,
    activityType: doc.activityType,
    dataSource: doc.dataSource ?? "healthkit",
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
 * set the first time (via $setOnInsert) so a later change to that user's
 * threshold never rewrites what an already-recorded session meant.
 */
sessionsRouter.post("/", async (req, res) => {
  const { userId, workoutId, activityType, startDate, endDate, heartRateSamples } = req.body ?? {};

  if (!userId || !workoutId || !activityType || !startDate || !endDate || !Array.isArray(heartRateSamples)) {
    return res.status(400).json({
      error: "Expected { userId, workoutId, activityType, startDate, endDate, heartRateSamples: [] }"
    });
  }

  try {
    const settings = await getSettings(userId);
    const doc = await SessionModel.findOneAndUpdate(
      { workoutId },
      {
        $set: { userId, workoutId, activityType, startDate, endDate, heartRateSamples, dataSource: "healthkit" },
        $setOnInsert: { thresholdBpm: settings.thresholdBpm }
      },
      { upsert: true, new: true }
    );
    await regenerateAutoSegments(doc as SessionDoc, settings.minSegmentDurationSeconds, settings.mergeGapSeconds);
    const segments = await getSegmentsWithStats(doc as SessionDoc);
    res.status(200).json({ ...sessionToResponse(doc as SessionDoc, { includeSamples: true }), segments });
  } catch (error) {
    console.error("[POST /api/sessions] failed:", error);
    res.status(500).json({ error: "Failed to save session." });
  }
});

/**
 * Upload a .fit file (multipart, field name "file") and a "userId" field.
 * Parsed into the same session shape a HealthKit sync would produce, then
 * run through the same upsert/auto-segment pipeline. Keyed on a hash of
 * the file's own bytes, so re-uploading the same file is a no-op rather
 * than a duplicate.
 */
sessionsRouter.post("/fit-upload", upload.single("file"), async (req, res) => {
  const { userId } = req.body ?? {};
  if (!userId) {
    return res.status(400).json({ error: "Expected a userId field alongside the file." });
  }
  if (!req.file) {
    return res.status(400).json({ error: "Expected a .fit file under the 'file' field." });
  }

  try {
    const parsed = await parseFitFile(req.file.buffer);
    const workoutId = `fit:${createHash("sha256").update(req.file.buffer).digest("hex")}`;
    const settings = await getSettings(userId);

    const doc = await SessionModel.findOneAndUpdate(
      { workoutId },
      {
        $set: {
          userId,
          workoutId,
          activityType: parsed.activityType,
          dataSource: "fit",
          startDate: parsed.startDate,
          endDate: parsed.endDate,
          heartRateSamples: parsed.heartRateSamples
        },
        $setOnInsert: { thresholdBpm: settings.thresholdBpm }
      },
      { upsert: true, new: true }
    );
    await regenerateAutoSegments(doc as SessionDoc, settings.minSegmentDurationSeconds, settings.mergeGapSeconds);
    const segments = await getSegmentsWithStats(doc as SessionDoc);
    res.status(201).json({ ...sessionToResponse(doc as SessionDoc, { includeSamples: true }), segments });
  } catch (error) {
    console.error("[POST /api/sessions/fit-upload] failed:", error);
    const message = error instanceof Error ? error.message : "Failed to parse .fit file.";
    res.status(400).json({ error: message });
  }
});

/** List one user's sessions, most recent first, with computed stats for
 * each (for list-view badges like max HR / exceeded-threshold). Add
 * ?summary=1 to omit the raw heart rate sample arrays and keep the
 * payload light. */
sessionsRouter.get("/", async (req, res) => {
  const { userId } = req.query;
  if (!userId || typeof userId !== "string") {
    return res.status(400).json({ error: "Expected a ?userId= query parameter." });
  }

  try {
    const docs = await SessionModel.find({ userId }).sort({ startDate: -1 }).limit(200);
    const includeSamples = !req.query.summary;
    res.json(docs.map((doc) => sessionToResponse(doc as SessionDoc, { includeSamples })));
  } catch (error) {
    console.error("[GET /api/sessions] failed:", error);
    res.status(500).json({ error: "Failed to list sessions." });
  }
});

sessionsRouter.get("/:id", async (req, res) => {
  try {
    const doc = await SessionModel.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: "Not found" });
    const segments = await getSegmentsWithStats(doc as SessionDoc);
    res.json({ ...sessionToResponse(doc as SessionDoc, { includeSamples: true }), segments });
  } catch (error) {
    console.error("[GET /api/sessions/:id] failed:", error);
    res.status(500).json({ error: "Failed to fetch session." });
  }
});
