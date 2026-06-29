import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { connectDB } from "../config/db";
import { Company } from "../models/Company";

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function inspect() {
  await connectDB();
  
  const companies = await Company.find();
  for (const c of companies) {
    console.log(`Company: "${c.companyName}" | ID: ${c._id} | Subdomain: "${c.subdomain}" | parentCompanyId: "${c.parentCompanyId}"`);
  }
  
  await mongoose.disconnect();
}

inspect();
