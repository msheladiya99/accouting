import { Schema, model } from "mongoose";

const bankCashAccountSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    name: { type: String, required: true, trim: true },
    group: { type: String, enum: ["Bank", "Cash"], required: true },
    openingBalance: { type: Number, required: true, default: 0 }
  },
  { timestamps: true }
);

bankCashAccountSchema.index({ companyId: 1, name: 1 }, { unique: true });

export const BankCashAccount = model("BankCashAccount", bankCashAccountSchema);
