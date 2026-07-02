import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { connectDB } from "../config/db";
import { Ledger } from "../models/Ledger";
import { JournalEntry } from "../models/JournalEntry";
import { BankCashEntry } from "../models/BankCashEntry";
import { BankCashAccount } from "../models/BankCashAccount";

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function inspect() {
  await connectDB();

  const targetNames = ["KATHIRIYA KARAN ASHVINKUMAR", "GORDHANBHAILALJI BHAIJODHANI"];
  const ledgers = await Ledger.find({
    ledgerName: { $in: targetNames }
  });

  console.log(`Found ${ledgers.length} ledgers matching the target names.`);

  for (const ledger of ledgers) {
    const escapedName = escapeRegExp(ledger.ledgerName.trim());
    const namePattern = new RegExp(`^${escapedName}$`, "i");
    const companyId = ledger.companyId.toString();

    const { Types: MongoTypes } = require("mongoose");
    let companyIdFilter = { $in: [companyId, new MongoTypes.ObjectId(companyId)] };

    const jCount = await JournalEntry.countDocuments({
      companyId: companyIdFilter,
      $or: [
        { debitAccount:  { $regex: namePattern } },
        { creditAccount: { $regex: namePattern } },
        { "items.accountName": { $regex: namePattern } }
      ]
    });

    const contraCount = await BankCashEntry.countDocuments({
      companyId: companyIdFilter,
      contraAccountName: { $regex: namePattern }
    });

    const account = await BankCashAccount.findOne({
      name: { $regex: namePattern },
      companyId: companyId
    });
    
    let accCount = 0;
    if (account) {
      accCount = await BankCashEntry.countDocuments({
        accountId: account._id.toString(),
        companyId: companyIdFilter
      });
    }

    console.log(`\nLedger: "${ledger.ledgerName}"`);
    console.log(`- Company ID: ${companyId}`);
    console.log(`- jCount: ${jCount}`);
    console.log(`- contraCount: ${contraCount}`);
    console.log(`- hasAccount: ${!!account} (ID: ${account?._id})`);
    console.log(`- accCount: ${accCount}`);
  }

  await mongoose.disconnect();
}

inspect();
