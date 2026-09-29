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
  // $inc con upsert ignora el default del schema: se siembra 1000 aparte para
  // que el primer código sea R1001 / PON-1001 y no R1.
  await Counter.updateOne({ _id: name }, { $setOnInsert: { seq: 1000 } }, { upsert: true });
  const doc = await Counter.findOneAndUpdate({ _id: name }, { $inc: { seq: 1 } }, { new: true });
  return doc.seq;
}
