import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { connectDB } from "../config/db";
import { BankCashAccount } from "../models/BankCashAccount";

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function inspect() {
  await connectDB();

  const targetNames = ["KATHIRIYA KARAN ASHVINKUMAR", "GORDHANBHAILALJI BHAIJODHANI"];
  for (const name of targetNames) {
    const escapedName = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const namePattern = new RegExp(`^${escapedName}$`, "i");

    const accounts = await BankCashAccount.find({
      name: { $regex: namePattern }
    });
    console.log(`For "${name}": Found ${accounts.length} BankCashAccounts`);
    for (const a of accounts) {
      console.log(`- ID: ${a._id}, Company: ${a.companyId}, Group: ${a.group}`);
    }
  }

  await mongoose.disconnect();
}

inspect();
