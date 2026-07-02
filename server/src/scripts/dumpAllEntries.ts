import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { connectDB } from "../config/db";
import { JournalEntry } from "../models/JournalEntry";
import { BankCashEntry } from "../models/BankCashEntry";

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function inspect() {
  await connectDB();

  const journals = await JournalEntry.find({});
  console.log("=== ALL JOURNAL ENTRIES ===");
  journals.forEach((j) => {
    console.log(`ID: ${j._id}, Company: ${j.companyId}, Date: ${j.date}, DbAcc: ${j.debitAccount}, CrAcc: ${j.creditAccount}, Items: ${JSON.stringify(j.items)}`);
  });

  const bankEntries = await BankCashEntry.find({});
  console.log("\n=== ALL BANK/CASH ENTRIES ===");
  bankEntries.forEach((b) => {
    console.log(`ID: ${b._id}, Company: ${b.companyId}, Date: ${b.date}, Particulars: ${b.particulars}, Contra: ${b.contraAccountName}, Dep: ${b.deposit}, Wdr: ${b.withdrawal}`);
  });

  await mongoose.disconnect();
}

inspect();
