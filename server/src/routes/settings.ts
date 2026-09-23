import { Router } from "express";
import { getSettings, SettingsModel } from "../models/Settings.js";
import { regenerateAllAutoSegments } from "../segmentsService.js";

export const settingsRouter = Router();

settingsRouter.get("/", async (_req, res) => {
  try {
    const settings = await getSettings();
    res.json(settings);
  } catch (error) {
    console.error("[GET /api/settings] failed:", error);
    res.status(500).json({ error: "Failed to fetch settings." });
  }
});

settingsRouter.put("/", async (req, res) => {
  const { thresholdBpm, minSegmentDurationSeconds, mergeGapSeconds } = req.body ?? {};

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
      { _id: "global" },
      { thresholdBpm, minSegmentDurationSeconds, mergeGapSeconds },
      { upsert: true, new: true }
    );
    // These two settings aren't snapshotted per-session like thresholdBpm
    // is, so a change here is meant to apply retroactively — re-run
    // detection everywhere immediately rather than waiting for the next
    // server restart or sync.
    await regenerateAllAutoSegments(minSegmentDurationSeconds, mergeGapSeconds);
    res.json(doc);
  } catch (error) {
    console.error("[PUT /api/settings] failed:", error);
    res.status(500).json({ error: "Failed to update settings." });
  }
});
