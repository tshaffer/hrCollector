import "dotenv/config";
import cors from "cors";
import express from "express";
import { connectToDatabase } from "./db.js";
import { sessionsRouter } from "./routes/sessions.js";

const PORT = Number(process.env.PORT ?? 4000);
const HOST = process.env.HOST ?? "0.0.0.0";
const MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://localhost:27017/hrcollector";

async function main() {
  await connectToDatabase(MONGODB_URI);

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "5mb" }));

  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use("/api/sessions", sessionsRouter);

  app.listen(PORT, HOST, () => {
    console.log(`[server] listening on http://${HOST}:${PORT}`);
  });
}

main().catch((error) => {
  console.error("[server] failed to start:", error);
  process.exit(1);
});
