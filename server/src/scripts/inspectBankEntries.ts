import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { connectDB } from "../config/db";
import { BankCashEntry } from "../models/BankCashEntry";
import { BankCashAccount } from "../models/BankCashAccount";

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function inspect() {
  await connectDB();
  
  const companyId = "6a2abc4a88a8ad516f0938de"; // ANISHA LALIT HIRPARA
  const entries = await BankCashEntry.find({ companyId });
  console.log(`Found ${entries.length} entries for ANISHA LALIT HIRPARA:`);
  for (const e of entries) {
    const acc = await BankCashAccount.findById(e.accountId);
    console.log(`Date: ${e.date} | Account: "${acc?.name}" | Narration: "${e.particulars}" | Withdrawal: ${e.withdrawal} | Deposit: ${e.deposit}`);
  }
  
  await mongoose.disconnect();
}

inspect();
