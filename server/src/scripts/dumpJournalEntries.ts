import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { connectDB } from "../config/db";
import { JournalEntry } from "../models/JournalEntry";

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function inspect() {
  await connectDB();

  const journals = await JournalEntry.find({});
  console.log(`=== ALL JOURNAL ENTRIES (${journals.length}) ===`);
  journals.forEach((j) => {
    console.log(`ID: ${j._id}, Company: ${j.companyId}, Date: ${j.date}, Voucher: ${j.voucherNo}, DbAcc: ${j.debitAccount}, CrAcc: ${j.creditAccount}, Items: ${JSON.stringify(j.items)}`);
  });

  await mongoose.disconnect();
}

inspect();
