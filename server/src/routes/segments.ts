import { Router } from "express";
import { SegmentModel } from "../models/Segment.js";
import { segmentToResponse, statsForSpan } from "../segmentsService.js";

export const segmentsRouter = Router();

/** Create a manual (user-drawn) segment. Always marked edited: true so
 * auto-regeneration never touches it. */
segmentsRouter.post("/", async (req, res) => {
  const { sessionId, startTime, endTime, label } = req.body ?? {};
  if (!sessionId || !startTime || !endTime) {
    return res.status(400).json({ error: "Expected { sessionId, startTime, endTime, label? }" });
  }
  if (new Date(endTime).getTime() <= new Date(startTime).getTime()) {
    return res.status(400).json({ error: "endTime must be after startTime" });
  }

  try {
    const doc = await SegmentModel.create({
      sessionId,
      startTime,
      endTime,
      source: "manual",
      label: typeof label === "string" ? label : "",
      edited: true
    });
    const stats = await statsForSpan(doc.sessionId, doc.startTime, doc.endTime);
    if (!stats) return res.status(404).json({ error: "Session not found" });
    res.status(201).json(segmentToResponse(doc, stats));
  } catch (error) {
    console.error("[POST /api/segments] failed:", error);
    res.status(500).json({ error: "Failed to create segment." });
  }
});

/** Rename/relabel a segment (auto or manual). Marks it edited so a later
 * auto-regeneration for that session leaves it alone. */
segmentsRouter.patch("/:id", async (req, res) => {
  const { label } = req.body ?? {};
  if (typeof label !== "string") {
    return res.status(400).json({ error: "Expected { label: string }" });
  }

  try {
    const doc = await SegmentModel.findByIdAndUpdate(req.params.id, { label, edited: true }, { new: true });
    if (!doc) return res.status(404).json({ error: "Not found" });
    const stats = await statsForSpan(doc.sessionId, doc.startTime, doc.endTime);
    if (!stats) return res.status(404).json({ error: "Session not found" });
    res.json(segmentToResponse(doc, stats));
  } catch (error) {
    console.error("[PATCH /api/segments/:id] failed:", error);
    res.status(500).json({ error: "Failed to update segment." });
  }
});

segmentsRouter.delete("/:id", async (req, res) => {
  try {
    const doc = await SegmentModel.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ error: "Not found" });
    res.status(204).end();
  } catch (error) {
    console.error("[DELETE /api/segments/:id] failed:", error);
    res.status(500).json({ error: "Failed to delete segment." });
  }
});
