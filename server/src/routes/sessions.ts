import { Router } from "express";
import { SessionModel } from "../models/Session.js";

export const sessionsRouter = Router();

/**
 * Upsert a session by workoutId. The iOS app calls this every time it
 * syncs, including re-syncing sessions it's already sent — this keeps
 * that idempotent instead of creating duplicates.
 */
sessionsRouter.post("/", async (req, res) => {
  const { workoutId, activityType, startDate, endDate, heartRateSamples } = req.body ?? {};

  if (!workoutId || !activityType || !startDate || !endDate || !Array.isArray(heartRateSamples)) {
    return res.status(400).json({
      error: "Expected { workoutId, activityType, startDate, endDate, heartRateSamples: [] }"
    });
  }

  try {
    const doc = await SessionModel.findOneAndUpdate(
      { workoutId },
      { workoutId, activityType, startDate, endDate, heartRateSamples },
      { upsert: true, new: true }
    );
    res.status(200).json(doc);
  } catch (error) {
    console.error("[POST /api/sessions] failed:", error);
    res.status(500).json({ error: "Failed to save session." });
  }
});

/** List sessions, most recent first. Heart rate arrays included; add
 * ?summary=1 to omit them for a lighter list view. */
sessionsRouter.get("/", async (req, res) => {
  try {
    const projection = req.query.summary ? { heartRateSamples: 0 } : {};
    const docs = await SessionModel.find({}, projection).sort({ startDate: -1 }).limit(200);
    res.json(docs);
  } catch (error) {
    console.error("[GET /api/sessions] failed:", error);
    res.status(500).json({ error: "Failed to list sessions." });
  }
});

sessionsRouter.get("/:id", async (req, res) => {
  try {
    const doc = await SessionModel.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: "Not found" });
    res.json(doc);
  } catch (error) {
    console.error("[GET /api/sessions/:id] failed:", error);
    res.status(500).json({ error: "Failed to fetch session." });
  }
});
