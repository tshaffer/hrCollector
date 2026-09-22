import "dotenv/config";
import cors from "cors";
import express from "express";
import { connectToDatabase } from "./db.js";
import { SessionModel } from "./models/Session.js";
import { getSettings } from "./models/Settings.js";
import { sessionsRouter } from "./routes/sessions.js";
import { settingsRouter } from "./routes/settings.js";

const PORT = Number(process.env.PORT ?? 4000);
const HOST = process.env.HOST ?? "0.0.0.0";
const MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://localhost:27017/hrcollector";

/**
 * One-time (idempotent) backfill: any session inserted before thresholdBpm
 * existed on the schema never got it set, since $setOnInsert only fires on
 * insert, not on the update half of an upsert. Runs on every startup but is
 * a no-op once every session has the field.
 */
async function backfillMissingThresholds() {
  const settings = await getSettings();
  const result = await SessionModel.updateMany(
    { thresholdBpm: { $exists: false } },
    { $set: { thresholdBpm: settings.thresholdBpm } }
  );
  if (result.modifiedCount > 0) {
    console.log(`[startup] backfilled thresholdBpm (${settings.thresholdBpm}) onto ${result.modifiedCount} pre-existing session(s)`);
  }
}

async function main() {
  await connectToDatabase(MONGODB_URI);
  await backfillMissingThresholds();

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "5mb" }));

  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use("/api/sessions", sessionsRouter);
  app.use("/api/settings", settingsRouter);

  app.listen(PORT, HOST, () => {
    console.log(`[server] listening on http://${HOST}:${PORT}`);
  });
}

main().catch((error) => {
  console.error("[server] failed to start:", error);
  process.exit(1);
});
