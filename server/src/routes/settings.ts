import { Router } from "express";
import { getSettings, SettingsModel } from "../models/Settings.js";

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
  const { thresholdBpm } = req.body ?? {};
  if (typeof thresholdBpm !== "number" || !Number.isFinite(thresholdBpm) || thresholdBpm <= 0) {
    return res.status(400).json({ error: "Expected { thresholdBpm: <positive number> }" });
  }

  try {
    const doc = await SettingsModel.findOneAndUpdate(
      { _id: "global" },
      { thresholdBpm },
      { upsert: true, new: true }
    );
    res.json(doc);
  } catch (error) {
    console.error("[PUT /api/settings] failed:", error);
    res.status(500).json({ error: "Failed to update settings." });
  }
});
