import { Response } from "express";
import { ImportedTransaction } from "../models/ImportedTransaction";
import { BankCashEntry } from "../models/BankCashEntry";
import { Ledger } from "../models/Ledger";
import { BankCashAccount } from "../models/BankCashAccount";
import { AuthenticatedRequest } from "../middleware/auth";

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

export async function saveImportedTransactions(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { rows, accountId, bankName, statementOpeningBalance } = req.body;
  try {
    if (!rows || !Array.isArray(rows)) {
      res.status(400).json({ message: "rows array is required" });
      return;
    }

    let targetAccountId = accountId;
    if ((accountId === "auto-create" || !accountId) && bankName) {
      // Auto-create BankCashAccount
      let acc = await BankCashAccount.findOne({
        name: { $regex: new RegExp(`^${bankName.trim()}$`, "i") },
        companyId: req.companyId
      });
      if (!acc) {
        acc = new BankCashAccount({
          name: bankName.trim(),
          group: "Bank",
          openingBalance: statementOpeningBalance || 0,
          companyId: req.companyId
        });
        await acc.save();
      }
      targetAccountId = acc._id.toString();
    }

    if (!targetAccountId) {
      res.status(400).json({ message: "accountId or a valid bankName is required to save transactions" });
      return;
    }

    const now = new Date();
    const preparedImport = rows.map((r: any) => ({
      date: r.date,
      narration: r.narration,
      withdrawal: r.withdrawal || 0,
      deposit: r.deposit || 0,
      accountName: r.aiAccountName,
      accountGroup: r.aiAccountGroup,
      importedAt: now,
      companyId: req.companyId
    }));

    await ImportedTransaction.insertMany(preparedImport);

    // Ensure all unique ledgers are created in the Ledger master
    const uniqueLedgers = new Map<string, string>(); // ledgerName (lowercase) -> groupName
    for (const r of rows) {
      if (r.aiAccountName?.trim() && r.aiAccountGroup?.trim()) {
        uniqueLedgers.set(r.aiAccountName.trim().toLowerCase(), r.aiAccountGroup.trim());
      }
    }

    for (const [nameLower, groupName] of uniqueLedgers.entries()) {
      const originalName = rows.find(r => r.aiAccountName?.trim().toLowerCase() === nameLower)?.aiAccountName.trim();
      if (!originalName) continue;

      const exists = await Ledger.findOne({
        ledgerName: { $regex: new RegExp(`^${originalName}$`, "i") },
        companyId: req.companyId
      });

      if (!exists) {
        const newLedger = new Ledger({
          ledgerName: originalName,
          groupName,
          openingDr: 0,
          openingCr: 0,
          companyId: req.companyId
        });
        await newLedger.save();
      }
    }

    const preparedEntries = rows.map((r: any) => ({
      companyId: req.companyId,
      accountId: targetAccountId,
      date: r.date,
      particulars: r.narration,
      withdrawal: r.withdrawal || 0,
      deposit: r.deposit || 0,
      contraAccountName: r.aiAccountName,
      contraAccountGroup: r.aiAccountGroup
    }));

    const result = await BankCashEntry.insertMany(preparedEntries);
    res.status(201).json(result);
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
                  text: `You are an expert accountant. Extract all transactions from this bank statement image. Also, identify the Name of the Bank (e.g. "Bank of Baroda", "HDFC Bank", "State Bank of India", etc.) from the header. If it cannot be identified, return "Unknown Bank".
 
Return ONLY a valid JSON object in the following format, and nothing else. Do not wrap in markdown code blocks:
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
                content: `You are an expert accountant. Extract all transactions from this bank statement text. Also, identify the Name of the Bank (e.g. "Bank of Baroda", "HDFC Bank", "State Bank of India", etc.) from the text header. If it cannot be identified, return "Unknown Bank".

Ensure you extract every single transaction row from the text.
Return ONLY a valid JSON object in the following format, and nothing else. Do not wrap in markdown code blocks:
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
                    text: `You are an expert accountant. Extract all transactions from this bank statement document. Also, identify the Name of the Bank (e.g. "Bank of Baroda", "HDFC Bank", "State Bank of India", etc.) from the header. If it cannot be identified, return "Unknown Bank".
 
Return ONLY a valid JSON object in the following format, and nothing else. Do not wrap in markdown code blocks:
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
      return { accountName: "Food & Restaurant Expense", accountGroup: "Expense" };
    }
    if (/uber|ola|rapido|taxi|cab|travel|transport|metro|irctc|railway|flight/i.test(text)) {
      return { accountName: "Travel Expense", accountGroup: "Expense" };
    }
    if (/rent|lease|prestige estate/i.test(text)) {
      return { accountName: "Rent Expense", accountGroup: "Expense" };
    }
    if (/salary|payroll|wage|stipend/i.test(text)) {
      return { accountName: "Salary Expense", accountGroup: "Expense" };
    }
    if (/electricity|power|bescom|electric/i.test(text)) {
      return { accountName: "Electricity Expense", accountGroup: "Expense" };
    }
    if (/phone|tele|internet|airtel|jio|broadband|wifi/i.test(text)) {
      return { accountName: "Telephone & Internet Expense", accountGroup: "Expense" };
    }
    if (/charge|fee|commission|annual fee|chgs/i.test(text)) {
      return { accountName: "Bank Charges", accountGroup: "Expense" };
    }
    if (/interest|int\.? received|fd maturity/i.test(text)) {
      return { accountName: "Interest Income", accountGroup: "Income" };
    }
    if (/neft|rtgs|upi|transfer/i.test(text)) {
      return { accountName: "Suspense Account", accountGroup: "Liabilities" };
    }
    return { accountName: "Suspense Account", accountGroup: "Expense" };
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
    const prompt = `You are an Indian Accountant.

Based on these bank transaction narrations, suggest the accounting ledger account name and group for each.

Available Groups (use exactly one of these): Assets, Liabilities, Capital, Income, Expense, Bank, Cash, Purchases, Sales, Sundry Debtors, Sundry Creditors

Specific Mapping Guidelines (Critical!):
- Payments to services like "Uber", "Ola", "Rapido", "Taxi", "Cab", etc. must be mapped to account name "Travel Expense" and group "Expense".
- Payments to "Swiggy", "Zomato", "Dominos", "Starbucks", cafes, diners, hotels, or other food/restaurant businesses must be mapped to account name "Food & Restaurant Expense" and group "Expense".
- Rent payments (e.g., "Rent", "Lease", "Prestige Estates") must be mapped to "Rent Expense" and group "Expense".
- Salaries/Wages (e.g., "Salary", "Payroll", "Pay") must be mapped to "Salary Expense" and group "Expense".
- Regular utility bills like electricity ("BESCOM", "Power", "Electricity"), phone/internet ("Airtel", "Jio", "Internet") must be mapped to "Electricity Expense" or "Telephone & Internet Expense" and group "Expense".
- Purchases of goods/materials must be mapped to account "Purchases" and group "Purchases".
- Vendor payments (NEFT/RTGS/UPI to companies/businesses) that are not simple expenses must be mapped to "Sundry Creditors" group (with the vendor name as the account name, e.g. "Sigma Supplies Co" or "ABC Corp Ltd").
- Customer receipts (NEFT/RTGS/UPI from customers/businesses) must be mapped to "Sundry Debtors" group (with customer name as the account name).
- Asset purchases like computers, laptops, furniture must be mapped to group "Assets" (e.g. "Office Equipment").
- Taxes, TDS, GST payments must be mapped to group "Liabilities" (e.g. "GST Payable" or "TDS Payable").
- Bank charges or interest paid must be mapped to "Bank Charges" and group "Expense".
- Interest received or FD maturity proceeds must be mapped to group "Income" (e.g. "Interest Income").

Return ONLY a valid JSON array with exactly ${narrations.length} objects, one per narration in the same order:
[{"accountName":"...","accountGroup":"..."}, ...]

Narrations:
${narrations.map((n, i) => `${i + 1}. ${n}`).join("\n")}`;

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
    if (!Array.isArray(parsed) || parsed.length !== narrations.length) {
      throw new Error("AI returned unexpected number of results");
    }

    res.json(parsed);
  } catch (error: any) {
    console.error("AI narration enrichment error:", error);
    res.status(500).json({ message: error.message || "Failed to enrich narrations via AI" });
  }
}
