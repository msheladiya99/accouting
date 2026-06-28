import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { Ledger } from "../models/Ledger";
import { BankCashAccount } from "../models/BankCashAccount";
import { BankCashEntry } from "../models/BankCashEntry";
import { JournalEntry } from "../models/JournalEntry";

async function run() {
  await connectDB();

  console.log("=== LEDGERS ===");
  const ledgers = await Ledger.find({ ledgerName: /BANK OF BARODA/i });
  console.log(JSON.stringify(ledgers, null, 2));

  console.log("\n=== BANK CASH ACCOUNTS ===");
  const accounts = await BankCashAccount.find({ name: /BANK OF BARODA/i });
  console.log(JSON.stringify(accounts, null, 2));

  for (const acc of accounts) {
    console.log(`\n=== ENTRIES FOR ACCOUNT ${acc.name} (${acc._id}) ===`);
    const entries = await BankCashEntry.find({ accountId: acc._id.toString() });
    console.log(`Total entries: ${entries.length}`);
    for (const e of entries) {
      console.log(`  Date: ${e.date}, Particulars: ${e.particulars}, Withdrawal: ${e.withdrawal}, Deposit: ${e.deposit}, Contra: ${e.contraAccountName}`);
    }
  }

  console.log("\n=== BANK CASH ENTRIES WITH CONTRA NAME BANK OF BARODA ===");
  const contraEntries = await BankCashEntry.find({ contraAccountName: /BANK OF BARODA/i });
  console.log(`Total contra entries: ${contraEntries.length}`);
  for (const e of contraEntries) {
    console.log(`  Date: ${e.date}, Particulars: ${e.particulars}, Withdrawal: ${e.withdrawal}, Deposit: ${e.deposit}`);
  }

  console.log("\n=== JOURNAL ENTRIES WITH BANK OF BARODA ===");
  const journalEntries = await JournalEntry.find({
    $or: [
      { debitAccount: /BANK OF BARODA/i },
      { creditAccount: /BANK OF BARODA/i },
      { "items.accountName": /BANK OF BARODA/i }
    ]
  });
  console.log(`Total journal entries: ${journalEntries.length}`);
  for (const e of journalEntries) {
    console.log(`  Date: ${e.date}, Narration: ${e.narration}, Debit: ${e.debitAccount}, Credit: ${e.creditAccount}`);
  }

  await mongoose.disconnect();
}

run().catch(console.error);
