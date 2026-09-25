import { Router } from "express";
import { UserModel } from "../models/User.js";

export const usersRouter = Router();

usersRouter.get("/", async (_req, res) => {
  try {
    const users = await UserModel.find({}).sort({ name: 1 });
    res.json(users.map((u) => ({ id: String(u._id), name: u.name })));
  } catch (error) {
    console.error("[GET /api/users] failed:", error);
    res.status(500).json({ error: "Failed to list users." });
  }
});
