import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { connectDB } from "../config/db";
import { Company } from "../models/Company";

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function inspect() {
  await connectDB();

  const companies = await Company.find({});
  console.log(`Found ${companies.length} companies:`);
  for (const c of companies) {
    console.log(`- ID: ${c._id}, Name: "${c.companyName}", Subdomain: "${c.subdomain}", Parent: ${c.parentCompanyId}`);
  }

  await mongoose.disconnect();
}

inspect();
