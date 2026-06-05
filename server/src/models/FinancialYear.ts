import { Schema, model } from "mongoose";

const financialYearSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    financialYear: { type: String, required: true },
    label: { type: String, required: true },
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },
    status: { type: String, enum: ["current", "previous", "future", "closed"], default: "future" }
  },
  { timestamps: true }
);

financialYearSchema.index({ companyId: 1, financialYear: 1 }, { unique: true });

export const FinancialYear = model("FinancialYear", financialYearSchema);
