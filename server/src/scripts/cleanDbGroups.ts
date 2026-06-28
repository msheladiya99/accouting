import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { connectDB } from "../config/db";
import { Company } from "../models/Company";
import { Ledger } from "../models/Ledger";
import { AccountGroup } from "../models/AccountGroup";
import { JournalEntry } from "../models/JournalEntry";
import { BankCashEntry } from "../models/BankCashEntry";
import { BankCashAccount } from "../models/BankCashAccount";

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const DEFAULT_GROUPS_SEEDS = [
  // Trading
  { groupName: "DIRECT EXPENSES", superGroup: "Expenses (Direct)" },
  { groupName: "INCOME (TRADING)", superGroup: "Income (Trading)" },
  { groupName: "PURCHASE ACCOUNT", superGroup: "Purchase Account" },
  { groupName: "SALES ACCOUNT", superGroup: "Sales Account" },

  // Profit & Loss
  { groupName: "EXPENSE ACCOUNT", superGroup: "Expense Account" },
  { groupName: "FINANCIAL EXPENSES", superGroup: "Expense Account" },
  { groupName: "INCOME", superGroup: "Income" },
  { groupName: "INCOME (OTHER THEN SALES)", superGroup: "Income (Other Then Sales)" },
  { groupName: "INDIRECT EXPENSES", superGroup: "Expense Account" },
  { groupName: "PARTNER INTEREST", superGroup: "Partner Interest" },
  { groupName: "PARTNER REMUNERATION", superGroup: "Partner Remuneration" },

  // Balance Sheet
  { groupName: "ADVANCES FROM CUSTOMERS", superGroup: "Current Liabilities" },
  { groupName: "BANK ACCOUNTS (BANKS)", superGroup: "Current Assets" },
  { groupName: "BANK OCC A/C", superGroup: "Loans (Liability)" },
  { groupName: "CAPITAL ACCOUNT", superGroup: "Capital Account" },
  { groupName: "CASH LEDGER A/C.", superGroup: "CASH LEDGER A/C." },
  { groupName: "CASH-IN-HAND", superGroup: "Current Assets" },
  { groupName: "CURRENT CAPITAL ACCOUNT", superGroup: "Capital Account" },
  { groupName: "CURRENT LIABILITIES", superGroup: "Current Liabilities" },
  { groupName: "DEPOSITS (ASSET)", superGroup: "Current Assets" },
  { groupName: "DUTIES & TAXES", superGroup: "Current Liabilities" },
  { groupName: "FIXED ASSETS", superGroup: "Fixed Assets" },
  { groupName: "INVESTMENTS", superGroup: "Investments" },
  { groupName: "LOANS & ADVANCES (ASSET)", superGroup: "Current Assets" },
  { groupName: "LOANS (LIABILITY)", superGroup: "Loans (Liability)" },
  { groupName: "MISC. EXPENSES (ASSET)", superGroup: "Misc. Expenses (Asset)" },
  { groupName: "PROFIT & LOSS A/C", superGroup: "Profit & Loss A/c" },
  { groupName: "PROVISIONS", superGroup: "Current Liabilities" },
  { groupName: "RESERVES & SURPLUS", superGroup: "Capital Account" },
  { groupName: "SALARY EXPENSES PAYABLE", superGroup: "Current Liabilities" },
  { groupName: "SECURED LOANS", superGroup: "Loans (Liability)" },
  { groupName: "STOCK-IN-HAND", superGroup: "Stock-in-hand" },
  { groupName: "SUNDRY CREDITORS", superGroup: "Current Liabilities" },
  { groupName: "SUNDRY CREDITORS - MATERIAL", superGroup: "Current Liabilities" },
  { groupName: "SUNDRY CREDITORS - SERVICES", superGroup: "Current Liabilities" },
  { groupName: "SUNDRY DEBTORS", superGroup: "Current Assets" },
  { groupName: "SUSPENSE ACCOUNT", superGroup: "Suspense Account" },
  { groupName: "UNSECURED LOANS", superGroup: "Loans (Liability)" }
];

const GROUP_MAPPING: Record<string, string> = {
  "CAPITAL": "CAPITAL ACCOUNT",
  "CURRENT CAPITAL ACCOUNT": "CAPITAL ACCOUNT",
  "EXPENSE": "EXPENSE ACCOUNT",
  "EXPENSE ACCOUNT": "EXPENSE ACCOUNT",
  "ASSETS": "CURRENT ASSETS",
  "LIABILITIES": "CURRENT LIABILITIES",
  "INCOME": "INCOME",
  "BANK": "BANK ACCOUNTS (BANKS)",
  "CASH": "CASH-IN-HAND",
  "CASH LEDGER A/C.": "CASH LEDGER A/C.",
  "PURCHASES": "PURCHASE ACCOUNT",
  "SALES": "SALES ACCOUNT",
  "SUNDRY CREDITORS - MATERIAL": "SUNDRY CREDITORS",
  "SUNDRY CREDITORS - SERVICES": "SUNDRY CREDITORS"
};

const EXCLUDED_LEDGER_GROUPS = [
  "EXPENSE ACCOUNT",
  "INCOME",
  "CURRENT LIABILITIES",
  "CURRENT CAPITAL ACCOUNT"
];

async function runMigration() {
  console.log("Connecting to Database...");
  await connectDB();

  try {
    const companies = await Company.find();
    console.log(`Found ${companies.length} companies to migrate.`);

    for (const company of companies) {
      console.log(`\n========================================`);
      console.log(`Migrating Company: ${company.companyName} (${company._id})`);
      console.log(`========================================`);

      // 1. Convert all existing Account Groups to uppercase
      const groups = await AccountGroup.find({ companyId: company._id });
      for (const group of groups) {
        const oldName = group.groupName;
        const newName = oldName.trim().toUpperCase();
        const oldSuper = group.superGroup;

        // Resolve newSuper case-insensitively to match standard enum
        const standardSuperGroups = [
          "Capital Account", "Profit & Loss A/c", "Current Liabilities", "Loans (Liability)",
          "Fixed Assets", "Investments", "Current Assets", "Cash Ledger A/C.", "Stock-in-hand",
          "Suspense Account", "Misc. Expenses (Asset)", "Sales Account", "Purchase Account",
          "Income (Trading)", "Income", "Income (Other Then Sales)", "Expenses (Direct)",
          "Expense Account", "Partner Interest", "Partner Remuneration"
        ];
        const matchedSuper = standardSuperGroups.find(
          (s) => s.toLowerCase() === (oldSuper || "").trim().toLowerCase()
        );
        const newSuper = matchedSuper || oldSuper || "Current Assets";

        if (oldName !== newName || oldSuper !== newSuper) {
          group.groupName = newName;
          group.superGroup = newSuper;
          await group.save();
        }
      }
      console.log(`Normalized ${groups.length} account groups to uppercase.`);

      // 2. Convert all existing Ledgers to uppercase name & groupName
      const ledgers = await Ledger.find({ companyId: company._id });
      for (const ledger of ledgers) {
        const oldName = ledger.ledgerName;
        const newName = oldName.trim().toUpperCase();
        const oldGroup = ledger.groupName || "";
        const newGroup = oldGroup.trim().toUpperCase();

        let updated = false;
        if (oldName !== newName) {
          ledger.ledgerName = newName;
          updated = true;
        }
        if (oldGroup !== newGroup) {
          ledger.groupName = newGroup as any;
          updated = true;
        }
        if (updated) {
          await ledger.save();
        }
      }
      console.log(`Normalized ${ledgers.length} ledgers to uppercase.`);

      // 3. Apply Group Mapping for deprecations in Ledgers
      for (const ledger of ledgers) {
        const currentGroup = (ledger.groupName || "").toUpperCase();
        if (GROUP_MAPPING[currentGroup] && GROUP_MAPPING[currentGroup] !== currentGroup) {
          const targetGroup = GROUP_MAPPING[currentGroup];
          console.log(`Mapping ledger "${ledger.ledgerName}" group: ${currentGroup} -> ${targetGroup}`);
          ledger.groupName = targetGroup as any;
          await ledger.save();
        }
      }

      // 4. Update JournalEntries and BankCashEntries group names to remain in sync
      const jEntries = await JournalEntry.find({ companyId: company._id });
      for (const entry of jEntries) {
        let updated = false;
        if (entry.debitGroup) {
          const dgUpper = entry.debitGroup.trim().toUpperCase();
          const resolved = GROUP_MAPPING[dgUpper] || dgUpper;
          if (entry.debitGroup !== resolved) {
            entry.debitGroup = resolved;
            updated = true;
          }
        }
        if (entry.creditGroup) {
          const cgUpper = entry.creditGroup.trim().toUpperCase();
          const resolved = GROUP_MAPPING[cgUpper] || cgUpper;
          if (entry.creditGroup !== resolved) {
            entry.creditGroup = resolved;
            updated = true;
          }
        }
        if (entry.items && entry.items.length > 0) {
          for (const item of entry.items) {
            if (item.groupName) {
              const igUpper = item.groupName.trim().toUpperCase();
              const resolved = GROUP_MAPPING[igUpper] || igUpper;
              if (item.groupName !== resolved) {
                item.groupName = resolved;
                updated = true;
              }
            }
          }
        }
        if (updated) {
          await entry.save();
        }
      }

      const bcEntries = await BankCashEntry.find({ companyId: company._id });
      for (const entry of bcEntries) {
        let updated = false;
        if (entry.contraAccountGroup) {
          const cgUpper = entry.contraAccountGroup.trim().toUpperCase();
          const resolved = GROUP_MAPPING[cgUpper] || cgUpper;
          if (entry.contraAccountGroup !== resolved) {
            entry.contraAccountGroup = resolved;
            updated = true;
          }
        }
        if (updated) {
          await entry.save();
        }
      }

      // 5. Delete unused/deprecated groups
      const allSeedNames = DEFAULT_GROUPS_SEEDS.map((g) => g.groupName);
      const groupsToDelete = await AccountGroup.find({
        companyId: company._id,
        groupName: { $nin: allSeedNames }
      });
      if (groupsToDelete.length > 0) {
        console.log(`Deleting ${groupsToDelete.length} deprecated account groups.`);
        await AccountGroup.deleteMany({
          companyId: company._id,
          groupName: { $nin: allSeedNames }
        });
      }

      // 6. Seed missing default groups from DEFAULT_GROUPS_SEEDS
      let seededCount = 0;
      for (const seed of DEFAULT_GROUPS_SEEDS) {
        const exists = await AccountGroup.findOne({
          companyId: company._id,
          groupName: seed.groupName
        });
        if (!exists) {
          await AccountGroup.create({
            companyId: company._id,
            groupName: seed.groupName,
            superGroup: seed.superGroup
          });
          seededCount++;
        }
      }
      console.log(`Seeded ${seededCount} missing default account groups.`);

      // 7. Delete default ledgers that are high-level categories to avoid duplicates
      const ledgersToDelete = await Ledger.find({
        companyId: company._id,
        ledgerName: { $in: EXCLUDED_LEDGER_GROUPS }
      });
      if (ledgersToDelete.length > 0) {
        console.log(`Deleting ${ledgersToDelete.length} high-level category ledgers to avoid duplicate conflicts.`);
        await Ledger.deleteMany({
          companyId: company._id,
          ledgerName: { $in: EXCLUDED_LEDGER_GROUPS }
        });
      }
    }

    console.log("\n========================================");
    console.log("Database Migration Completed Successfully!");
    console.log("========================================");

  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Database connection closed.");
  }
}

runMigration();
