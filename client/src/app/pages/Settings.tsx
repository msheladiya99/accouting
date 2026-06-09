import { useState, useEffect, useCallback } from "react";
import {
  Building2, CalendarRange, Palette, HardDrive, Mail,
  Sun, Moon, Monitor, Check, Download, RefreshCw,
  Save, Loader2, AlertTriangle, CheckCircle2, Info,
  Shield, Clock, Database, Zap, Bell, Send,
  Eye, EyeOff, ToggleLeft, ToggleRight, ChevronRight,
} from "lucide-react";
import toast from "react-hot-toast";
import { useApp } from "../context/AppContext";
import { useTheme, type ThemeMode, type AccentColor } from "../context/ThemeContext";
import { type FinancialYear } from "../api/financialYearApi";

// ── Tab definitions ───────────────────────────────────────────────────────────
const TABS = [
  { id: "company",  label: "Company Settings", icon: Building2  },
  { id: "fy",       label: "Financial Year",   icon: CalendarRange },
  { id: "theme",    label: "Theme",            icon: Palette    },
  { id: "backup",   label: "Backup",           icon: HardDrive  },
  { id: "email",    label: "Email Settings",   icon: Mail       },
] as const;
type TabId = typeof TABS[number]["id"];

// ── Helpers ───────────────────────────────────────────────────────────────────
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="text-sm font-semibold text-slate-700 mb-4">{children}</p>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-slate-600">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

function Input({ ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all ${props.className ?? ""}`}
    />
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative flex items-center gap-2.5 group`}
    >
      <span className={`relative inline-flex h-6 w-11 rounded-full transition-colors duration-200 ${checked ? "bg-indigo-600" : "bg-slate-200"}`}>
        <span className={`inline-block h-5 w-5 mt-0.5 rounded-full bg-white shadow-sm transform transition-transform duration-200 ${checked ? "translate-x-5" : "translate-x-0.5"}`} />
      </span>
      {label && <span className="text-sm text-slate-700">{label}</span>}
    </button>
  );
}

// ── Tab: Company Settings ─────────────────────────────────────────────────────
function CompanyTab() {
  const { company, setCompany } = useApp();
  const [form, setForm] = useState({ ...company });
  const [saving, setSaving] = useState(false);

  const dirty = JSON.stringify(form) !== JSON.stringify(company);

  const handleSave = async () => {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 500));
    setCompany(form);
    toast.success("Company settings saved");
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-5">
        <SectionTitle>Company Information</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Field label="Company Name">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Acme Corp Ltd." />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Address">
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="123 Business Ave, Suite 100" />
            </Field>
          </div>
          <Field label="Phone Number">
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+1 (555) 000-0000" />
          </Field>
          <Field label="Email Address">
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="finance@acmecorp.com" />
          </Field>
          <Field label="Tax / GST ID" hint="Used in Excel export headers">
            <Input value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} placeholder="US-TAX-123456" />
          </Field>
          <Field label="Currency">
            <select
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
            >
              {["USD", "INR", "EUR", "GBP", "AED", "SGD", "CAD", "AUD"].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50"
        >
          {saving ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : <><Save size={15} /> Save Changes</>}
        </button>
      </div>
    </div>
  );
}

// ── Tab: Financial Year ───────────────────────────────────────────────────────
function FinancialYearTab() {
  const { selectedFY, setSelectedFY, availableFYs, fyLoading } = useApp();

  const STATUS_COLORS: Record<string, string> = {
    current:  "bg-emerald-100 text-emerald-700 border-emerald-200",
    previous: "bg-slate-100 text-slate-600 border-slate-200",
    future:   "bg-indigo-100 text-indigo-700 border-indigo-200",
    closed:   "bg-red-100 text-red-600 border-red-200",
  };
  const STATUS_DOTS: Record<string, string> = {
    current: "bg-emerald-500", previous: "bg-slate-400", future: "bg-indigo-400", closed: "bg-red-400",
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <SectionTitle>Financial Years</SectionTitle>
        {fyLoading ? (
          <div className="flex items-center gap-2 text-slate-400 py-8 justify-center">
            <Loader2 size={18} className="animate-spin" /> Loading…
          </div>
        ) : (
          <div className="space-y-2">
            {availableFYs.map((fy) => {
              const isActive = fy._id === selectedFY?._id;
              return (
                <div
                  key={fy._id}
                  className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${
                    isActive ? "border-indigo-300 bg-indigo-50" : "border-slate-100 bg-slate-50/50 hover:bg-slate-50"
                  }`}
                >
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${STATUS_DOTS[fy.status]}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${isActive ? "text-indigo-800" : "text-slate-800"}`}>{fy.label}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {new Date(fy.startDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      {" – "}
                      {new Date(fy.endDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  <span className={`px-2.5 py-1 rounded-lg border text-xs font-medium capitalize ${STATUS_COLORS[fy.status]}`}>
                    {fy.status}
                  </span>
                  {isActive ? (
                    <span className="flex items-center gap-1 text-xs text-indigo-600 font-medium">
                      <CheckCircle2 size={13} /> Active
                    </span>
                  ) : (
                    <button
                      onClick={() => setSelectedFY(fy)}
                      className="text-xs text-indigo-600 hover:text-indigo-700 font-medium px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors"
                    >
                      Switch
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-2 text-xs text-slate-400">
          <Info size={12} />
          To add or edit financial years, visit the Financial Year module.
        </div>
      </div>
    </div>
  );
}

// ── Tab: Theme ────────────────────────────────────────────────────────────────
const ACCENT_COLORS: { id: AccentColor; label: string; bg: string; ring: string }[] = [
  { id: "indigo",  label: "Indigo",  bg: "bg-indigo-600",  ring: "ring-indigo-600"  },
  { id: "blue",    label: "Blue",    bg: "bg-blue-600",    ring: "ring-blue-600"    },
  { id: "emerald", label: "Emerald", bg: "bg-emerald-600", ring: "ring-emerald-600" },
  { id: "violet",  label: "Violet",  bg: "bg-violet-600",  ring: "ring-violet-600"  },
  { id: "rose",    label: "Rose",    bg: "bg-rose-600",    ring: "ring-rose-600"    },
  { id: "amber",   label: "Amber",   bg: "bg-amber-500",   ring: "ring-amber-500"   },
];

const THEME_OPTIONS: { id: ThemeMode; label: string; desc: string; icon: typeof Sun }[] = [
  { id: "light", label: "Light",  desc: "Classic bright interface",     icon: Sun     },
  { id: "dark",  label: "Dark",   desc: "Easy on the eyes at night",    icon: Moon    },
  { id: "auto",  label: "System", desc: "Follows your OS preference",   icon: Monitor },
];

function ThemeTab() {
  const { mode, accent, setMode, setAccent, isDark, compact, setCompact, animations, setAnimations } = useTheme();

  return (
    <div className="space-y-5">
      {/* Color Mode */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <SectionTitle>Color Mode</SectionTitle>
        <div className="grid grid-cols-3 gap-3">
          {THEME_OPTIONS.map(({ id, label, desc, icon: Icon }) => {
            const selected = mode === id;
            return (
              <button
                key={id}
                onClick={() => setMode(id)}
                className={`flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                  selected
                    ? "border-indigo-500 bg-indigo-50"
                    : "border-slate-200 bg-slate-50 hover:border-slate-300"
                }`}
              >
                {/* Mini preview */}
                <div className={`w-full h-14 rounded-lg overflow-hidden flex ${id === "dark" ? "bg-slate-900" : id === "auto" ? "bg-gradient-to-r from-white to-slate-900" : "bg-white"} border border-slate-200`}>
                  {/* Sidebar strip */}
                  <div className={`w-6 h-full ${id === "light" ? "bg-slate-200" : "bg-slate-800"}`} />
                  {/* Content area */}
                  <div className="flex-1 p-1.5 space-y-1">
                    <div className={`h-1.5 rounded w-3/4 ${id === "dark" ? "bg-slate-700" : "bg-slate-200"}`} />
                    <div className={`h-1.5 rounded w-1/2 ${id === "dark" ? "bg-slate-700" : "bg-slate-200"}`} />
                    <div className={`h-4 rounded mt-1 ${id === "dark" ? "bg-indigo-900" : "bg-indigo-100"}`} />
                  </div>
                </div>
                <div className="text-center">
                  <div className="flex items-center gap-1.5 justify-center">
                    <Icon size={13} className={selected ? "text-indigo-600" : "text-slate-500"} />
                    <p className={`text-sm font-semibold ${selected ? "text-indigo-700" : "text-slate-700"}`}>{label}</p>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">{desc}</p>
                </div>
                {selected && <Check size={14} className="text-indigo-600" />}
              </button>
            );
          })}
        </div>
 
        <div className={`mt-4 flex items-center gap-3 px-4 py-3 rounded-xl text-xs ${isDark ? "bg-slate-800 text-slate-300 border border-slate-700" : "bg-slate-50 text-slate-500 border border-slate-200"}`}>
          {isDark ? <Moon size={13} className="text-indigo-400" /> : <Sun size={13} className="text-amber-500" />}
          Currently in <strong>{isDark ? "Dark" : "Light"}</strong> mode
          {mode === "auto" && " (following system preference)"}
        </div>
      </div>
 
      {/* Accent Color */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <SectionTitle>Accent Color</SectionTitle>
        <div className="flex flex-wrap gap-3">
          {ACCENT_COLORS.map(({ id, label, bg, ring }) => {
            const selected = accent === id;
            return (
              <button
                key={id}
                onClick={() => {
                  setAccent(id);
                  toast.success(`Accent color changed to ${label}`);
                }}
                className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${
                  selected ? "border-slate-400 bg-slate-50" : "border-transparent hover:border-slate-200"
                }`}
              >
                <div className={`w-8 h-8 rounded-full ${bg} ${selected ? `ring-2 ring-offset-2 ${ring}` : ""} transition-all`} />
                <p className="text-xs text-slate-600 font-medium">{label}</p>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-slate-400 mt-3">Accent color will be applied across buttons, highlights, and active states.</p>
      </div>
 
      {/* Font Size */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <SectionTitle>Display Preferences</SectionTitle>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-700">Compact Mode</p>
              <p className="text-xs text-slate-400">Reduce padding for denser information display</p>
            </div>
            <Toggle checked={compact} onChange={setCompact} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-700">Animations</p>
              <p className="text-xs text-slate-400">Enable transition animations throughout the app</p>
            </div>
            <Toggle checked={animations} onChange={setAnimations} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tab: Backup ───────────────────────────────────────────────────────────────
const BACKUP_STORE_KEY = "ap_backup_settings";

interface BackupSettings {
  autoBackup:     boolean;
  frequency:      "daily" | "weekly" | "monthly";
  retention:      number;   // days
  lastBackup?:    string;   // ISO
  includeJournal: boolean;
  includeLedger:  boolean;
}

const DEFAULT_BACKUP: BackupSettings = {
  autoBackup: true, frequency: "daily", retention: 30,
  lastBackup: new Date(Date.now() - 86_400_000).toISOString(),
  includeJournal: true, includeLedger: true,
};

function BackupTab() {
  const { company } = useApp();
  const [settings, setSettings] = useState<BackupSettings>(() => {
    try { return JSON.parse(localStorage.getItem(BACKUP_STORE_KEY) ?? "null") ?? DEFAULT_BACKUP; }
    catch { return DEFAULT_BACKUP; }
  });
  const [downloading, setDownloading] = useState(false);

  const save = (s: BackupSettings) => {
    setSettings(s);
    localStorage.setItem(BACKUP_STORE_KEY, JSON.stringify(s));
  };

  const handleDownload = async () => {
    setDownloading(true);
    await new Promise((r) => setTimeout(r, 1200));

    const backup = {
      meta: {
        app:        "AccountPro",
        company:    company.name,
        exportedAt: new Date().toISOString(),
        version:    "1.0.0",
      },
      data: {
        company,
        note: "Full transactional data exported from in-memory store",
      },
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `${company.name.replace(/\s+/g, "_")}_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);

    const next = { ...settings, lastBackup: new Date().toISOString() };
    save(next);
    toast.success("Backup downloaded successfully");
    setDownloading(false);
  };

  const fmt = (iso?: string) => {
    if (!iso) return "Never";
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  };

  return (
    <div className="space-y-5">
      {/* Status card */}
      <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl border border-emerald-200 p-5 flex items-center gap-4">
        <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
          <Database size={22} className="text-emerald-600" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-emerald-900">Last Backup</p>
          <p className="text-xs text-emerald-700 mt-0.5">{fmt(settings.lastBackup)}</p>
        </div>
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-60 flex-shrink-0"
        >
          {downloading
            ? <><Loader2 size={15} className="animate-spin" /> Preparing…</>
            : <><Download size={15} /> Download Backup</>}
        </button>
      </div>

      {/* Auto backup settings */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <SectionTitle>Automatic Backup</SectionTitle>
            <p className="text-xs text-slate-400 -mt-3">Automatically save your data on a schedule</p>
          </div>
          <Toggle
            checked={settings.autoBackup}
            onChange={(v) => save({ ...settings, autoBackup: v })}
          />
        </div>

        {settings.autoBackup && (
          <div className="space-y-4 pt-4 border-t border-slate-100">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Backup Frequency">
                <select
                  value={settings.frequency}
                  onChange={(e) => save({ ...settings, frequency: e.target.value as any })}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </Field>
              <Field label="Retention Period">
                <select
                  value={settings.retention}
                  onChange={(e) => save({ ...settings, retention: Number(e.target.value) })}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
                >
                  <option value={7}>7 days</option>
                  <option value={14}>14 days</option>
                  <option value={30}>30 days</option>
                  <option value={90}>90 days</option>
                </select>
              </Field>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-medium text-slate-600">Include in Backup</p>
              {[
                { key: "includeJournal" as const, label: "Journal Vouchers", desc: "All posted and draft journal entries" },
                { key: "includeLedger"  as const, label: "Ledger Data",      desc: "Opening balances and ledger master" },
              ].map(({ key, label, desc }) => (
                <div key={key} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div>
                    <p className="text-sm font-medium text-slate-700">{label}</p>
                    <p className="text-xs text-slate-400">{desc}</p>
                  </div>
                  <Toggle
                    checked={settings[key]}
                    onChange={(v) => save({ ...settings, [key]: v })}
                  />
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
              <Zap size={13} className="flex-shrink-0" />
              Auto backup runs at 2:00 AM based on your {settings.frequency} schedule
            </div>
          </div>
        )}
      </div>

      {/* Backup history */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <SectionTitle>Backup History</SectionTitle>
        <div className="space-y-2">
          {[
            { label: "Latest backup",     date: settings.lastBackup, size: "2.4 MB" },
            { label: "Previous backup",   date: new Date(Date.now() - 2*86_400_000).toISOString(), size: "2.3 MB" },
            { label: "3 days ago",        date: new Date(Date.now() - 3*86_400_000).toISOString(), size: "2.2 MB" },
          ].map(({ label, date, size }, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-50 border border-slate-100">
              <Clock size={14} className="text-slate-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-700">{label}</p>
                <p className="text-[11px] text-slate-400">{fmt(date)}</p>
              </div>
              <span className="text-xs text-slate-400">{size}</span>
              <button className="p-1.5 rounded-lg text-slate-400 hover:bg-white hover:text-indigo-600 transition-colors">
                <Download size={13} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Tab: Email Settings ───────────────────────────────────────────────────────
const EMAIL_STORE_KEY = "ap_email_settings";

interface EmailSettings {
  enabled:       boolean;
  smtpHost:      string;
  smtpPort:      string;
  username:      string;
  password:      string;
  fromName:      string;
  fromEmail:     string;
  notifyOnExport:    boolean;
  notifyOnBackup:    boolean;
  notifyOnLogin:     boolean;
}

const DEFAULT_EMAIL: EmailSettings = {
  enabled: false, smtpHost: "", smtpPort: "587", username: "", password: "",
  fromName: "AccountPro", fromEmail: "",
  notifyOnExport: true, notifyOnBackup: false, notifyOnLogin: false,
};

function EmailTab() {
  const [settings, setSettings] = useState<EmailSettings>(() => {
    try { return JSON.parse(localStorage.getItem(EMAIL_STORE_KEY) ?? "null") ?? DEFAULT_EMAIL; }
    catch { return DEFAULT_EMAIL; }
  });
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const save = async () => {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 600));
    localStorage.setItem(EMAIL_STORE_KEY, JSON.stringify(settings));
    toast.success("Email settings saved");
    setSaving(false);
  };

  const testEmail = async () => {
    if (!settings.fromEmail) { toast.error("Enter a From Email first"); return; }
    setTesting(true);
    await new Promise((r) => setTimeout(r, 1500));
    setTesting(false);
    toast.success(`Test email sent to ${settings.fromEmail}`);
  };

  return (
    <div className="space-y-5">
      {/* Enable toggle */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <div className="flex items-center justify-between">
          <div>
            <SectionTitle>Email Notifications</SectionTitle>
            <p className="text-xs text-slate-400 -mt-3">Configure SMTP to send automated email alerts</p>
          </div>
          <Toggle checked={settings.enabled} onChange={(v) => setSettings({ ...settings, enabled: v })} />
        </div>
      </div>

      {/* SMTP config */}
      <div className={`bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4 transition-opacity ${!settings.enabled ? "opacity-50 pointer-events-none" : ""}`}>
        <SectionTitle>SMTP Configuration</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Field label="SMTP Host" hint="e.g. smtp.gmail.com or smtp.sendgrid.net">
              <Input value={settings.smtpHost} onChange={(e) => setSettings({ ...settings, smtpHost: e.target.value })} placeholder="smtp.gmail.com" />
            </Field>
          </div>
          <Field label="Port" hint="Common: 587 (TLS) · 465 (SSL) · 25 (unencrypted)">
            <Input value={settings.smtpPort} onChange={(e) => setSettings({ ...settings, smtpPort: e.target.value })} placeholder="587" />
          </Field>
          <Field label="Encryption">
            <select
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
              defaultValue="tls"
            >
              <option value="tls">STARTTLS</option>
              <option value="ssl">SSL/TLS</option>
              <option value="none">None</option>
            </select>
          </Field>
          <Field label="SMTP Username">
            <Input value={settings.username} onChange={(e) => setSettings({ ...settings, username: e.target.value })} placeholder="your-email@gmail.com" />
          </Field>
          <Field label="SMTP Password">
            <div className="relative">
              <Input
                type={showPass ? "text" : "password"}
                value={settings.password}
                onChange={(e) => setSettings({ ...settings, password: e.target.value })}
                placeholder="••••••••••••"
                className="pr-10"
              />
              <button type="button" onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </Field>
        </div>
      </div>

      {/* Sender info */}
      <div className={`bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4 transition-opacity ${!settings.enabled ? "opacity-50 pointer-events-none" : ""}`}>
        <SectionTitle>Sender Information</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="From Name">
            <Input value={settings.fromName} onChange={(e) => setSettings({ ...settings, fromName: e.target.value })} placeholder="AccountPro" />
          </Field>
          <Field label="From Email">
            <Input type="email" value={settings.fromEmail} onChange={(e) => setSettings({ ...settings, fromEmail: e.target.value })} placeholder="noreply@acmecorp.com" />
          </Field>
        </div>
      </div>

      {/* Notification triggers */}
      <div className={`bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4 transition-opacity ${!settings.enabled ? "opacity-50 pointer-events-none" : ""}`}>
        <SectionTitle>Notification Triggers</SectionTitle>
        <div className="space-y-3">
          {[
            { key: "notifyOnExport"  as const, label: "Excel Export",  desc: "Send email when a report is exported" },
            { key: "notifyOnBackup"  as const, label: "Data Backup",   desc: "Send email when a backup is created"  },
            { key: "notifyOnLogin"   as const, label: "User Login",    desc: "Alert on every successful login"      },
          ].map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
              <div className="flex items-center gap-3">
                <Bell size={14} className="text-slate-400 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-slate-700">{label}</p>
                  <p className="text-xs text-slate-400">{desc}</p>
                </div>
              </div>
              <Toggle checked={settings[key]} onChange={(v) => setSettings({ ...settings, [key]: v })} />
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 justify-end">
        <button
          onClick={testEmail}
          disabled={testing || !settings.enabled}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
        >
          {testing ? <><Loader2 size={14} className="animate-spin" /> Sending…</> : <><Send size={14} /> Send Test Email</>}
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50"
        >
          {saving ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : <><Save size={15} /> Save Settings</>}
        </button>
      </div>
    </div>
  );
}

// ── Main Settings Page ────────────────────────────────────────────────────────
export default function Settings() {
  const [activeTab, setActiveTab] = useState<TabId>("company");

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500 mt-0.5">Configure your company, preferences, and system options</p>
      </div>

      <div className="flex gap-6 flex-col lg:flex-row">
        {/* Tab sidebar */}
        <nav className="lg:w-52 flex-shrink-0">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-2 flex lg:flex-col gap-1 overflow-x-auto">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all whitespace-nowrap w-full text-left ${
                  activeTab === id
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Icon size={16} className="flex-shrink-0" />
                <span className="font-medium">{label}</span>
                {activeTab !== id && <ChevronRight size={13} className="ml-auto text-slate-300 hidden lg:block" />}
              </button>
            ))}
          </div>
        </nav>

        {/* Tab content */}
        <div className="flex-1 min-w-0">
          {activeTab === "company"  && <CompanyTab />}
          {activeTab === "fy"       && <FinancialYearTab />}
          {activeTab === "theme"    && <ThemeTab />}
          {activeTab === "backup"   && <BackupTab />}
          {activeTab === "email"    && <EmailTab />}
        </div>
      </div>
    </div>
  );
}
