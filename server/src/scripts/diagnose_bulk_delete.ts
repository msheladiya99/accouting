import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { connectDB } from "../config/db";
import { Ledger } from "../models/Ledger";
import { Company } from "../models/Company";
import { JournalEntry } from "../models/JournalEntry";
import { BankCashEntry } from "../models/BankCashEntry";
import { BankCashAccount } from "../models/BankCashAccount";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function diagnose() {
  const MONGODB_URI = "mongodb://meetjbs:Meet123@itr.bgwoypp.mongodb.net/ca-office?retryWrites=true&w=majority&ssl=true&tlsAllowInvalidCertificates=true";
  const finalUri = MONGODB_URI.replace("mongodb://", "mongodb+srv://");
  await mongoose.connect(finalUri);
  console.log("Connected to remote ca-office database");

  const allCompanies = await Company.find({});
  for (const c of allCompanies) {
    console.log(`Company: "${c.companyName}" (ID: ${c._id}, Subdomain: ${c.subdomain})`);
    const ledgers = await Ledger.find({ companyId: c._id });
    console.log(`  - Ledgers count: ${ledgers.length}`);
    ledgers.slice(0, 5).forEach(l => {
      console.log(`    * "${l.ledgerName}" (Group: ${l.groupName})`);
    });
  }

  await mongoose.disconnect();
  return;

  const allCompanies = await Company.find({});
  for (const c of allCompanies) {
    console.log(`Company: "${c.companyName}" (ID: ${c._id}, Subdomain: ${c.subdomain})`);
    const ledgers = await Ledger.find({ companyId: c._id });
    console.log(`  - Ledgers count: ${ledgers.length}`);
    ledgers.slice(0, 5).forEach(l => {
      console.log(`    * "${l.ledgerName}" (Group: ${l.groupName})`);
    });
  }

  await mongoose.disconnect();
  return;

  for (const company of companies) {
    console.log("Company Found:", company.companyName, "ID:", company._id);
    const ledgers = await Ledger.find({ companyId: company._id });
    console.log(`  - Company has ${ledgers.length} ledgers.`);
  }

  await mongoose.disconnect();
  return;

  // Let's count how many have journal entries or bank cash entries
  let blockedCount = 0;
  for (const ledger of ledgers) {
    const escapedName = ledger.ledgerName.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const namePattern = new RegExp(`^${escapedName}$`, "i");

    const jEntry = await JournalEntry.findOne({
      companyId: company._id,
      $or: [
        { debitAccount:  { $regex: namePattern } },
        { creditAccount: { $regex: namePattern } },
        { "items.accountName": { $regex: namePattern } }
      ]
    });

    const bEntry = await BankCashEntry.findOne({
      companyId: company._id,
      contraAccountName: { $regex: namePattern }
    });

    const account = await BankCashAccount.findOne({
      name: { $regex: namePattern },
      companyId: company._id
    });
    
    let accEntry = null;
    if (account) {
      accEntry = await BankCashEntry.findOne({
        accountId: account._id.toString(),
        companyId: company._id
      });
    }

    if (jEntry || bEntry || accEntry) {
      blockedCount++;
      console.log(`Blocked: "${ledger.ledgerName}"`);
      if (jEntry) console.log(`  - Has journal entry ID: ${jEntry._id}`);
      if (bEntry) console.log(`  - Has bank contra entry ID: ${bEntry._id}`);
      if (accEntry) console.log(`  - Has bank account entry ID: ${accEntry._id}`);
    }
  }

  console.log(`Total blocked: ${blockedCount} out of ${ledgers.length}`);

  await mongoose.disconnect();
}

diagnose();
