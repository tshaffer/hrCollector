import { Schema, model } from "mongoose";

// Singleton document — there's only ever one settings doc, keyed by a
// fixed id so upserts always target the same row.
const SETTINGS_ID = "global";

const DEFAULTS = {
  thresholdBpm: 100,
  // How long heart rate must stay above the session's threshold before an
  // auto-generated segment is created for it. See segmentDetection.ts for
  // the reasoning behind this default.
  minSegmentDurationSeconds: 120,
  // Brief dips below threshold inside an otherwise-sustained episode
  // don't end the episode as long as the dip is no longer than this.
  mergeGapSeconds: 15
};

const settingsSchema = new Schema(
  {
    _id: { type: String, default: SETTINGS_ID },
    thresholdBpm: { type: Number, required: true, default: DEFAULTS.thresholdBpm },
    minSegmentDurationSeconds: { type: Number, required: true, default: DEFAULTS.minSegmentDurationSeconds },
    mergeGapSeconds: { type: Number, required: true, default: DEFAULTS.mergeGapSeconds }
  },
  { timestamps: true }
);

export const SettingsModel = model("Settings", settingsSchema);

/**
 * Fetches the current settings, creating the default doc on first use.
 *
 * Also self-heals: if a field was added to this schema after the settings
 * doc already existed, $setOnInsert never runs for it (it only fires on
 * insert, not on the update half of an upsert), so it patches in the
 * default for any field it finds missing. This is the same bug class that
 * bit thresholdBpm on old sessions — fixed here once so it can't recur
 * for future settings fields either.
 */
export async function getSettings() {
  const doc = await SettingsModel.findOneAndUpdate(
    { _id: SETTINGS_ID },
    { $setOnInsert: { _id: SETTINGS_ID, ...DEFAULTS } },
    { upsert: true, new: true }
  );

  const patch: Record<string, number> = {};
  if (doc.minSegmentDurationSeconds === undefined || doc.minSegmentDurationSeconds === null) {
    patch.minSegmentDurationSeconds = DEFAULTS.minSegmentDurationSeconds;
  }
  if (doc.mergeGapSeconds === undefined || doc.mergeGapSeconds === null) {
    patch.mergeGapSeconds = DEFAULTS.mergeGapSeconds;
  }
  if (Object.keys(patch).length > 0) {
    await SettingsModel.updateOne({ _id: SETTINGS_ID }, { $set: patch });
    Object.assign(doc, patch);
  }

  return doc;
}
