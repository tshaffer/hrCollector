import mongoose from "mongoose";
const uri = process.argv[2];
await mongoose.connect(uri);
const docs = await mongoose.connection.db.collection("sessions").find({}).toArray();
console.log(`count: ${docs.length}`);
for (const d of docs) {
  console.log({
    _id: String(d._id),
    workoutId: d.workoutId,
    startDate: d.startDate,
    endDate: d.endDate,
    thresholdBpm: d.thresholdBpm,
    numSamples: Array.isArray(d.heartRateSamples) ? d.heartRateSamples.length : "N/A"
  });
}
await mongoose.disconnect();
