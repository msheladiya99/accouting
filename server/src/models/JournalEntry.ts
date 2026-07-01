import { Schema, model } from "mongoose";

const journalEntrySchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    voucherNo: { type: String, required: true },
    date: { type: String, required: true }, // Format: "YYYY-MM-DD"
    narration: { type: String, default: "" },
    items: [
      {
        type: { type: String, enum: ["Db", "Cr"], required: true },
        accountName: { type: String, required: true },
        groupName: { type: String, required: true },
        amount: { type: Number, required: true }
      }
    ],
    debitAccount: { type: String },
    debitGroup: { type: String },
    debitAmount: { type: Number },
    creditAccount: { type: String },
    creditGroup: { type: String },
    creditAmount: { type: Number },
    status: { type: String, enum: ["Draft", "Posted"], default: "Draft" }
  },
  { timestamps: true }
);

journalEntrySchema.index({ companyId: 1, voucherNo: 1 }, { unique: true });
journalEntrySchema.index({ companyId: 1, date: 1 });

export const JournalEntry = model("JournalEntry", journalEntrySchema);
