import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { connectDB } from "../config/db";
import { JournalEntry } from "../models/JournalEntry";
import { BankCashEntry } from "../models/BankCashEntry";
import { Company } from "../models/Company";

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

async function inspect() {
  await connectDB();

  const targetNames = ["KATHIRIYA KARAN ASHVINKUMAR", "GORDHANBHAILALJI BHAIJODHANI"];
  
  for (const name of targetNames) {
    const escapedName = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const namePattern = new RegExp(`^${escapedName}$`, "i");

    console.log(`\n=== Inspecting for: "${name}" ===`);

    const journals = await JournalEntry.find({
      $or: [
        { debitAccount: { $regex: namePattern } },
        { creditAccount: { $regex: namePattern } },
        { "items.accountName": { $regex: namePattern } }
      ]
    });

    console.log(`Found ${journals.length} journal entries:`);
    for (const j of journals) {
      const company = await Company.findById(j.companyId);
      console.log(`- JV ID: ${j._id}, Company: ${company?.companyName} (${j.companyId}), Date: ${j.date}, Voucher: ${j.voucherNo}, DebitAcc: ${j.debitAccount}, CreditAcc: ${j.creditAccount}, Items: ${JSON.stringify(j.items)}`);
    }

    const bankEntries = await BankCashEntry.find({
      contraAccountName: { $regex: namePattern }
    });

    console.log(`Found ${bankEntries.length} bank/cash entries:`);
    for (const b of bankEntries) {
      const company = await Company.findById(b.companyId);
      console.log(`- BankEntry ID: ${b._id}, Company: ${company?.companyName} (${b.companyId}), Date: ${b.date}, Particulars: ${b.particulars}, ContraAcc: ${b.contraAccountName}, Dep: ${b.deposit}, Wdr: ${b.withdrawal}`);
    }
  }

  await mongoose.disconnect();
}

inspect();
