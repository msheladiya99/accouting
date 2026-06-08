import { Schema, model } from "mongoose";

const companySchema = new Schema(
  {
    companyName: { type: String, required: true, unique: true },
    panNumber: { type: String, required: true, uppercase: true, trim: true },
    subdomain: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    parentCompanyId: { type: Schema.Types.ObjectId, ref: "Company", default: null },
    status: { type: String, enum: ["active", "suspended"], default: "active" },
    mobileNumber: { type: String },
    subscriptionPlan: { type: String, default: "Enterprise cloud" },
    maxAdmins: { type: String, default: "5 Admins" },
    storageType: { type: String, default: "Application Drive (Default)" },
    dbMode: { type: String, default: "Default System MongoDB" }
  },
  { timestamps: true }
);

export const Company = model("Company", companySchema);
