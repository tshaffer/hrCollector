import { Schema, model, type InferSchemaType } from "mongoose";

const heartRateSampleSchema = new Schema(
  {
    timestamp: { type: Date, required: true },
    bpm: { type: Number, required: true }
  },
  { _id: false }
);

const sessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    // HealthKit's HKWorkout UUID for a Watch-recorded session, or a hash
    // of the file contents for a .fit upload — either way, the
    // idempotency key that keeps a re-sync/re-upload from duplicating it.
    workoutId: { type: String, required: true, unique: true, index: true },
    activityType: { type: String, required: true },
    // Where this session's samples came from — the Watch via the iOS app
    // ("healthkit"), or a manually uploaded .fit file ("fit").
    dataSource: { type: String, enum: ["healthkit", "fit"], default: "healthkit" },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    heartRateSamples: { type: [heartRateSampleSchema], default: [] },
    // The heart rate ceiling in effect when this session was first
    // uploaded. Snapshotted (not recomputed from current settings) so a
    // later change to that user's threshold doesn't retroactively change
    // what "time above threshold" meant for past sessions.
    thresholdBpm: { type: Number, required: true }
  },
  { timestamps: true }
);

sessionSchema.index({ userId: 1, startDate: -1 });

export type SessionDocument = InferSchemaType<typeof sessionSchema>;
export const SessionModel = model("Session", sessionSchema);
