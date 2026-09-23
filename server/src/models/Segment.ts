import { Schema, model, type InferSchemaType } from "mongoose";

// A "segment" is a labeled span of time within a session — either drawn
// by hand on the chart ("manual") or found automatically because heart
// rate stayed above the session's threshold for a sustained stretch
// ("auto"). `edited` marks an auto segment the user has since relabeled
// (or a manual one, always true) so a later re-sync or settings change
// never silently overwrites a label someone actually typed.
const segmentSchema = new Schema(
  {
    sessionId: { type: Schema.Types.ObjectId, ref: "Session", required: true, index: true },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    source: { type: String, enum: ["auto", "manual"], required: true },
    label: { type: String, default: "" },
    edited: { type: Boolean, default: false }
  },
  { timestamps: true }
);

segmentSchema.index({ sessionId: 1, startTime: 1 });

export type SegmentDocument = InferSchemaType<typeof segmentSchema>;
export const SegmentModel = model("Segment", segmentSchema);
