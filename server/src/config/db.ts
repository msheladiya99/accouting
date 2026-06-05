import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/accounting_saas";

export async function connectDB(): Promise<void> {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("MongoDB connected successfully to:", MONGODB_URI);
  } catch (error) {
    console.error("MongoDB connection failed:", error);
    process.exit(1);
  }
}
