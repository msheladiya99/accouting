import { Schema, model, Document } from "mongoose";

export interface ISuperAdmin extends Document {
  email: string;
  passwordHash: string;
  name: string;
  role: string;
  createdAt: Date;
}

const superAdminSchema = new Schema<ISuperAdmin>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true },
    role: { type: String, default: "SUPER_ADMIN" }
  },
  { timestamps: true }
);

export const SuperAdmin = model<ISuperAdmin>("SuperAdmin", superAdminSchema);
