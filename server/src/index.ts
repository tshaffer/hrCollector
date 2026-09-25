import "dotenv/config";
import cors from "cors";
import express from "express";
import { connectToDatabase } from "./db.js";
import { SessionModel } from "./models/Session.js";
import { SettingsModel, getSettings } from "./models/Settings.js";
import { seedUsers, UserModel } from "./models/User.js";
import { segmentsRouter } from "./routes/segments.js";
import { sessionsRouter } from "./routes/sessions.js";
import { settingsRouter } from "./routes/settings.js";
import { usersRouter } from "./routes/users.js";
import { regenerateAllAutoSegments } from "./segmentsService.js";

const PORT = Number(process.env.PORT ?? 4000);
const HOST = process.env.HOST ?? "0.0.0.0";
const MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://localhost:27017/hrcollector";

/**
 * One-time (idempotent) migration for multi-user support: every session
 * and settings doc that predates it belonged to Lori (she was the only
 * user), so this assigns her as the owner rather than leaving them
 * orphaned. Also migrates the old single global settings doc (_id:
 * "global") to Lori's new per-user settings doc, preserving whatever
 * was already configured instead of resetting to defaults.
 */
async function backfillOwnership() {
  await seedUsers();
  const lori = await UserModel.findOne({ name: "Lori" });
  if (!lori) return;

  const sessionResult = await SessionModel.updateMany(
    { userId: { $exists: false } },
    { $set: { userId: lori._id, dataSource: "healthkit" } }
  );
  if (sessionResult.modifiedCount > 0) {
    console.log(`[startup] assigned ${sessionResult.modifiedCount} pre-existing session(s) to Lori`);
  }

  const oldGlobalSettings = await SettingsModel.collection.findOne({ _id: "global" } as never);
  if (oldGlobalSettings) {
    await SettingsModel.findOneAndUpdate(
      { userId: lori._id },
      {
        $setOnInsert: {
          userId: lori._id,
          thresholdBpm: oldGlobalSettings.thresholdBpm,
          minSegmentDurationSeconds: oldGlobalSettings.minSegmentDurationSeconds,
          mergeGapSeconds: oldGlobalSettings.mergeGapSeconds
        }
      },
      { upsert: true }
    );
    await SettingsModel.collection.deleteOne({ _id: "global" } as never);
    console.log("[startup] migrated the old global settings doc to Lori's per-user settings");
  }
}

/**
 * One-time (idempotent) backfill: any session inserted before
 * thresholdBpm existed on the schema never got it set, since
 * $setOnInsert only fires on insert, not on the update half of an
 * upsert. Runs on every startup but is a no-op once every session has
 * the field. Uses each session's own owner's threshold, now that
 * thresholds are per-user.
 */
async function backfillMissingThresholds() {
  const sessionsMissingThreshold = await SessionModel.find({ thresholdBpm: { $exists: false } });
  for (const session of sessionsMissingThreshold) {
    const settings = await getSettings(String(session.userId));
    session.thresholdBpm = settings.thresholdBpm;
    await session.save();
  }
  if (sessionsMissingThreshold.length > 0) {
    console.log(`[startup] backfilled thresholdBpm onto ${sessionsMissingThreshold.length} pre-existing session(s)`);
  }
}

/** Makes sure every session has up-to-date auto segments — covers both
 * sessions recorded before this feature existed, and any settings change
 * made while the server wasn't running. */
async function backfillAutoSegments() {
  const count = await regenerateAllAutoSegments();
  if (count > 0) {
    console.log(`[startup] regenerated auto segments for ${count} session(s)`);
  }
}

async function main() {
  await connectToDatabase(MONGODB_URI);
  await backfillOwnership();
  await backfillMissingThresholds();
  await backfillAutoSegments();

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "5mb" }));

  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use("/api/users", usersRouter);
  app.use("/api/sessions", sessionsRouter);
  app.use("/api/settings", settingsRouter);
  app.use("/api/segments", segmentsRouter);

  app.listen(PORT, HOST, () => {
    console.log(`[server] listening on http://${HOST}:${PORT}`);
  });
}

main().catch((error) => {
  console.error("[server] failed to start:", error);
  process.exit(1);
});
