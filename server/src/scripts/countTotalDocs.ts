import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { connectDB } from "../config/db";
import { JournalEntry } from "../models/JournalEntry";
import { BankCashEntry } from "../models/BankCashEntry";
import { Ledger } from "../models/Ledger";

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function inspect() {
  await connectDB();

  const jCount = await JournalEntry.countDocuments({});
  const bCount = await BankCashEntry.countDocuments({});
  const lCount = await Ledger.countDocuments({});

  console.log(`Total Ledgers in database: ${lCount}`);
  console.log(`Total Journal Entries in database: ${jCount}`);
  console.log(`Total Bank/Cash Entries in database: ${bCount}`);

  await mongoose.disconnect();
}

inspect();
