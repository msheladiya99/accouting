import { Schema, model } from "mongoose";

const bankCashEntrySchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    accountId: { type: String, required: true }, // refers to BankCashAccount._id
    date: { type: String, required: true }, // Format: "YYYY-MM-DD"
    particulars: { type: String, required: true },
    withdrawal: { type: Number, required: true, default: 0 },
    deposit: { type: Number, required: true, default: 0 },
    contraAccountName: { type: String, required: true },
    contraAccountGroup: { type: String, required: true },
    isChanged: { type: Boolean, default: false }
  },
  { timestamps: true }
);

bankCashEntrySchema.index({ companyId: 1, date: 1 });
bankCashEntrySchema.index({ accountId: 1 });

export const BankCashEntry = model("BankCashEntry", bankCashEntrySchema);
