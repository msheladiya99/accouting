import { Schema, model } from "mongoose";

const companySchema = new Schema(
  {
    companyName: { type: String, required: true, unique: true },
    panNumber: { type: String, required: true, uppercase: true, trim: true },
    subdomain: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    parentCompanyId: { type: Schema.Types.ObjectId, ref: "Company", default: null },
    status: { type: String, enum: ["active", "suspended"], default: "active" },
    mobileNumber: { type: String },
    address: { type: String, default: "" },
    email: { type: String, default: "" },
    currency: { type: String, default: "INR" },
    subscriptionPlan: { type: String, default: "Enterprise cloud" },
    maxAdmins: { type: String, default: "5 Admins" },
    storageType: { type: String, default: "Application Drive (Default)" },
    dbMode: { type: String, default: "Default System MongoDB" },
    
    // SMTP Email Settings
    emailNotificationsEnabled: { type: Boolean, default: false },
    smtpHost: { type: String, default: "" },
    smtpPort: { type: String, default: "587" },
    smtpUsername: { type: String, default: "" },
    smtpPassword: { type: String, default: "" },
    smtpFromName: { type: String, default: "AccountPro" },
    smtpFromEmail: { type: String, default: "" },
    notifyOnExport: { type: Boolean, default: true },
    notifyOnBackup: { type: Boolean, default: false },
    notifyOnLogin: { type: Boolean, default: false }
  },
  { timestamps: true }
);

export const Company = model("Company", companySchema);
