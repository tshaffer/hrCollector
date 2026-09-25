import { Schema, model, type InferSchemaType } from "mongoose";

// A small, fixed set of people this server tracks heart rate data for.
// There's no login/auth here — this only ever runs on the home network
// for family use — just a name so sessions and settings can be scoped to
// the right person.
const userSchema = new Schema(
  {
    name: { type: String, required: true, unique: true }
  },
  { timestamps: true }
);

export type UserDocument = InferSchemaType<typeof userSchema>;
export const UserModel = model("User", userSchema);

/** The fixed list of users this app supports today. Seeding is
 * idempotent (upsert on name), so adding a name here later and
 * restarting the server is enough to add a new user. */
export const SEED_USER_NAMES = ["Ted", "Lori"];

export async function seedUsers() {
  for (const name of SEED_USER_NAMES) {
    await UserModel.findOneAndUpdate({ name }, { $setOnInsert: { name } }, { upsert: true });
  }
}
