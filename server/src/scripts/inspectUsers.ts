import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { connectDB } from "../config/db";
import { User } from "../models/User";
import { Company } from "../models/Company";

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function inspect() {
  await connectDB();
  
  const users = await User.find();
  for (const u of users) {
    const comp = await Company.findById(u.companyId);
    console.log(`User: ${u.email} | Name: ${u.name} | companyName: "${comp?.companyName}" | companyId: ${u.companyId}`);
  }
  
  await mongoose.disconnect();
}

inspect();
