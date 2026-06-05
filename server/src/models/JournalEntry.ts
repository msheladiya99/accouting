import { Schema, model } from "mongoose";

const journalEntrySchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    voucherNo: { type: String, required: true },
    date: { type: String, required: true }, // Format: "YYYY-MM-DD"
    narration: { type: String, required: true },
    debitAccount: { type: String, required: true },
    debitGroup: { type: String, required: true },
    debitAmount: { type: Number, required: true },
    creditAccount: { type: String, required: true },
    creditGroup: { type: String, required: true },
    creditAmount: { type: Number, required: true },
    status: { type: String, enum: ["Draft", "Posted"], default: "Draft" }
  },
  { timestamps: true }
);

journalEntrySchema.index({ companyId: 1, voucherNo: 1 }, { unique: true });

export const JournalEntry = model("JournalEntry", journalEntrySchema);
