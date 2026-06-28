import { useState, useCallback, useMemo, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  ModuleRegistry, AllCommunityModule,
  type ColDef, type ICellRendererParams,
} from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import {
  Upload, FileText, CheckCircle2, ChevronRight, FileSpreadsheet,
  Sparkles, AlertTriangle, RefreshCw, Trash2, Eye, Save,
  Key, X, Bot, TrendingUp, TrendingDown, Info, Image,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  parseExcel, parsePDF, parseStatementWithAI, enrichWithOpenRouter, saveImportedTransactions,
  detectBankNameFromText, extractPDFText,
  SAMPLE_TRANSACTIONS,
  type ImportRow, type RawTransaction,
} from "../api/bankImportApi";
import { LEDGER_GROUPS } from "../api/ledgerApi";
import { getAllAccounts, createAccount, type BankCashAccount } from "../api/bankCashBookApi";

ModuleRegistry.registerModules([AllCommunityModule]);

// ── Helpers ───────────────────────────────────────────────────────────────────
const uid = () => `imp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const fmt = (n: number) =>
  n === 0 ? "—" : "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const GROUP_COLORS: Record<string, string> = {
  "CURRENT ASSETS": "bg-blue-50 text-blue-700 border-blue-200",
  "FIXED ASSETS": "bg-blue-50 text-blue-700 border-blue-200",
  "CURRENT LIABILITIES": "bg-red-50 text-red-700 border-red-200",
  "CAPITAL ACCOUNT": "bg-purple-50 text-purple-700 border-purple-200",
  "INCOME": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "INCOME (TRADING)": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "EXPENSE ACCOUNT": "bg-orange-50 text-orange-700 border-orange-200",
  "DIRECT EXPENSES": "bg-orange-50 text-orange-700 border-orange-200",
  "INDIRECT EXPENSES": "bg-orange-50 text-orange-700 border-orange-200",
  "BANK ACCOUNTS (BANKS)": "bg-cyan-50 text-cyan-700 border-cyan-200",
  "CASH-IN-HAND": "bg-amber-50 text-amber-700 border-amber-200",
  "PURCHASE ACCOUNT": "bg-lime-50 text-lime-700 border-lime-200",
  "SALES ACCOUNT": "bg-teal-50 text-teal-700 border-teal-200",
  "SUNDRY DEBTORS": "bg-indigo-50 text-indigo-700 border-indigo-200",
  "SUNDRY CREDITORS": "bg-pink-50 text-pink-700 border-pink-200",
};

function toImportRows(txns: RawTransaction[]): ImportRow[] {
  return txns.map((t) => ({ ...t, id: uid(), aiAccountName: "", aiAccountGroup: "", aiStatus: "idle" as const }));
}

// Deduplicate raw transactions by fingerprint (date + narration + withdrawal + deposit)
// Bank statements sometimes have per-page opening/closing totals that get repeated.
// NOTE: This is conservative — only removes duplicates that appear 3+ times (likely page carry-forward)
// OR when the overall duplicate rate is very high (>50% indicating systematic repetition).
function deduplicateTransactions(txns: RawTransaction[]): RawTransaction[] {
  // Count occurrences of each fingerprint
  const fpCount = new Map<string, number>();
  for (const t of txns) {
    const fp = `${t.date}||${(t.narration || "").trim().toLowerCase()}||${t.withdrawal}||${t.deposit}`;
    fpCount.set(fp, (fpCount.get(fp) ?? 0) + 1);
  }
  
  // Calculate overall duplicate rate
  const totalDups = [...fpCount.values()].reduce((sum, c) => sum + Math.max(0, c - 1), 0);
  const dupRate = txns.length > 0 ? totalDups / txns.length : 0;
  
  // Only deduplicate if rate is high (systematic page repetition) OR entries appear 3+ times
  const shouldDedupe = dupRate > 0.4;
  
  if (!shouldDedupe) {
    // Just remove entries that appear 3+ times (clear page-carry-forward artifacts)
    const seen = new Map<string, number>();
    return txns.filter((t) => {
      const fp = `${t.date}||${(t.narration || "").trim().toLowerCase()}||${t.withdrawal}||${t.deposit}`;
      const count = fpCount.get(fp) ?? 1;
      if (count < 3) return true; // Keep all entries that appear 1-2 times
      const seenCount = seen.get(fp) ?? 0;
      seen.set(fp, seenCount + 1);
      return seenCount === 0; // Keep only first occurrence of 3+ duplicates
    });
  }
  
  // High duplicate rate: remove all duplicates (AI repeated the whole statement)
  const seen = new Set<string>();
  return txns.filter((t) => {
    const fp = `${t.date}||${(t.narration || "").trim().toLowerCase()}||${t.withdrawal}||${t.deposit}`;
    if (seen.has(fp)) return false;
    seen.add(fp);
    return true;
  });
}

const isOpeningBalRow = (narration: string) =>
  /opening\s*balance|bal\s*b\/f|balance\s*b\/f|brought\s*forward|closing\s*balance|balance\s*c\/f|carried\s*forward/i.test(narration);

// ── Inline group cell editor ──────────────────────────────────────────────────
const GroupCellEditor = forwardRef(function GroupCellEditor(props: any, ref) {
  const [val, setVal] = useState<string>(props.value ?? "EXPENSE ACCOUNT");
  const selRef = useRef<HTMLSelectElement>(null);
  useEffect(() => { selRef.current?.focus(); }, []);
  useImperativeHandle(ref, () => ({ getValue: () => val }));
  return (
    <select
      ref={selRef}
      value={val}
      onChange={(e) => setVal(e.target.value)}
      className="w-full h-full px-2 text-sm outline-none border-2 border-indigo-400 bg-white"
    >
      {LEDGER_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
    </select>
  );
});

// ── Step indicator ────────────────────────────────────────────────────────────
const STEPS = ["Upload File", "AI Processing", "Preview & Edit", "Import Done"];

function StepBar({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {STEPS.map((s, i) => (
        <div key={s} className="flex items-center gap-1">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            step === i ? "bg-indigo-600 text-white" :
            step > i  ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
            "bg-white text-slate-400 border border-slate-200"
          }`}>
            {step > i ? <CheckCircle2 size={12} /> : <span className="w-4 text-center">{i + 1}</span>}
            {s}
          </div>
          {i < STEPS.length - 1 && <ChevronRight size={14} className="text-slate-300 flex-shrink-0" />}
        </div>
      ))}
    </div>
  );
}



// ── Main ──────────────────────────────────────────────────────────────────────
export default function BankImport({ onClose, onImportComplete }: { onClose?: () => void; onImportComplete?: () => void } = {}) {
  const [step, setStep]         = useState(0);
  const [dragging, setDragging] = useState(false);
  const [file, setFile]         = useState<File | null>(null);
  const [rows, setRows]         = useState<ImportRow[]>([]);
  const [parsing, setParsing]   = useState(false);
  const [aiLoading, setAiLoading]   = useState(false);
  const [aiProgress, setAiProgress] = useState(0);
  const [parseError, setParseError] = useState<string | null>(null);
  const gridRef = useRef<AgGridReact<ImportRow>>(null);
  const [accounts, setAccounts]         = useState<BankCashAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("auto-create");
  const [detectedBankName, setDetectedBankName] = useState<string>("");

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newAccName, setNewAccName]         = useState("");
  const [newAccGroup, setNewAccGroup]       = useState<"Bank" | "Cash">("Bank");
  const [newAccBal, setNewAccBal]           = useState("");
  const [creatingAcc, setCreatingAcc]       = useState(false);
  const [savingTxns, setSavingTxns]         = useState(false);


  const [selectedRows, setSelectedRows] = useState<ImportRow[]>([]);
  const [bulkAccName, setBulkAccName] = useState("");
  const [bulkAccGroup, setBulkAccGroup] = useState("");

  useEffect(() => {
    getAllAccounts()
      .then((accs) => {
        setAccounts(accs);
      })
      .catch(() => toast.error("Failed to load Bank/Cash accounts"));
  }, []);

  useEffect(() => {
    if (selectedAccountId === "auto-create") {
      setRows((prev) =>
        prev.map((r) =>
          isOpeningBalRow(r.narration)
            ? { ...r, deposit: 0, withdrawal: 0 }
            : r
        )
      );
      return;
    }
    const acc = accounts.find((a) => a._id === selectedAccountId);
    if (acc) {
      const bal = acc.openingBalance || 0;
      setRows((prev) =>
        prev.map((r) =>
          isOpeningBalRow(r.narration)
            ? {
                ...r,
                deposit: bal >= 0 ? bal : 0,
                withdrawal: bal < 0 ? Math.abs(bal) : 0,
              }
            : r
        )
      );
    }
  }, [selectedAccountId, accounts]);

  // ── Accept file ──────────────────────────────────────────────────────────
  const acceptFile = useCallback((f: File) => {
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    if (!["xlsx", "xls", "pdf", "png", "jpg", "jpeg", "webp"].includes(ext)) {
      toast.error("Only Excel (.xlsx/.xls), PDF, or image files (PNG, JPG, JPEG, WebP) are supported");
      return;
    }
    setFile(f);
    setParseError(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) acceptFile(f);
  }, [acceptFile]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) acceptFile(f);
  };

  // ── Run AI ────────────────────────────────────────────────────────────────
  const runAI = useCallback(async (inputRows: ImportRow[]) => {
    setAiLoading(true);
    setAiProgress(0);
    setRows(inputRows.map((r) => ({ ...r, aiStatus: "loading" as const })));

    const progressInterval = setInterval(() => {
      setAiProgress((p) => Math.min(p + 3, 88));
    }, 250);

    try {
      const activeRows = inputRows.filter((r) => !isOpeningBalRow(r.narration));
      const narrations = activeRows.map((r) => r.narration);
      const matches    = narrations.length > 0 ? await enrichWithOpenRouter(narrations) : [];
      clearInterval(progressInterval);
      setAiProgress(100);

      let activeIdx = 0;
      const enriched: ImportRow[] = inputRows.map((r) => {
        if (isOpeningBalRow(r.narration)) {
          return {
            ...r,
            aiAccountName: "",
            aiAccountGroup: "",
            aiStatus: "done" as const,
          };
        }
        const match = matches[activeIdx++];
        return {
          ...r,
          aiAccountName:  match?.accountName  ?? "",
          aiAccountGroup: match?.accountGroup ?? "",
          aiStatus: "done" as const,
        };
      });
      setRows(enriched);
      setStep(2);
      toast.success(`AI suggested accounts for ${matches.length} transactions`);
    } catch (err: any) {
      clearInterval(progressInterval);
      setRows(inputRows.map((r) => ({ ...r, aiStatus: "error" as const })));
      setStep(2);
      toast.error(`AI error: ${err.message}`);
    } finally {
      setAiLoading(false);
    }
  }, []);

  // ── Parse file ────────────────────────────────────────────────────────────
  const parseFile = useCallback(async (f: File) => {
    setParsing(true);
    setParseError(null);
    try {
      const ext  = f.name.split(".").pop()?.toLowerCase() ?? "";
      let txns: RawTransaction[] = [];
      let parsedBankName = "";

      if (["png", "jpg", "jpeg", "webp"].includes(ext)) {
        const res = await parseStatementWithAI(f);
        txns = res.transactions;
        parsedBankName = res.bankName;
      } else if (ext === "pdf") {
        // Always use local parser for PDFs — AI hallucinated and duplicated entries.
        // extractPDFText deduplicates lines across pages, giving correct transaction counts.
        const rawText = await extractPDFText(f);
        txns = await parsePDF(f);
        parsedBankName = detectBankNameFromText(rawText);
      } else {
        txns = await parseExcel(f);
      }

      if (txns.length === 0) {
        setParseError("No transactions found. Check that the statement is clear and has valid headers.");
        return;
      }

      // ── Deduplicate: remove repeated rows (page headers/footers repeated by AI) ──
      const beforeCount = txns.length;
      txns = deduplicateTransactions(txns);
      const dupsRemoved = beforeCount - txns.length;
      if (dupsRemoved > 0) {
        console.info(`[BankImport] Removed ${dupsRemoved} duplicate rows (${beforeCount} → ${txns.length})`);
      }

      let initialBal = 0;
      if (parsedBankName) {
        setDetectedBankName(parsedBankName);
        const matched = accounts.find(
          (acc) => acc.name.trim().toLowerCase() === parsedBankName.trim().toLowerCase()
        );
        if (matched) {
          setSelectedAccountId(matched._id);
          initialBal = matched.openingBalance || 0;
          toast.success(`Detected ${parsedBankName} - Auto-selected matched account`);
        } else {
          setSelectedAccountId("auto-create");
          toast.success(`Detected ${parsedBankName} - Set to Auto-create account`);
        }
      }

      const cleanTxns = txns.filter((t) => !isOpeningBalRow(t.narration));
      const prepared = toImportRows(cleanTxns);
      const firstTxnDate = prepared[0]?.date || new Date().toISOString().slice(0, 10);
      const opRow: ImportRow = {
        id: uid(),
        date: firstTxnDate,
        narration: "Opening Balance",
        withdrawal: initialBal < 0 ? Math.abs(initialBal) : 0,
        deposit: initialBal >= 0 ? initialBal : 0,
        aiAccountName: "",
        aiAccountGroup: "",
        aiStatus: "done" as const,
      };
      prepared.unshift(opRow);
      setRows(prepared);
      setStep(1);
      await runAI(prepared);
    } catch (err: any) {
      setParseError(err?.message ?? "Failed to parse file");
    } finally {
      setParsing(false);
    }
  }, [runAI, accounts]);

  // ── Create Account ────────────────────────────────────────────────────────
  const handleCreateAccount = useCallback(async () => {
    if (!newAccName.trim()) {
      toast.error("Please enter a bank/cash account name");
      return;
    }
    setCreatingAcc(true);
    try {
      const payload = {
        name: newAccName.trim(),
        group: newAccGroup,
        openingBalance: parseFloat(newAccBal) || 0
      };
      const newAcc = await createAccount(payload);
      setAccounts((prev) => [...prev, newAcc].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedAccountId(newAcc._id);
      setShowCreateForm(false);
      setNewAccName("");
      setNewAccBal("");
      toast.success(`Account "${newAcc.name}" created and selected!`);
      const bal = newAcc.openingBalance || 0;
      setRows((prev) =>
        prev.map((r) =>
          isOpeningBalRow(r.narration)
            ? {
                ...r,
                deposit: bal >= 0 ? bal : 0,
                withdrawal: bal < 0 ? Math.abs(bal) : 0,
              }
            : r
        )
      );
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || "Failed to create account");
    } finally {
      setCreatingAcc(false);
    }
  }, [newAccName, newAccGroup, newAccBal]);

  // ── Load sample ───────────────────────────────────────────────────────────
  const loadSample = useCallback(async () => {
    const sampleRows = toImportRows(SAMPLE_TRANSACTIONS);
    const hasOpBal = sampleRows.some((r) => isOpeningBalRow(r.narration));
    if (!hasOpBal) {
      const firstTxnDate = sampleRows[0]?.date || new Date().toISOString().slice(0, 10);
      const opRow: ImportRow = {
        id: uid(),
        date: firstTxnDate,
        narration: "Opening Balance",
        withdrawal: 0,
        deposit: 0,
        aiAccountName: "",
        aiAccountGroup: "",
        aiStatus: "done" as const,
      };
      sampleRows.unshift(opRow);
    }
    setFile(new File([], "sample_hdfc_statement.xlsx"));
    setRows(sampleRows);
    setStep(1);
    await runAI(sampleRows);
  }, [runAI]);

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!selectedAccountId) {
      toast.error("Please select a target Bank/Cash account first");
      return;
    }
    if (selectedAccountId === "auto-create" && !detectedBankName.trim()) {
      toast.error("A bank name is required to auto-create a bank account. Please select an existing bank account or enter a name.");
      return;
    }
    const activeTxns = rows.filter((r) => !isOpeningBalRow(r.narration));
    const incomplete = activeTxns.filter((r) => !r.aiAccountName.trim() || !r.aiAccountGroup.trim());
    if (incomplete.length > 0) {
      toast.error(`${incomplete.length} rows still need Account Name and Group`);
      return;
    }

    const selectedAccount = accounts.find((a) => a._id === selectedAccountId);
    const targetAccountName = (selectedAccount ? selectedAccount.name : detectedBankName || "").trim().toLowerCase();
    const sameAccountRow = activeTxns.find((r) => r.aiAccountName.trim().toLowerCase() === targetAccountName);
    if (sameAccountRow) {
      toast.error(`Contra account cannot be the same as the destination Bank/Cash account: "${sameAccountRow.aiAccountName}"`);
      return;
    }

    setSavingTxns(true);
    try {
      const firstOpRow = rows.find((r) => isOpeningBalRow(r.narration));
      const opBal = firstOpRow
        ? (firstOpRow.deposit || 0) - (firstOpRow.withdrawal || 0)
        : 0;

      await saveImportedTransactions(activeTxns, selectedAccountId, detectedBankName, opBal);
      setStep(3);
      toast.success(`${activeTxns.length} transactions saved`);
    } catch (err: any) {
      toast.error(err?.message || "Failed to save transactions");
    } finally {
      setSavingTxns(false);
    }
  }, [rows, selectedAccountId, detectedBankName]);


  // ── Delete row ────────────────────────────────────────────────────────────
  const deleteRow = useCallback((id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const updateSelectedRows = useCallback((api: any) => {
    const visibleSelected: ImportRow[] = [];
    api.forEachNodeAfterFilterAndSort((node: any) => {
      if (node.isSelected() && node.data) {
        visibleSelected.push(node.data);
      }
    });
    setSelectedRows(visibleSelected);
  }, []);

  const onSelectionChanged = useCallback((event: any) => {
    updateSelectedRows(event.api);
  }, [updateSelectedRows]);

  const onFilterChanged = useCallback((event: any) => {
    updateSelectedRows(event.api);
  }, [updateSelectedRows]);

  const handleApplyBulkEdit = useCallback(() => {
    if (!bulkAccName.trim() && !bulkAccGroup) {
      toast.error("Please enter an Account Name or select an Account Group to apply");
      return;
    }

    setRows((prev) =>
      prev.map((r) => {
        const isSelected = selectedRows.some((sr) => sr.id === r.id);
        if (isSelected && !isOpeningBalRow(r.narration)) {
          return {
            ...r,
            aiAccountName: bulkAccName.trim() ? bulkAccName.trim() : r.aiAccountName,
            aiAccountGroup: bulkAccGroup ? bulkAccGroup : r.aiAccountGroup,
          };
        }
        return r;
      })
    );

    // Clear selection after applying
    gridRef.current?.api.deselectAll();
    setSelectedRows([]);
    setBulkAccName("");
    setBulkAccGroup("");
    toast.success(`Updated ${selectedRows.length} selected transactions`);
  }, [selectedRows, bulkAccName, bulkAccGroup]);

  // ── Inline edit ───────────────────────────────────────────────────────────
  const onCellEditingStopped = useCallback((e: any) => {
    const { data, column, newValue } = e;
    if (!data) return;
    
    let parsedValue = newValue;
    if (column.colId === "withdrawal" || column.colId === "deposit") {
      parsedValue = parseFloat(newValue) || 0;
    }
    
    setRows((prev) => prev.map((r) => r.id === data.id ? { ...r, [column.colId]: parsedValue } : r));
  }, []);

  // ── Summary ───────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total:       rows.length,
    aiDone:      rows.filter((r) => r.aiStatus === "done").length,
    filled:      rows.filter((r) => r.aiAccountName.trim()).length,
    deposits:    rows.reduce((s, r) => s + r.deposit,    0),
    withdrawals: rows.reduce((s, r) => s + r.withdrawal, 0),
  }), [rows]);

  const rowsWithBalance = useMemo(() => {
    const selectedAccount = accounts.find((a) => a._id === selectedAccountId);
    const openingBalance = selectedAccount ? selectedAccount.openingBalance : 0;
    
    const firstOpRow = rows.find((r) => isOpeningBalRow(r.narration));
    const statementOpeningBalance = firstOpRow
      ? (firstOpRow.deposit || 0) - (firstOpRow.withdrawal || 0)
      : null;

    let running = statementOpeningBalance !== null ? statementOpeningBalance : openingBalance;

    return rows.map((r) => {
      if (isOpeningBalRow(r.narration)) {
        return {
          ...r,
          withdrawal: r.withdrawal,
          deposit: r.deposit,
          balance: running,
        };
      }
      running = running + r.deposit - r.withdrawal;
      return {
        ...r,
        balance: running,
      };
    });
  }, [rows, selectedAccountId, accounts]);

  const rowSelection = useMemo(() => ({
    mode: "multiRow" as const,
    checkboxes: true,
    headerCheckbox: true,
    enableClickSelection: false,
    headerCheckboxFilteredOnly: true,
  }), []);

  const selectionColumnDef = useMemo(() => ({
    width: 48,
    pinned: "left" as const,
    suppressHeaderMenuButton: true,
    headerCheckboxSelectionFilteredOnly: true,
  }), []);

  // ── Column defs ───────────────────────────────────────────────────────────
  const columnDefs = useMemo<ColDef<ImportRow>[]>(() => [
    {
      headerName: "Sr. No.",
      width: 65,
      colId: "srNo",
      filter: "agNumberColumnFilter",
      floatingFilter: true,
      suppressFloatingFilterButton: true,
      headerClass: "ag-header-cell-center",
      sortable: false,
      valueGetter: (p) => (p.node?.rowIndex ?? 0) + 1,
      cellStyle: { color: "#94a3b8", fontSize: "11px", textAlign: "center" } as any,
    },
    {
      headerName: "Bank/cash name",
      width: 155,
      colId: "bankName",
      filter: "agTextColumnFilter",
      floatingFilter: true,
      valueGetter: () => {
        if (selectedAccountId === "auto-create") {
          return detectedBankName || "Auto-detecting...";
        }
        const acc = accounts.find((a) => a._id === selectedAccountId);
        return acc ? acc.name : "";
      },
      cellStyle: { fontSize: "12px", color: "#334155", fontWeight: "500" } as any,
    },
    {
      field: "date",
      headerName: "Date",
      width: 108,
      filter: "agTextColumnFilter",
      floatingFilter: true,
      editable: true,
      cellStyle: { fontSize: "12px", color: "#64748b" } as any,
    },
    {
      field: "narration",
      headerName: "Particulars/Narrations",
      flex: 1,
      minWidth: 240,
      filter: "agTextColumnFilter",
      floatingFilter: true,
      editable: true,
      cellStyle: { fontSize: "12px", color: "#1e293b" } as any,
    },
    {
      field: "withdrawal",
      headerName: "Withdrawals/Payment",
      width: 145,
      type: "numericColumn",
      editable: true,
      filter: "agNumberColumnFilter",
      floatingFilter: true,
      cellRenderer: (p: ICellRendererParams<ImportRow>) =>
        p.data?.withdrawal
          ? <span className="text-red-600 font-semibold text-xs">{fmt(p.data.withdrawal)}</span>
          : <span className="text-slate-300 text-xs">—</span>,
    },
    {
      field: "deposit",
      headerName: "Deposit/Receipt",
      width: 145,
      type: "numericColumn",
      editable: true,
      filter: "agNumberColumnFilter",
      floatingFilter: true,
      cellRenderer: (p: ICellRendererParams<ImportRow>) =>
        p.data?.deposit
          ? <span className="text-emerald-600 font-semibold text-xs">{fmt(p.data.deposit)}</span>
          : <span className="text-slate-300 text-xs">—</span>,
    },
    {
      field: "balance",
      headerName: "Balance",
      width: 145,
      type: "numericColumn",
      filter: "agNumberColumnFilter",
      floatingFilter: true,
      cellRenderer: (p: ICellRendererParams<ImportRow>) => {
        const bal = p.data?.balance ?? 0;
        const formatted = "₹" + Math.abs(bal).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return (
          <span className={`font-semibold text-xs ${bal < 0 ? "text-red-700" : "text-slate-900"}`}>
            {formatted}
            {bal < 0 && <span className="text-[9px] font-normal ml-0.5 text-red-400">(Cr)</span>}
          </span>
        );
      },
    },
    {
      field: "aiAccountName",
      headerName: "Account name",
      width: 210,
      editable: (p) => {
        const narration = p.data?.narration ?? "";
        return !isOpeningBalRow(narration);
      },
      filter: "agTextColumnFilter",
      floatingFilter: true,
      cellRenderer: (p: ICellRendererParams<ImportRow>) => {
        if (!p.data) return null;
        if (p.data.aiStatus === "loading")
          return <span className="flex items-center gap-1.5 text-indigo-400 text-xs"><RefreshCw size={11} className="animate-spin" /> AI thinking…</span>;
        if (isOpeningBalRow(p.data.narration)) {
          return <span className="text-slate-400 text-xs italic">— (Opening Balance) —</span>;
        }
        if (!p.value)
          return <span className="text-slate-300 text-xs italic">Double-click to enter</span>;
        return (
          <div className="flex items-center gap-1.5 h-full">
            {p.data.aiStatus === "done" && <Bot size={11} className="text-indigo-400 flex-shrink-0" />}
            <span className="text-xs font-medium text-slate-800 truncate">{p.value}</span>
          </div>
        );
      },
    },
    {
      field: "aiAccountGroup",
      headerName: "Account group name",
      width: 165,
      editable: (p) => {
        const narration = p.data?.narration ?? "";
        return !isOpeningBalRow(narration);
      },
      cellEditor: GroupCellEditor,
      filter: "agTextColumnFilter",
      floatingFilter: true,
      cellRenderer: (p: ICellRendererParams<ImportRow>) => {
        if (!p.data) return null;
        if (p.data.aiStatus === "loading")
          return <span className="text-slate-300 text-xs">…</span>;
        if (isOpeningBalRow(p.data.narration)) {
          return <span className="text-slate-400 text-xs italic">—</span>;
        }
        if (!p.value)
          return <span className="text-slate-300 text-xs italic">Select group</span>;
        const cls = GROUP_COLORS[p.value] ?? "bg-slate-100 text-slate-600";
        return (
          <div className="flex items-center h-full">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${cls}`}>
              {p.value}
            </span>
          </div>
        );
      },
    },
    {
      headerName: "",
      width: 60,
      sortable: false,
      pinned: "right",
      cellRenderer: (p: ICellRendererParams<ImportRow>) =>
        p.data ? (
          <div className="flex items-center h-full">
            <button
              onClick={() => deleteRow(p.data!.id)}
              className="p-1.5 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
              title="Remove"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ) : null,
    },
  ], [deleteRow, selectedAccountId, detectedBankName, accounts]);

  return (
    <div className="p-4 lg:p-6 space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-slate-900">AI Bank Statement Import</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Upload Excel, PDF, or Images · OpenRouter AI suggests account mapping automatically
        </p>
      </div>

      <StepBar step={step} />

      {/* ── Step 0: Upload ─────────────────────────────────────────────────── */}
      {step === 0 && (
        <div className="space-y-4 max-w-2xl">

          {/* Bank/Cash Account Selector */}
          <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-slate-700 flex items-center gap-1.5">
                <span>Select Destination Bank/Cash Account</span>
                <span className="text-red-500">*</span>
              </label>
              <button
                type="button"
                onClick={() => setShowCreateForm(!showCreateForm)}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1"
              >
                {showCreateForm ? "Cancel" : "+ Create New Account"}
              </button>
            </div>

            {showCreateForm && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3 mt-1.5 transition-all">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 uppercase">Account Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Bank of Baroda"
                      value={newAccName}
                      onChange={(e) => setNewAccName(e.target.value)}
                      className="w-full mt-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg outline-none text-xs text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 uppercase">Group</label>
                    <select
                      value={newAccGroup}
                      onChange={(e) => setNewAccGroup(e.target.value as any)}
                      className="w-full mt-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg outline-none text-xs text-slate-800"
                    >
                      <option value="Bank">Bank</option>
                      <option value="Cash">Cash</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase">Opening Balance</label>
                  <input
                    type="number"
                    placeholder="0.00"
                    value={newAccBal}
                    onChange={(e) => setNewAccBal(e.target.value)}
                    className="w-full mt-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg outline-none text-xs text-slate-800"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateForm(false);
                      setNewAccName("");
                      setNewAccBal("");
                    }}
                    className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateAccount}
                    disabled={creatingAcc}
                    className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs hover:bg-indigo-700 font-medium"
                  >
                    {creatingAcc ? "Creating..." : "Create Account"}
                  </button>
                </div>
              </div>
            )}

            {!showCreateForm && (
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 text-sm font-medium text-slate-800"
              >
                <option value="auto-create">
                  {detectedBankName 
                    ? `✨ [New Bank] ${detectedBankName} (Auto-create)` 
                    : "✨ Auto-detect & Create from Statement"}
                </option>
                {accounts.map((acc) => (
                  <option key={acc._id} value={acc._id}>
                    {acc.name} ({acc.group})
                  </option>
                ))}
              </select>
            )}
            <p className="text-xs text-slate-400">
              All imported transactions will be saved under this account in the Bank/Cash Book.
            </p>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-2xl p-10 text-center transition-all ${
              dragging ? "border-indigo-400 bg-indigo-50" : "border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/30"
            }`}
          >
            <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-4">
              <Upload size={28} className="text-indigo-500" />
            </div>
            <h3 className="text-slate-800">Drop your bank statement here</h3>
            <p className="text-sm text-slate-500 mt-1 mb-5">
              <span className="font-medium text-emerald-700">Excel (.xlsx / .xls)</span>
              {", "}
              <span className="font-medium text-red-600">PDF</span>
              {", or "}
              <span className="font-medium text-indigo-600">Image (PNG, JPG, WebP)</span>
              {" · Max 20 MB"}
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <label className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors cursor-pointer">
                <FileSpreadsheet size={15} /> Choose Excel
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileInput} />
              </label>
              <label className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors cursor-pointer">
                <FileText size={15} /> Choose PDF
                <input type="file" accept=".pdf" className="hidden" onChange={handleFileInput} />
              </label>
              <label className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors cursor-pointer">
                <Image size={15} /> Choose Image
                <input type="file" accept="image/*" className="hidden" onChange={handleFileInput} />
              </label>
            </div>
          </div>

          {/* Format guide */}
          <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm">
            <p className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1.5">
              <Info size={13} className="text-slate-400" /> Expected Excel column headers
            </p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1">
              {[
                ["Date",       "date, txn date, value date"],
                ["Narration",  "narration, description, particulars"],
                ["Withdrawal", "debit, withdrawal, dr"],
                ["Deposit",    "credit, deposit, cr"],
              ].map(([f, s]) => (
                <p key={f} className="text-xs">
                  <span className="font-medium text-slate-700">{f}</span>
                  <span className="text-slate-400"> — {s}</span>
                </p>
              ))}
            </div>
          </div>

          {/* Selected file ready bar */}
          {file && (
            <div className="bg-white rounded-xl p-4 shadow-sm border border-indigo-100 flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <FileText size={18} className="text-indigo-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{file.name}</p>
                <p className="text-xs text-slate-500">{file.size > 0 ? `${(file.size / 1024).toFixed(1)} KB` : "Ready"}</p>
              </div>
              <button
                onClick={() => parseFile(file)}
                disabled={parsing}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-colors disabled:opacity-60"
              >
                {parsing ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {parsing ? "Parsing…" : "Parse & Analyse"}
              </button>
            </div>
          )}

          {parseError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{parseError}</p>
            </div>
          )}

          {/* Sample data */}
          <div className="flex items-center gap-3 text-sm text-slate-400">
            <div className="flex-1 h-px bg-slate-200" /> or try sample <div className="flex-1 h-px bg-slate-200" />
          </div>
          <button
            onClick={loadSample}
            className="w-full py-3 border-2 border-dashed border-slate-300 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
          >
            <Eye size={15} /> Use Sample HDFC Statement (18 transactions)
          </button>
        </div>
      )}

      {/* ── Step 1: AI Processing ──────────────────────────────────────────── */}
      {step === 1 && (
        <div className="max-w-lg mx-auto space-y-6 py-8">
          <div className="text-center">
            <div className="w-20 h-20 rounded-full bg-indigo-50 flex items-center justify-center mx-auto mb-4">
              <Bot size={36} className={`text-indigo-500 ${aiLoading ? "animate-pulse" : ""}`} />
            </div>
            <h2 className="text-slate-900">
              {aiLoading ? "AI is analysing narrations…" : "Preparing preview…"}
            </h2>
            <p className="text-sm text-slate-500 mt-2">
              Sending {rows.length} transaction narrations with the prompt:
            </p>
            <div className="mt-3 px-4 py-2.5 bg-slate-900 rounded-lg text-left">
              <p className="text-xs font-mono text-indigo-300">You are an Indian Accountant.</p>
              <p className="text-xs font-mono text-slate-400">Based on narration suggest:</p>
              <p className="text-xs font-mono text-emerald-400">{"{ accountName, accountGroup }"}</p>
            </div>
          </div>

          {/* Progress */}
          <div>
            <div className="bg-slate-100 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-gradient-to-r from-indigo-500 to-purple-500 h-full rounded-full transition-all duration-300"
                style={{ width: `${aiProgress}%` }}
              />
            </div>
            <p className="text-right text-xs text-slate-400 mt-1">{aiProgress}%</p>
          </div>

          {/* Live preview of rows */}
          <div className="bg-white rounded-xl border border-slate-100 overflow-hidden shadow-sm divide-y divide-slate-50">
            {rows.slice(0, 6).map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                <RefreshCw size={11} className="animate-spin text-indigo-400 flex-shrink-0" />
                <span className="text-xs text-slate-600 truncate flex-1">{r.narration}</span>
                {r.deposit > 0
                  ? <span className="text-emerald-600 text-xs font-semibold flex-shrink-0">{fmt(r.deposit)}</span>
                  : <span className="text-red-500 text-xs font-semibold flex-shrink-0">{fmt(r.withdrawal)}</span>
                }
              </div>
            ))}
            {rows.length > 6 && (
              <p className="px-4 py-2 text-xs text-slate-400 text-center">
                + {rows.length - 6} more transactions
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Step 2: Preview & Edit ─────────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: "Total Rows",      value: stats.total,                                    color: "text-slate-900"   },
              { label: "AI Mapped",       value: stats.aiDone,                                   color: "text-indigo-600"  },
              { label: "Filled",          value: stats.filled,                                   color: "text-emerald-600" },
              { label: "Total Deposits",  value: `₹${(stats.deposits / 100000).toFixed(1)}L`,    color: "text-emerald-600" },
              { label: "Total Withdrawals",value:`₹${(stats.withdrawals / 100000).toFixed(1)}L`, color: "text-red-500"     },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
                <p className="text-xs text-slate-500">{s.label}</p>
                <p className={`text-lg font-bold mt-0.5 ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Destination Bank/Cash Account Selector in Step 2 */}
          <div className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                <span>Destination Bank/Cash Account</span>
                <span className="text-red-500">*</span>
              </label>
              <button
                type="button"
                onClick={() => setShowCreateForm(!showCreateForm)}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1"
              >
                {showCreateForm ? "Cancel" : "+ Create New Account"}
              </button>
            </div>

            {showCreateForm && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3 transition-all">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 uppercase">Account Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Bank of Baroda"
                      value={newAccName}
                      onChange={(e) => setNewAccName(e.target.value)}
                      className="w-full mt-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg outline-none text-xs text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 uppercase">Group</label>
                    <select
                      value={newAccGroup}
                      onChange={(e) => setNewAccGroup(e.target.value as any)}
                      className="w-full mt-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg outline-none text-xs text-slate-800"
                    >
                      <option value="Bank">Bank</option>
                      <option value="Cash">Cash</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase">Opening Balance</label>
                  <input
                    type="number"
                    placeholder="0.00"
                    value={newAccBal}
                    onChange={(e) => setNewAccBal(e.target.value)}
                    className="w-full mt-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg outline-none text-xs text-slate-800"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateForm(false);
                      setNewAccName("");
                      setNewAccBal("");
                    }}
                    className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateAccount}
                    disabled={creatingAcc}
                    className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs hover:bg-indigo-700 font-medium"
                  >
                    {creatingAcc ? "Creating..." : "Create Account"}
                  </button>
                </div>
              </div>
            )}

            {!showCreateForm && (
              <div className="space-y-3">
                <select
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 text-sm font-medium text-slate-800"
                >
                  <option value="auto-create">
                    {detectedBankName 
                      ? `✨ [New Bank] ${detectedBankName} (Auto-create)` 
                      : "✨ Auto-detect & Create from Statement"}
                  </option>
                  {accounts.map((acc) => (
                    <option key={acc._id} value={acc._id}>
                      {acc.name} ({acc.group})
                    </option>
                  ))}
                </select>

                {selectedAccountId === "auto-create" ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 space-y-2">
                    <div className="flex items-center gap-2">
                      <Bot size={16} className="text-amber-600 flex-shrink-0 animate-bounce" />
                      <span className="font-semibold">Auto-creating a new Bank Account on Save</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-semibold text-slate-600 whitespace-nowrap">Account Name:</label>
                      <input
                        type="text"
                        placeholder="Enter bank account name to create..."
                        value={detectedBankName}
                        onChange={(e) => setDetectedBankName(e.target.value)}
                        className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg outline-none text-xs text-slate-800 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 font-medium"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2 text-xs text-emerald-800 shadow-sm">
                    <CheckCircle2 size={14} className="text-emerald-600 flex-shrink-0" />
                    <span>
                      Importing into existing Bank/Cash account: <strong className="font-semibold">{accounts.find(a => a._id === selectedAccountId)?.name}</strong>
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* AI banner */}
          <div className="flex flex-col gap-2">
            {stats.aiDone > 0 && (
              <div className="flex items-start gap-3 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3">
                <Bot size={16} className="text-indigo-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-indigo-800">
                  <span className="font-semibold">OpenRouter AI</span> suggested accounts for{" "}
                  <span className="font-semibold">{stats.aiDone} transactions</span>.{" "}
                  Double-click the <em>AI Account Name</em> or <em>AI Group</em> cell to edit any suggestion before saving.
                </p>
              </div>
            )}
          </div>

          {/* Incomplete warning */}
          {stats.filled < stats.total && (
            <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <AlertTriangle size={15} className="text-amber-600 flex-shrink-0" />
              <p className="text-sm text-amber-800">
                <span className="font-semibold">{stats.total - stats.filled} rows</span> still need an Account Name and Group.
              </p>
            </div>
          )}

          {/* Select All / Deselect All quick actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => gridRef.current?.api.selectAllFiltered()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm"
            >
              <CheckCircle2 size={13} /> Select All
            </button>
            <button
              type="button"
              onClick={() => { gridRef.current?.api.deselectAll(); setSelectedRows([]); }}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-semibold rounded-lg transition-colors"
            >
              <X size={13} /> Deselect All
            </button>
            {selectedRows.length > 0 && (
              <span className="text-xs text-indigo-700 font-semibold bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-full">
                {selectedRows.length} selected
              </span>
            )}
          </div>

          {/* Bulk Edit Bar */}
          {selectedRows.length > 0 && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 shadow-sm flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Bot size={16} className="text-indigo-600 animate-bounce" />
                <span className="text-sm font-semibold text-indigo-900">
                  Bulk Edit ({selectedRows.length} selected rows):
                </span>
              </div>
              <div className="flex items-center gap-3 flex-1 min-w-[300px]">
                <input
                  type="text"
                  placeholder="Set Account Name for selected..."
                  value={bulkAccName}
                  onChange={(e) => setBulkAccName(e.target.value)}
                  className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg outline-none text-xs text-slate-800 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 font-medium"
                />
                <select
                  value={bulkAccGroup}
                  onChange={(e) => setBulkAccGroup(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg outline-none text-xs text-slate-800 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 font-medium"
                >
                  <option value="">-- Set Group --</option>
                  {LEDGER_GROUPS.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleApplyBulkEdit}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm"
                >
                  Apply
                </button>
              </div>
            </div>
          )}

          {/* Grid */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <div
              className="ag-theme-quartz"
              style={{ height: Math.max(450, Math.min(rows.length * 48 + 120, 750)) }}
            >
              <AgGridReact<ImportRow>
                theme="legacy"
                ref={gridRef}
                rowData={rowsWithBalance}
                columnDefs={columnDefs}
                defaultColDef={{ resizable: true, sortable: true }}
                rowSelection={rowSelection}
                selectionColumnDef={selectionColumnDef}
                onSelectionChanged={onSelectionChanged}
                onFilterChanged={onFilterChanged}
                rowHeight={48}
                headerHeight={44}
                floatingFiltersHeight={38}
                animateRows
                stopEditingWhenCellsLoseFocus
                onCellEditingStopped={onCellEditingStopped}
                getRowId={(p) => p.data.id}
              />
            </div>
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <button
              onClick={() => { setStep(0); setRows([]); setFile(null); }}
              className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors"
            >
              ← Back to Upload
            </button>
            <div className="flex gap-2">
              <button
                onClick={() => runAI(rows)}
                disabled={aiLoading}
                title="Re-run AI"
                className="flex items-center gap-2 px-4 py-2 border border-indigo-200 bg-indigo-50 text-indigo-700 rounded-lg text-sm hover:bg-indigo-100 transition-colors disabled:opacity-40"
              >
                <Sparkles size={14} /> Re-run AI
              </button>
              <button
                onClick={handleSave}
                disabled={savingTxns}
                className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                {savingTxns ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                {savingTxns ? "Saving..." : `Save ${rows.length} Transactions`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Step 3: Done ──────────────────────────────────────────────────── */}
      {step === 3 && (
        <div className="max-w-md mx-auto">
          <div className="bg-white rounded-2xl p-12 shadow-sm border border-slate-100 text-center">
            <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-5">
              <CheckCircle2 size={40} className="text-emerald-500" />
            </div>
            <h2 className="text-slate-900">Import Successful!</h2>
            <p className="text-slate-500 text-sm mt-2">
              <span className="font-semibold text-slate-700">{rows.length} transactions</span> saved with AI-suggested account mappings.
            </p>
            <div className="grid grid-cols-2 gap-3 mt-6 mb-6">
              <div className="bg-emerald-50 rounded-xl p-4">
                <TrendingUp size={20} className="text-emerald-600 mx-auto mb-1" />
                <p className="text-sm font-bold text-emerald-700">{fmt(stats.deposits)}</p>
                <p className="text-xs text-emerald-600 mt-0.5">Total Deposits</p>
              </div>
              <div className="bg-red-50 rounded-xl p-4">
                <TrendingDown size={20} className="text-red-500 mx-auto mb-1" />
                <p className="text-sm font-bold text-red-600">{fmt(stats.withdrawals)}</p>
                <p className="text-xs text-red-500 mt-0.5">Total Withdrawals</p>
              </div>
            </div>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => { setStep(0); setRows([]); setFile(null); }}
                className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Import Another
              </button>
              <button
                onClick={() => {
                  if (onImportComplete) {
                    onImportComplete();
                  } else {
                    window.location.href = "/bank-cash-book";
                  }
                }}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-colors"
              >
                View Bank / Cash Book
              </button>
            </div>
          </div>
        </div>
      )}
      {savingTxns && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl border border-slate-100 p-8 shadow-2xl flex flex-col items-center gap-4 text-center max-w-sm animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center mx-auto">
              <RefreshCw size={28} className="text-indigo-600 animate-spin" />
            </div>
            <div>
              <h3 className="text-slate-900 font-bold text-base">Saving Transactions...</h3>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                Please wait while we set up the accounts, reconcile values, and save the transaction entries to your ledger book.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

