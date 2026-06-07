import axiosClient from "./axiosClient";

export type FYStatus = "current" | "previous" | "future" | "closed";

export interface FinancialYear {
  _id: string;
  companyId: string;
  financialYear: string;   // "2025-26"
  label: string;           // "FY 2025-26"
  startDate: string;       // "2025-04-01"
  endDate: string;         // "2026-03-31"
  status: FYStatus;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function buildFY(baseYear: number, companyId = "default"): FinancialYear {
  const label = `${baseYear}-${String(baseYear + 1).slice(-2)}`;
  const startDate = `${baseYear}-04-01`;
  const endDate = `${baseYear + 1}-03-31`;
  
  const today = new Date();
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  let status: FYStatus = "future";
  if (today >= start && today <= end) status = "current";
  else if (today > end) status = "previous";

  return {
    _id: `fy-${label}`,
    companyId,
    financialYear: label,
    label: `FY ${label}`,
    startDate,
    endDate,
    status
  };
}

// ── API functions ─────────────────────────────────────────────────────────────

export async function getAllFYs(): Promise<FinancialYear[]> {
  const res = await axiosClient.get<FinancialYear[]>("/financial-year");
  return res.data;
}

export async function getCurrentFY(): Promise<FinancialYear> {
  const res = await axiosClient.get<FinancialYear>("/financial-year/current");
  return res.data;
}

export async function getFYById(id: string): Promise<FinancialYear> {
  const res = await axiosClient.get<FinancialYear>(`/financial-year/${id}`);
  return res.data;
}

export async function generateFYs(baseYears: number[], companyId = "default"): Promise<FinancialYear[]> {
  const res = await axiosClient.post<FinancialYear[]>("/financial-year/generate", { baseYears, companyId });
  return res.data;
}

export async function closeFY(id: string): Promise<FinancialYear> {
  const res = await axiosClient.put<FinancialYear>(`/financial-year/${id}/close`);
  return res.data;
}

export async function deleteFY(id: string): Promise<void> {
  await axiosClient.delete(`/financial-year/${id}`);
}

export async function createFY(startDate: string, endDate: string): Promise<FinancialYear> {
  const res = await axiosClient.post<FinancialYear>("/financial-year", { startDate, endDate });
  return res.data;
}
