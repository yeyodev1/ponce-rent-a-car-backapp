import mongoose, { Schema } from "mongoose";

/**
 * Secuencias legibles (R1048, PON-1048). Un contador atómico por nombre evita
 * que dos solicitudes simultáneas reciban el mismo código.
 */
interface ICounter {
  _id: string;
  seq: number;
}

const counterSchema = new Schema<ICounter>({
  _id: { type: String, required: true },
  seq: { type: Number, default: 1000 },
});

export const Counter = mongoose.models.Counter || mongoose.model<ICounter>("Counter", counterSchema);

export async function nextSequence(name: string): Promise<number> {
  const doc = await Counter.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  return doc.seq;
}
