import { Schema, model } from "mongoose";

const companySchema = new Schema(
  {
    companyName: { type: String, required: true, unique: true },
    panNumber: { type: String, required: true, uppercase: true, trim: true }
  },
  { timestamps: true }
);

export const Company = model("Company", companySchema);
