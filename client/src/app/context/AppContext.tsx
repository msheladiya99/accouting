import {
  createContext, useContext, useState, useEffect, ReactNode,
} from "react";
import {
  type FinancialYear,
  getAllFYs,
  getCurrentFY,
  buildFY,
} from "../api/financialYearApi";
import { getSubdomain } from "../utils/subdomain";
import { getCurrentCompany } from "../api/companyApi";

// ── Company ───────────────────────────────────────────────────────────────────
export interface Company {
  id?: string;
  name: string;
  address: string;
  phone: string;
  email: string;
  taxId: string;
  currency: string;
}

const defaultCompany: Company = {
  name: "Acme Corp Ltd.",
  address: "123 Business Ave, Suite 100",
  phone: "+1 (555) 000-0000",
  email: "finance@acmecorp.com",
  taxId: "US-TAX-123456",
  currency: "USD",
};

// ── Context shape ─────────────────────────────────────────────────────────────
interface AppContextType {
  // company
  company: Company;
  setCompany: (c: Company) => void;

  // financial year
  selectedFY: FinancialYear | null;
  setSelectedFY: (fy: FinancialYear) => void;
  availableFYs: FinancialYear[];
  setAvailableFYs: (fys: FinancialYear[]) => void;
  fyLoading: boolean;

  // layout
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
}

const AppContext = createContext<AppContextType>({
  company: defaultCompany,
  setCompany: () => {},
  selectedFY: null,
  setSelectedFY: () => {},
  availableFYs: [],
  setAvailableFYs: () => {},
  fyLoading: true,
  sidebarCollapsed: false,
  setSidebarCollapsed: () => {},
});

// ── Provider ──────────────────────────────────────────────────────────────────
export function AppProvider({ children }: { children: ReactNode }) {
  const [company, setCompanyState] = useState<Company>(() => {
    const saved = localStorage.getItem("ap_company");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // fallback
      }
    }
    return defaultCompany;
  });
  const [selectedFY, setSelectedFY] = useState<FinancialYear | null>(null);
  const [availableFYs, setAvailableFYs] = useState<FinancialYear[]>([]);
  const [fyLoading, setFyLoading] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const setCompany = (c: Company) => {
    setCompanyState(c);
    localStorage.setItem("ap_company", JSON.stringify(c));
    // Clear selected FY when switching company so it gets re-resolved
    localStorage.removeItem("ap_selected_fy");
  };

  // If on a subdomain, auto-load company details from backend
  useEffect(() => {
    const subdomain = getSubdomain();
    if (subdomain) {
      (async () => {
        try {
          const c = await getCurrentCompany();
          setCompany({
            id:       c._id,
            name:     c.companyName,
            address:  "—",
            phone:    "—",
            email:    "—",
            taxId:    c.panNumber,
            currency: "INR",
          });
        } catch (err) {
          console.error("Failed to resolve subdomain company context:", err);
        }
      })();
    }
  }, []);

  const handleSetSelectedFY = (fy: FinancialYear | null) => {
    setSelectedFY(fy);
    if (fy) {
      localStorage.setItem("ap_selected_fy", JSON.stringify(fy));
    } else {
      localStorage.removeItem("ap_selected_fy");
    }
  };

  // Re-load FYs whenever company ID changes
  useEffect(() => {
    if (!company.id) {
      setAvailableFYs([]);
      setSelectedFY(null);
      setFyLoading(false);
      return;
    }

    setFyLoading(true);
    (async () => {
      try {
        const [all, current] = await Promise.all([getAllFYs(), getCurrentFY()]);
        setAvailableFYs(all);

        // Restore from localStorage if possible
        const savedFYStr = localStorage.getItem("ap_selected_fy");
        let restoredFY = null;
        if (savedFYStr) {
          try {
            const parsed = JSON.parse(savedFYStr);
            if (parsed && parsed.companyId === company.id) {
              const matched = all.find((f) => f._id === parsed._id);
              if (matched) {
                restoredFY = matched;
              }
            }
          } catch (e) {
            // ignore
          }
        }

        if (restoredFY) {
          setSelectedFY(restoredFY);
        } else {
          setSelectedFY(current);
          if (current) {
            localStorage.setItem("ap_selected_fy", JSON.stringify(current));
          }
        }
      } catch {
        // Fallback: build current FY on the client
        const now = new Date();
        const aprilYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
        const fallback = buildFY(aprilYear, company.id);
        setAvailableFYs([fallback]);
        setSelectedFY(fallback);
        localStorage.setItem("ap_selected_fy", JSON.stringify(fallback));
      } finally {
        setFyLoading(false);
      }
    })();
  }, [company.id]);

  return (
    <AppContext.Provider value={{
      company, setCompany,
      selectedFY, setSelectedFY: handleSetSelectedFY,
      availableFYs, setAvailableFYs,
      fyLoading,
      sidebarCollapsed, setSidebarCollapsed,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);

// Convenience: returns just the selected FY label string (for pages that only need the label)
export const useFYLabel = () => useContext(AppContext).selectedFY?.label ?? "—";
