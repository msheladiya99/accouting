import { Schema, model } from "mongoose";

const userSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    role: { type: String, enum: ["Admin", "Accountant", "Viewer"], default: "Viewer" },
    status: { type: String, enum: ["Active", "Inactive"], default: "Active" },
    companyId: { type: Schema.Types.ObjectId, ref: "Company" },
    avatar: { type: String },
    lastLogin: { type: Date }
  },
  { timestamps: true }
);

export const User = model("User", userSchema);
