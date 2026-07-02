import mongoose from "mongoose";
import { Ledger } from "../models/Ledger";
import { JournalEntry } from "../models/JournalEntry";
import { BankCashEntry } from "../models/BankCashEntry";

async function inspect() {
  const localUri = "mongodb://127.0.0.1:27017/accounting_saas";
  console.log(`Connecting to: ${localUri}`);
  try {
    await mongoose.connect(localUri, { serverSelectionTimeoutMS: 2000 });
    console.log("Connected successfully to local MongoDB!");

    const lCount = await Ledger.countDocuments({});
    const jCount = await JournalEntry.countDocuments({});
    const bCount = await BankCashEntry.countDocuments({});

    console.log(`Total Ledgers: ${lCount}`);
    console.log(`Total Journal Entries: ${jCount}`);
    console.log(`Total Bank/Cash Entries: ${bCount}`);

    const targetNames = ["KATHIRIYA KARAN ASHVINKUMAR", "GORDHANBHAILALJI BHAIJODHANI"];
    for (const name of targetNames) {
      console.log(`\nInspecting for name: "${name}"`);
      const escapedName = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const namePattern = new RegExp(`^${escapedName}$`, "i");

      const jc = await JournalEntry.countDocuments({
        $or: [
          { debitAccount: { $regex: namePattern } },
          { creditAccount: { $regex: namePattern } },
          { "items.accountName": { $regex: namePattern } }
        ]
      });
      const bc = await BankCashEntry.countDocuments({
        contraAccountName: { $regex: namePattern }
      });
      console.log(`- jCount: ${jc}`);
      console.log(`- contraCount: ${bc}`);
    }

  } catch (err: any) {
    console.log("Could not connect to local MongoDB:", err.message);
  } finally {
    await mongoose.disconnect();
  }
}

inspect();
