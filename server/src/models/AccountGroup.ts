import { Schema, model } from "mongoose";

const accountGroupSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    groupName: { type: String, required: true, trim: true },
    superGroup: {
      type: String,
      required: true,
      enum: [
        "Capital Account",
        "Profit & Loss A/c",
        "Current Liabilities",
        "Loans (Liability)",
        "Fixed Assets",
        "Investments",
        "Current Assets",
        "Cash Ledger A/C.",
        "Stock-in-hand",
        "Suspense Account",
        "Misc. Expenses (Asset)",
        "Sales Account",
        "Purchase Account",
        "Income (Trading)",
        "Income",
        "Income (Other Then Sales)",
        "Expenses (Direct)",
        "Expense Account",
        "Partner Interest",
        "Partner Remuneration"
      ]
    }
  },
  { timestamps: true }
);

// Group names must be unique within a single company
accountGroupSchema.index({ companyId: 1, groupName: 1 }, { unique: true });

export const AccountGroup = model("AccountGroup", accountGroupSchema);
