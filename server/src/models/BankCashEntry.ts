import { Schema, model } from "mongoose";

const bankCashEntrySchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    accountId: { type: String, required: true }, // refers to BankCashAccount._id
    date: { type: String, required: true }, // Format: "YYYY-MM-DD"
    particulars: { type: String, default: "" },
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
bankCashEntrySchema.index({ companyId: 1, contraAccountName: 1 });
bankCashEntrySchema.index({ companyId: 1, accountId: 1, date: 1 });
bankCashEntrySchema.index({ companyId: 1, date: 1, deposit: 1, withdrawal: 1 }); // prior-year aggregate coverage
bankCashEntrySchema.index({ companyId: 1, contraAccountName: 1, date: 1 }); // ledger statement date-filtered

export const BankCashEntry = model("BankCashEntry", bankCashEntrySchema);
