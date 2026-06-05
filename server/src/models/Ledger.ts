import { Schema, model } from "mongoose";

const ledgerSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    ledgerName: { type: String, required: true, trim: true },
    groupName: {
      type: String,
      required: true
    },
    openingDr: { type: Number, default: 0 },
    openingCr: { type: Number, default: 0 }
  },
  { timestamps: true }
);

ledgerSchema.index({ companyId: 1, ledgerName: 1 }, { unique: true });

export const Ledger = model("Ledger", ledgerSchema);
