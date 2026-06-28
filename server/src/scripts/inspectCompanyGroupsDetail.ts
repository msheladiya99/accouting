import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { connectDB } from "../config/db";
import { AccountGroup } from "../models/AccountGroup";

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function inspect() {
  await connectDB();
  
  const companyId = "6a2abc4a88a8ad516f0938de"; // Anisha Lalit Hirpara
  const groups = await AccountGroup.find({ companyId, groupName: /INCOME/i });
  console.log(`Found ${groups.length} matching groups for INCOME:`);
  for (const g of groups) {
    console.log(`ID: ${g._id}, groupName: "${g.groupName}", superGroup: "${g.superGroup}"`);
  }
  
  await mongoose.disconnect();
}

inspect();
