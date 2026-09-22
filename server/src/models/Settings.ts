import { Schema, model } from "mongoose";

// Singleton document — there's only ever one settings doc, keyed by a
// fixed id so upserts always target the same row.
const SETTINGS_ID = "global";

const settingsSchema = new Schema(
  {
    _id: { type: String, default: SETTINGS_ID },
    thresholdBpm: { type: Number, required: true, default: 100 }
  },
  { timestamps: true }
);

export const SettingsModel = model("Settings", settingsSchema);

/** Fetches the current settings, creating the default doc on first use. */
export async function getSettings() {
  const doc = await SettingsModel.findOneAndUpdate(
    { _id: SETTINGS_ID },
    { $setOnInsert: { _id: SETTINGS_ID, thresholdBpm: 100 } },
    { upsert: true, new: true }
  );
  return doc;
}
