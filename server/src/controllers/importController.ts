import { Response } from "express";
import { Types } from "mongoose";
import { ImportedTransaction } from "../models/ImportedTransaction";
import { BankCashEntry } from "../models/BankCashEntry";
import { Ledger } from "../models/Ledger";
import { BankCashAccount } from "../models/BankCashAccount";
import { AuthenticatedRequest } from "../middleware/auth";
import { syncBankCashAccountFromLedger } from "./ledgerController";

export async function getImportedTransactions(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const query: any = { companyId: req.companyId };
    if (req.financialYear) {
      query.date = { $gte: req.financialYear.startDate, $lte: req.financialYear.endDate };
    }
    const txns = await ImportedTransaction.find(query).sort({ importedAt: -1 });
    res.json(txns);
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to retrieve imported transactions" });
  }
}

function normalizeAndMapGroup(rawGroup: string): string {
  if (!rawGroup) return "EXPENSE ACCOUNT";
  const groupUpper = rawGroup.trim().toUpperCase();

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

  const standardGroups = [
    "DIRECT EXPENSES", "INCOME (TRADING)", "PURCHASE ACCOUNT", "SALES ACCOUNT",
    "EXPENSE ACCOUNT", "FINANCIAL EXPENSES", "INCOME", "INCOME (OTHER THEN SALES)",
    "INDIRECT EXPENSES", "PARTNER INTEREST", "PARTNER REMUNERATION", "ADVANCES FROM CUSTOMERS",
    "BANK ACCOUNTS (BANKS)", "BANK OCC A/C", "CAPITAL ACCOUNT", "CASH LEDGER A/C.",
    "CASH-IN-HAND", "CURRENT CAPITAL ACCOUNT", "CURRENT LIABILITIES", "DEPOSITS (ASSET)",
    "DUTIES & TAXES", "FIXED ASSETS", "INVESTMENTS", "LOANS & ADVANCES (ASSET)",
    "LOANS (LIABILITY)", "MISC. EXPENSES (ASSET)", "PROFIT & LOSS A/C", "PROVISIONS",
    "RESERVES & SURPLUS", "SALARY EXPENSES PAYABLE", "SECURED LOANS", "STOCK-IN-HAND",
    "SUNDRY CREDITORS", "SUNDRY CREDITORS - MATERIAL", "SUNDRY CREDITORS - SERVICES",
    "SUNDRY DEBTORS", "SUSPENSE ACCOUNT", "UNSECURED LOANS"
  ];

  const mapped = GROUP_MAPPING[groupUpper] || groupUpper;
  return standardGroups.includes(mapped) ? mapped : "EXPENSE ACCOUNT";
}

export async function saveImportedTransactions(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { rows, accountId, bankName, statementOpeningBalance } = req.body;
  try {
    if (!rows || !Array.isArray(rows)) {
      res.status(400).json({ message: "rows array is required" });
      return;
    }

    const companyObjId = new Types.ObjectId(req.companyId as string);

    // ── Helper: resolve or auto-create a BankCashAccount by name ────────────
    const accountCache = new Map<string, string>(); // name.upper -> _id string

    async function resolveAccount(name: string): Promise<string | null> {
      const key = name.trim().toUpperCase();
      if (accountCache.has(key)) return accountCache.get(key)!;

      let acc = await BankCashAccount.findOne({
        name: { $regex: new RegExp(`^${key}$`, "i") },
        companyId: req.companyId,
      });

      if (!acc) {
        acc = new BankCashAccount({
          name: key,
          group: "Bank",
          openingBalance: 0,
          companyId: req.companyId,
        });
        await acc.save();
      }

      const id = acc._id.toString();
      accountCache.set(key, id);
      return id;
    }

    // ── Determine per-row target accountId ───────────────────────────────────
    // A row with row.bankName uses it to resolve its own account.
    // Otherwise fall back to the global accountId / bankName.
    let globalTargetAccountId: string | null = null;

    if (accountId === "direct-import") {
      // Direct Import mode: each row carries its own bankName — no global account needed
      globalTargetAccountId = null;
    } else if (accountId && accountId !== "auto-create" && Types.ObjectId.isValid(accountId)) {
      // Update opening balance if needed
      const acc = await BankCashAccount.findOne({ _id: accountId, companyId: req.companyId });
      if (acc && statementOpeningBalance !== undefined && acc.openingBalance === 0) {
        acc.openingBalance = statementOpeningBalance;
        await acc.save();
      }
      globalTargetAccountId = accountId;
    } else if (accountId === "auto-create" || !accountId) {
      if (bankName && bankName.trim()) {
        globalTargetAccountId = await resolveAccount(bankName);
        // Update opening balance on global account
        if (globalTargetAccountId && statementOpeningBalance !== undefined) {
          const acc = await BankCashAccount.findOne({ _id: globalTargetAccountId, companyId: req.companyId });
          if (acc && acc.openingBalance === 0) {
            acc.openingBalance = statementOpeningBalance;
            await acc.save();
          }
        }
      }
    }

    const now = new Date();

    // ── Ensure contra ledgers exist ──────────────────────────────────────────
    const uniqueLedgers = new Map<string, string>();
    for (const r of rows) {
      if (r.aiAccountName?.trim() && r.aiAccountGroup?.trim()) {
        const finalGroup = normalizeAndMapGroup(r.aiAccountGroup);
        uniqueLedgers.set(r.aiAccountName.trim().toUpperCase(), finalGroup);
      }
    }

    for (const [nameUpper, groupName] of uniqueLedgers.entries()) {
      const exists = await Ledger.findOne({ ledgerName: nameUpper, companyId: req.companyId });
      if (!exists) {
        const newLedger = new Ledger({
          ledgerName: nameUpper,
          groupName,
          openingDr: 0,
          openingCr: 0,
          companyId: req.companyId,
        });
        await newLedger.save();
        await syncBankCashAccountFromLedger(newLedger);
      }
    }

    // ── Prepare entries with per-row accountId resolution ───────────────────
    const preparedEntries: any[] = [];
    const preparedImports: any[] = [];

    for (const r of rows) {
      // Resolve target bank account for this row
      let rowAccountId: string | null = null;
      if (r.bankName && r.bankName.trim()) {
        rowAccountId = await resolveAccount(r.bankName);
      } else {
        rowAccountId = globalTargetAccountId;
      }

      if (!rowAccountId) continue; // Skip rows with no target account

      // Validate: contra account must not be the same as the target bank account
      const rowAcc = await BankCashAccount.findOne({ _id: rowAccountId, companyId: req.companyId });
      if (rowAcc && r.aiAccountName && r.aiAccountName.trim().toLowerCase() === rowAcc.name.trim().toLowerCase()) {
        res.status(400).json({
          message: `Contra account cannot be the same as the Bank/Cash account: "${r.aiAccountName}" (${rowAcc.name})`,
        });
        return;
      }

      let cleanDate = (r.date || "").toString().trim();
      if (cleanDate.length > 10) cleanDate = cleanDate.slice(0, 10);

      const finalGroup = normalizeAndMapGroup(r.aiAccountGroup);

      preparedImports.push({
        date: r.date,
        narration: r.narration,
        withdrawal: r.withdrawal || 0,
        deposit: r.deposit || 0,
        accountName: r.aiAccountName ? r.aiAccountName.trim().toUpperCase() : "",
        accountGroup: finalGroup,
        importedAt: now,
        companyId: companyObjId,
      });

      preparedEntries.push({
        companyId: companyObjId,
        accountId: rowAccountId,
        date: cleanDate,
        particulars: r.narration,
        withdrawal: r.withdrawal || 0,
        deposit: r.deposit || 0,
        contraAccountName: r.aiAccountName ? r.aiAccountName.trim().toUpperCase() : "",
        contraAccountGroup: finalGroup,
      });
    }

    if (preparedEntries.length === 0) {
      res.status(400).json({ message: "No valid rows to import. Each row must have a valid bank/cash account." });
      return;
    }

    // ── Deduplicate ImportedTransaction entries ───────────────────────────────
    const existingImports = await ImportedTransaction.find(
      { companyId: { $in: [req.companyId, companyObjId] } },
      { date: 1, narration: 1, withdrawal: 1, deposit: 1, accountName: 1 }
    ).lean();

    const existingImportFingerprints = new Set(
      existingImports.map((e: any) =>
        `${e.date}||${(e.narration || "").trim().toLowerCase()}||${e.withdrawal}||${e.deposit}||${(e.accountName || "").trim().toUpperCase()}`
      )
    );

    const newImports = preparedImports.filter((e) => {
      const fp = `${e.date}||${(e.narration || "").trim().toLowerCase()}||${e.withdrawal}||${e.deposit}||${e.accountName}`;
      return !existingImportFingerprints.has(fp);
    });

    if (newImports.length > 0) {
      await ImportedTransaction.insertMany(newImports);
    }

    // ── Deduplicate BankCashEntry entries ────────────────────────────────────
    // Group entries by accountId for efficient dedup query
    const accountIds = [...new Set(preparedEntries.map((e) => e.accountId))];
    const existingEntries = await BankCashEntry.find(
      { accountId: { $in: accountIds }, companyId: { $in: [req.companyId, companyObjId] } },
      { date: 1, particulars: 1, withdrawal: 1, deposit: 1, accountId: 1 }
    ).lean();

    const existingFingerprints = new Set(
      existingEntries.map((e: any) =>
        `${e.accountId}||${e.date}||${(e.particulars || "").trim().toLowerCase()}||${e.withdrawal}||${e.deposit}`
      )
    );

    const newEntries = preparedEntries.filter((e) => {
      const fp = `${e.accountId}||${e.date}||${(e.particulars || "").trim().toLowerCase()}||${e.withdrawal}||${e.deposit}`;
      return !existingFingerprints.has(fp);
    });

    const skippedCount = preparedEntries.length - newEntries.length;

    if (newEntries.length === 0) {
      res.status(200).json({
        message: `All ${preparedEntries.length} entries already exist — no duplicates inserted.`,
        insertedCount: 0,
        skippedCount,
      });
      return;
    }

    const result = await BankCashEntry.insertMany(newEntries);
    res.status(201).json({
      inserted: result,
      insertedCount: result.length,
      skippedCount,
      message: skippedCount > 0
        ? `Imported ${result.length} new entries. Skipped ${skippedCount} duplicates.`
        : `Imported ${result.length} entries successfully.`,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to save imported transactions" });
  }
}

export async function parseStatementWithAI(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { fileBase64, fileName, rawText } = req.body;
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    res.status(500).json({ message: "OPENROUTER_API_KEY is not configured on the server." });
    return;
  }

  try {
    const ext = fileName?.split(".").pop()?.toLowerCase() ?? "";

    if (["png", "jpg", "jpeg", "webp"].includes(ext)) {
      if (!fileBase64) {
        res.status(400).json({ message: "fileBase64 is required for image files" });
        return;
      }
      const mediaType = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
      
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "X-Title": "Accounting SaaS",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `You are an expert accountant parsing a bank statement image.

CRITICAL RULES:
1. Extract ONLY actual financial transactions (money movements).
2. DO NOT include rows for "Opening Balance", "Closing Balance", "Balance B/F", "Balance C/F", "Brought Forward", "Carried Forward", or any balance summary rows.
3. Each transaction must appear EXACTLY ONCE — do not duplicate any row.
4. Do NOT include page headers, footers, or bank account info lines.
5. Date must be in YYYY-MM-DD format. Skip rows without a valid date.
6. Identify the Bank Name from the header. If not found, return "Unknown Bank".

Return ONLY a valid JSON object — no markdown, no code blocks:
{
  "bankName": "Name of the Bank",
  "transactions": [{"date":"YYYY-MM-DD","narration":"...","withdrawal":123.45,"deposit":0}, ...]
}`
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${mediaType};base64,${fileBase64}`
                  }
                }
              ],
            }
          ],
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error((err as any)?.error?.message ?? `API error ${response.status}`);
      }

      const data = await response.json();
      const text = data.choices[0].message.content as string;
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("Could not parse AI response as JSON");
      
      res.json(JSON.parse(jsonMatch[0]));

    } else if (ext === "pdf") {
      if (rawText) {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
            "X-Title": "Accounting SaaS",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              {
                role: "user",
                content: `You are an expert accountant parsing a bank statement that may span multiple pages.

CRITICAL RULES:
1. Extract ONLY actual financial transactions (money movements). 
2. DO NOT include rows for "Opening Balance", "Closing Balance", "Balance B/F", "Balance C/F", "Brought Forward", "Carried Forward", or any balance summary rows.
3. Each transaction must appear EXACTLY ONCE — if the same transaction appears on multiple pages (due to page carry-forward), include it only once.
4. Do NOT include page headers, page footers, or bank address/account number lines.
5. The date must be a real transaction date in YYYY-MM-DD format. Skip rows without a valid date.
6. Identify the Name of the Bank (e.g. "Bank of Baroda", "HDFC Bank", "State Bank of India") from the header. If not found, return "Unknown Bank".

Return ONLY a valid JSON object — no markdown, no code blocks:
{
  "bankName": "Name of the Bank",
  "transactions": [{"date":"YYYY-MM-DD","narration":"...","withdrawal":123.45,"deposit":0}, ...]
}

Bank Statement Text:
${rawText}`
              }
            ],
          }),
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error((err as any)?.error?.message ?? `API error ${response.status}`);
        }

        const data = await response.json();
        const text = data.choices[0].message.content as string;
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("Could not parse AI response as JSON");
        
        res.json(JSON.parse(jsonMatch[0]));
      } else if (fileBase64) {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
            "X-Title": "Accounting SaaS",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: `You are an expert accountant parsing a multi-page bank statement PDF.

CRITICAL RULES:
1. Extract ONLY actual financial transactions (money movements).
2. DO NOT include rows for "Opening Balance", "Closing Balance", "Balance B/F", "Balance C/F", "Brought Forward", "Carried Forward", or any balance summary rows.
3. Each transaction must appear EXACTLY ONCE — if the same transaction appears on multiple pages (page carry-forward), include it only ONCE.
4. Do NOT include page headers, footers, or bank account info lines.
5. Date must be in YYYY-MM-DD format. Skip rows without a valid date.
6. Identify the Bank Name from the header. If not found, return "Unknown Bank".

Return ONLY a valid JSON object — no markdown, no code blocks:
{
  "bankName": "Name of the Bank",
  "transactions": [{"date":"YYYY-MM-DD","narration":"...","withdrawal":123.45,"deposit":0}, ...]
}`
                  },
                  {
                    type: "image_url",
                    image_url: {
                      url: `data:application/pdf;base64,${fileBase64}`
                    }
                  }
                ]
              }
            ]
          })
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error((err as any)?.error?.message ?? `API error ${response.status}`);
        }

        const data = await response.json();
        const text = data.choices[0].message.content as string;
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("Could not parse AI response as JSON");
        
        res.json(JSON.parse(jsonMatch[0]));
      } else {
        res.status(400).json({ message: "Either rawText or fileBase64 is required for PDF files" });
      }
    } else {
      res.status(400).json({ message: "Unsupported file type" });
    }
  } catch (error: any) {
    console.error("AI statement parse error:", error);
    res.status(500).json({ message: error.message || "Failed to parse bank statement via AI" });
  }
}

function localEnrich(narrations: string[]): { accountName: string; accountGroup: string }[] {
  return narrations.map((n) => {
    const text = (n || "").toLowerCase();

    if (/swiggy|zomato|domino|starbucks|cafe|canteen|hotel|restaurant|diner|eats|food/i.test(text)) {
      return { accountName: "Food & Restaurant Expense", accountGroup: "EXPENSE ACCOUNT" };
    }
    if (/uber|ola|rapido|taxi|cab|travel|transport|metro|irctc|railway|flight/i.test(text)) {
      return { accountName: "Travel Expense", accountGroup: "EXPENSE ACCOUNT" };
    }
    if (/rent|lease|prestige estate/i.test(text)) {
      return { accountName: "Rent Expense", accountGroup: "EXPENSE ACCOUNT" };
    }
    if (/salary|payroll|wage|stipend/i.test(text)) {
      return { accountName: "Salary Expense", accountGroup: "EXPENSE ACCOUNT" };
    }
    if (/electricity|power|bescom|electric/i.test(text)) {
      return { accountName: "Electricity Expense", accountGroup: "EXPENSE ACCOUNT" };
    }
    if (/phone|tele|internet|airtel|jio|broadband|wifi/i.test(text)) {
      return { accountName: "Telephone & Internet Expense", accountGroup: "EXPENSE ACCOUNT" };
    }
    if (/charge|fee|commission|annual fee|chgs/i.test(text)) {
      return { accountName: "Bank Charges", accountGroup: "EXPENSE ACCOUNT" };
    }
    if (/interest|int\.? received|fd maturity/i.test(text)) {
      return { accountName: "Interest Income", accountGroup: "INCOME" };
    }
    if (/neft|rtgs|upi|transfer/i.test(text)) {
      return { accountName: "Suspense Account", accountGroup: "CURRENT LIABILITIES" };
    }
    return { accountName: "Suspense Account", accountGroup: "EXPENSE ACCOUNT" };
  });
}

export async function enrichWithOpenRouter(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { narrations } = req.body;
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!narrations || !Array.isArray(narrations)) {
    res.status(400).json({ message: "narrations array is required" });
    return;
  }

  if (!apiKey) {
    // Graceful fallback to rule-based mapping when API key is not configured
    const results = localEnrich(narrations);
    res.json(results);
    return;
  }

  try {
    const BATCH_SIZE = 30;
    const results: any[] = [];

    for (let i = 0; i < narrations.length; i += BATCH_SIZE) {
      const batch = narrations.slice(i, i + BATCH_SIZE);
      const prompt = `You are an Indian Accountant.

Based on these bank transaction narrations, suggest the accounting ledger account name and group for each.

Available Groups (use exactly one of these): DIRECT EXPENSES, INCOME (TRADING), PURCHASE ACCOUNT, SALES ACCOUNT, EXPENSE ACCOUNT, FINANCIAL EXPENSES, INCOME, INCOME (OTHER THEN SALES), INDIRECT EXPENSES, PARTNER INTEREST, PARTNER REMUNERATION, ADVANCES FROM CUSTOMERS, BANK ACCOUNTS (BANKS), BANK OCC A/C, CAPITAL ACCOUNT, CASH LEDGER A/C., CASH-IN-HAND, CURRENT CAPITAL ACCOUNT, CURRENT LIABILITIES, DEPOSITS (ASSET), DUTIES & TAXES, FIXED ASSETS, INVESTMENTS, LOANS & ADVANCES (ASSET), LOANS (LIABILITY), MISC. EXPENSES (ASSET), PROFIT & LOSS A/C, PROVISIONS, RESERVES & SURPLUS, SALARY EXPENSES PAYABLE, SECURED LOANS, SUNDRY CREDITORS, SUNDRY CREDITORS - MATERIAL, SUNDRY CREDITORS - SERVICES, SUNDRY DEBTORS, SUSPENSE ACCOUNT, UNSECURED LOANS

Specific Mapping Guidelines (Critical!):
- Payments to services like "Uber", "Ola", "Rapido", "Taxi", "Cab", etc. must be mapped to account name "Travel Expense" and group "EXPENSE ACCOUNT".
- Payments to "Swiggy", "Zomato", "Dominos", "Starbucks", cafes, diners, hotels, or other food/restaurant businesses must be mapped to account name "Food & Restaurant Expense" and group "EXPENSE ACCOUNT".
- Rent payments (e.g., "Rent", "Lease", "Prestige Estates") must be mapped to "Rent Expense" and group "EXPENSE ACCOUNT".
- Salaries/Wages (e.g., "Salary", "Payroll", "Pay") must be mapped to "Salary Expense" and group "EXPENSE ACCOUNT".
- Regular utility bills like electricity ("BESCOM", "Power", "Electricity"), phone/internet ("Airtel", "Jio", "Internet") must be mapped to "Electricity Expense" or "Telephone & Internet Expense" and group "EXPENSE ACCOUNT".
- Purchases of goods/materials must be mapped to account "Purchases" and group "PURCHASE ACCOUNT".
- Vendor payments (NEFT/RTGS/UPI to companies/businesses) that are not simple expenses must be mapped to "SUNDRY CREDITORS" group (with the vendor name as the account name, e.g. "Sigma Supplies Co" or "ABC Corp Ltd").
- Customer receipts (NEFT/RTGS/UPI from customers/businesses) must be mapped to "SUNDRY DEBTORS" group (with customer name as the account name).
- Asset purchases like computers, laptops, furniture must be mapped to group "FIXED ASSETS" (e.g. "Office Equipment").
- Taxes, TDS, GST payments must be mapped to group "CURRENT LIABILITIES" (e.g. "GST Payable" or "TDS Payable").
- Bank charges or interest paid must be mapped to "Bank Charges" and group "EXPENSE ACCOUNT".
- Interest received or FD maturity proceeds must be mapped to group "INCOME" (e.g. "Interest Income").

Return ONLY a valid JSON array with exactly ${batch.length} objects, one per narration in the same order:
[{"accountName":"...","accountGroup":"..."}, ...]

Narrations:
${batch.map((n, idx) => `${idx + 1}. ${n}`).join("\n")}`;

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "X-Title": "Accounting SaaS",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error((err as any)?.error?.message ?? `API error ${response.status}`);
      }

      const data = await response.json();
      const text = data.choices[0].message.content as string;

      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error("Could not parse AI response as JSON");

      const parsed = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed) || parsed.length !== batch.length) {
        throw new Error("AI returned unexpected number of results");
      }
      results.push(...parsed);
    }

    res.json(results);
  } catch (error: any) {
    console.error("AI narration enrichment error:", error);
    res.status(500).json({ message: error.message || "Failed to enrich narrations via AI" });
  }
}
