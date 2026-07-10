import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { Company } from "../models/Company";
import { Ledger } from "../models/Ledger";
import { JournalEntry } from "../models/JournalEntry";

async function run() {
  await connectDB();
  
  // Find the company
  const company = await Company.findOne({ companyName: /Anisha/i });
  if (!company) {
    console.log("Company not found");
    mongoose.connection.close();
    return;
  }
  
  console.log("Found Company:", company.companyName, company._id);
  
  // Find KVP ledgers
  const ledgers = await Ledger.find({ companyId: company._id });
  console.log("\n=== KVP LEDGERS ===");
  for (const l of ledgers) {
    if (l.ledgerName.toLowerCase().includes("kvp") || l.ledgerName.toLowerCase().includes("kissan") || l.ledgerName.toLowerCase().includes("vikas") || l.groupName.toLowerCase().includes("capital")) {
      console.log(`- ${l.ledgerName}: Group: ${l.groupName}, OpeningDr: ${l.openingDr}, OpeningCr: ${l.openingCr}`);
    }
  }

  // Find all journal entries involving KVP or Capital
  const journalEntries = await JournalEntry.find({ companyId: company._id });
  console.log("\n=== JOURNAL ENTRIES INVOLVING KVP OR CAPITAL ===");
  for (const je of journalEntries) {
    const involvesKvpOrCapital = je.items?.some((item: any) => 
      item.accountName?.toLowerCase().includes("kvp") || 
      item.accountName?.toLowerCase().includes("kissan") || 
      item.accountName?.toLowerCase().includes("vikas") ||
      item.groupName?.toLowerCase().includes("capital")
    ) || je.debitAccount?.toLowerCase().includes("kvp") || je.creditAccount?.toLowerCase().includes("kvp");
    
    if (involvesKvpOrCapital) {
      console.log(`JV Date: ${je.date}, Narration: ${je.narration}`);
      if (je.items && je.items.length > 0) {
        for (const item of je.items) {
          console.log(`  - ${item.type}: ${item.accountName} (Group: ${item.groupName}) -> ${item.amount}`);
        }
      } else {
        console.log(`  - Db: ${je.debitAccount} (Group: ${je.debitGroup}) -> ${je.debitAmount}`);
        console.log(`  - Cr: ${je.creditAccount} (Group: ${je.creditGroup}) -> ${je.creditAmount}`);
      }
    }
  }

  mongoose.connection.close();
}

run().catch(err => {
  console.error(err);
  mongoose.connection.close();
});
