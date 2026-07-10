import { Schema, model } from "mongoose";

const importedTransactionSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    date: { type: String, required: true },
    narration: { type: String, required: true },
    withdrawal: { type: Number, default: 0 },
    deposit: { type: Number, default: 0 },
    accountName: { type: String, required: true },
    accountGroup: { type: String, required: true },
    importedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

importedTransactionSchema.index({ companyId: 1, date: 1 });

export const ImportedTransaction = model("ImportedTransaction", importedTransactionSchema);
