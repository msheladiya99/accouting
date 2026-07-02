import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { connectDB } from "../config/db";
import { Ledger } from "../models/Ledger";

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function inspect() {
  await connectDB();

  const ledgers = await Ledger.find({ companyId: "6a2abc4a88a8ad516f0938de" });
  console.log(`Found ${ledgers.length} ledgers for Anisha Lalit Hirpara:`);
  for (const l of ledgers) {
    console.log(`- ID: ${l._id}, Name: "${l.ledgerName}", Group: "${l.groupName}", Dr: ${l.openingDr}, Cr: ${l.openingCr}`);
  }

  await mongoose.disconnect();
}

inspect();
