import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { connectDB } from "../config/db";
import { Ledger } from "../models/Ledger";

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function inspect() {
  await connectDB();
  
  const companyId = "6a268580f16167bac2286a84"; // XYZ COMPANY
  const ledgers = await Ledger.find({ companyId });
  console.log(`Found ${ledgers.length} ledgers for XYZ COMPANY:`);
  for (const l of ledgers) {
    console.log(`ID: ${l._id}, ledgerName: "${l.ledgerName}", groupName: "${l.groupName}"`);
  }
  
  await mongoose.disconnect();
}

inspect();
