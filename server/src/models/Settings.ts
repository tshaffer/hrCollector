import { Schema, model } from "mongoose";

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

// One settings doc per user — a meaningful heart rate threshold (and how
// forgiving segment detection should be) is personal, not global.
const settingsSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    thresholdBpm: { type: Number, required: true, default: DEFAULTS.thresholdBpm },
    minSegmentDurationSeconds: { type: Number, required: true, default: DEFAULTS.minSegmentDurationSeconds },
    mergeGapSeconds: { type: Number, required: true, default: DEFAULTS.mergeGapSeconds }
  },
  { timestamps: true }
);

export const SettingsModel = model("Settings", settingsSchema);

/**
 * Fetches (creating if needed) the settings doc for one user.
 *
 * Also self-heals: if a field was added to this schema after a user's
 * settings doc already existed, $setOnInsert never runs for it (it only
 * fires on insert, not on the update half of an upsert), so it patches in
 * the default for any field it finds missing. Same bug class that once
 * bit thresholdBpm on old sessions — fixed here so it can't recur for
 * future settings fields either.
 */
export async function getSettings(userId: string) {
  const doc = await SettingsModel.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId, ...DEFAULTS } },
    { upsert: true, new: true }
  );

  const patch: Record<string, number> = {};
  if (doc.thresholdBpm === undefined || doc.thresholdBpm === null) {
    patch.thresholdBpm = DEFAULTS.thresholdBpm;
  }
  if (doc.minSegmentDurationSeconds === undefined || doc.minSegmentDurationSeconds === null) {
    patch.minSegmentDurationSeconds = DEFAULTS.minSegmentDurationSeconds;
  }
  if (doc.mergeGapSeconds === undefined || doc.mergeGapSeconds === null) {
    patch.mergeGapSeconds = DEFAULTS.mergeGapSeconds;
  }
  if (Object.keys(patch).length > 0) {
    await SettingsModel.updateOne({ userId }, { $set: patch });
    Object.assign(doc, patch);
  }

  return doc;
}
