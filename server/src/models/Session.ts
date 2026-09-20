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
    // HealthKit's HKWorkout UUID — the idempotency key for uploads.
    workoutId: { type: String, required: true, unique: true, index: true },
    activityType: { type: String, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    heartRateSamples: { type: [heartRateSampleSchema], default: [] }
  },
  { timestamps: true }
);

export type SessionDocument = InferSchemaType<typeof sessionSchema>;
export const SessionModel = model("Session", sessionSchema);
