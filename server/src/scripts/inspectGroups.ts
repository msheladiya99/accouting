import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { connectDB } from "../config/db";
import { Company } from "../models/Company";
import { AccountGroup } from "../models/AccountGroup";

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function inspect() {
  await connectDB();
  
  const companies = await Company.find();
  for (const c of companies) {
    const groups = await AccountGroup.find({ companyId: c._id });
    console.log(`Company: ${c.companyName} (${c._id}) has ${groups.length} groups.`);
    if (groups.length > 0) {
      console.log(`Sample groups:`, groups.slice(0, 5).map(g => g.groupName));
    }
  }
  
  await mongoose.disconnect();
}

inspect();
