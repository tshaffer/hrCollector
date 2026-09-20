import mongoose from "mongoose";

export async function connectToDatabase(uri: string): Promise<void> {
  mongoose.set("strictQuery", true);
  await mongoose.connect(uri);
  console.log(`[db] connected to ${uri}`);
}
