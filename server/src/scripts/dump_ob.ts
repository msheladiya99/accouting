import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { BankCashAccount } from "../models/BankCashAccount";
import { BankCashEntry } from "../models/BankCashEntry";

async function run() {
  await connectDB();

  // Find all active account IDs
  const accounts = await BankCashAccount.find({});
  const activeIds = new Set(accounts.map(a => a._id.toString()));
  console.log("Active BankCashAccount IDs:", Array.from(activeIds));

  // Find all entries
  const entries = await BankCashEntry.find({});
  console.log(`Total entries in database: ${entries.length}`);

  let orphanCount = 0;
  const orphansToDelete: string[] = [];

  for (const e of entries) {
    if (!activeIds.has(e.accountId)) {
      orphanCount++;
      orphansToDelete.push(e._id.toString());
      console.log(`Orphan Entry ID: ${e._id}, AccountId: ${e.accountId}, Date: ${e.date}, Particulars: ${e.particulars.slice(0, 30)}`);
    }
  }

  console.log(`Found ${orphanCount} orphan entries.`);

  if (orphanCount > 0) {
    const result = await BankCashEntry.deleteMany({ _id: { $in: orphansToDelete } });
    console.log(`Successfully deleted ${result.deletedCount} orphan entries from the database.`);
  }

  await mongoose.disconnect();
}
run().catch(console.error);
