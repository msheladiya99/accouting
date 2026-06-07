import { Schema, model } from "mongoose";

const companySchema = new Schema(
  {
    companyName: { type: String, required: true, unique: true },
    panNumber: { type: String, required: true, uppercase: true, trim: true },
    subdomain: { type: String, required: true, unique: true, lowercase: true, trim: true },
    status: { type: String, enum: ["active", "suspended"], default: "active" }
  },
  { timestamps: true }
);

export const Company = model("Company", companySchema);
