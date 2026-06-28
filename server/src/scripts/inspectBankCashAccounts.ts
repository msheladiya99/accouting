import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { connectDB } from "../config/db";
import { BankCashAccount } from "../models/BankCashAccount";

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function inspect() {
  await connectDB();
  
  const companyId = "6a268580f16167bac2286a84"; // XYZ COMPANY
  const accs = await BankCashAccount.find({ companyId });
  console.log(`Found ${accs.length} BankCashAccounts:`);
  for (const a of accs) {
    console.log(`ID: ${a._id}, name: "${a.name}", group: "${a.group}"`);
  }
  
  await mongoose.disconnect();
}

inspect();
