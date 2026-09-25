import { Router } from "express";
import { getSettings, SettingsModel } from "../models/Settings.js";
import { regenerateAutoSegmentsForUser } from "../segmentsService.js";

export const settingsRouter = Router();

settingsRouter.get("/", async (req, res) => {
  const { userId } = req.query;
  if (!userId || typeof userId !== "string") {
    return res.status(400).json({ error: "Expected a ?userId= query parameter." });
  }

  try {
    const settings = await getSettings(userId);
    res.json(settings);
  } catch (error) {
    console.error("[GET /api/settings] failed:", error);
    res.status(500).json({ error: "Failed to fetch settings." });
  }
});

settingsRouter.put("/", async (req, res) => {
  const { userId, thresholdBpm, minSegmentDurationSeconds, mergeGapSeconds } = req.body ?? {};

  if (!userId || typeof userId !== "string") {
    return res.status(400).json({ error: "Expected userId in the request body." });
  }
  if (typeof thresholdBpm !== "number" || !Number.isFinite(thresholdBpm) || thresholdBpm <= 0) {
    return res.status(400).json({ error: "thresholdBpm must be a positive number." });
  }
  if (
    typeof minSegmentDurationSeconds !== "number" ||
    !Number.isFinite(minSegmentDurationSeconds) ||
    minSegmentDurationSeconds <= 0
  ) {
    return res.status(400).json({ error: "minSegmentDurationSeconds must be a positive number." });
  }
  if (typeof mergeGapSeconds !== "number" || !Number.isFinite(mergeGapSeconds) || mergeGapSeconds < 0) {
    return res.status(400).json({ error: "mergeGapSeconds must be zero or a positive number." });
  }

  try {
    const doc = await SettingsModel.findOneAndUpdate(
      { userId },
      { thresholdBpm, minSegmentDurationSeconds, mergeGapSeconds },
      { upsert: true, new: true }
    );
    // These two settings aren't snapshotted per-session like thresholdBpm
    // is, so a change here is meant to apply retroactively — re-run
    // detection for this user's sessions immediately rather than waiting
    // for the next server restart or sync. Scoped to this user only, so
    // changing one person's settings never touches another's segments.
    await regenerateAutoSegmentsForUser(userId, minSegmentDurationSeconds, mergeGapSeconds);
    res.json(doc);
  } catch (error) {
    console.error("[PUT /api/settings] failed:", error);
    res.status(500).json({ error: "Failed to update settings." });
  }
});
