import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { connectDB } from "../config/db";
import { Company } from "../models/Company";
import { BankCashAccount } from "../models/BankCashAccount";
import { Ledger } from "../models/Ledger";

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const EXCLUDED_NAMES = [
  "BANK ACCOUNTS (BANKS)",
  "BANK OCC A/C",
  "CASH-IN-HAND",
  "CASH LEDGER A/C.",
  "BANK",
  "CASH",
  "ASSETS",
  "LIABILITIES",
  "CAPITAL",
  "EXPENSE",
  "EXPENSE ACCOUNT",
  "INCOME"
];

async function runCleanup() {
  await connectDB();

  try {
    const companies = await Company.find();
    console.log(`Found ${companies.length} companies to clean.`);

    for (const company of companies) {
      console.log(`\nCleaning company: ${company.companyName} (${company._id})`);

      // 1. Delete deprecated group-holder BankCashAccounts
      const deletedAccounts = await BankCashAccount.deleteMany({
        companyId: company._id,
        name: { $in: EXCLUDED_NAMES.map(n => new RegExp(`^${n.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, "i")) }
      });
      console.log(`Deleted ${deletedAccounts.deletedCount} deprecated category BankCashAccounts.`);

      // 2. Delete deprecated group-holder Ledgers
      const deletedLedgers = await Ledger.deleteMany({
        companyId: company._id,
        ledgerName: { $in: EXCLUDED_NAMES.map(n => new RegExp(`^${n.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, "i")) }
      });
      console.log(`Deleted ${deletedLedgers.deletedCount} deprecated category Ledgers.`);
    }

    console.log("\n==========================================");
    console.log("Bank/Cash Accounts & Ledgers Cleanup Done!");
    console.log("==========================================");

  } catch (error) {
    console.error("Cleanup failed:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Database connection closed.");
  }
}

runCleanup();
