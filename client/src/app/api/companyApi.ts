import axiosClient from "./axiosClient";

export interface Company {
  _id: string;
  companyName: string;
  panNumber: string;
  createdAt: string;
  address?: string;
  mobileNumber?: string;
  email?: string;
  currency?: string;
  emailNotificationsEnabled?: boolean;
  smtpHost?: string;
  smtpPort?: string;
  smtpUsername?: string;
  smtpPassword?: string;
  smtpFromName?: string;
  smtpFromEmail?: string;
  notifyOnExport?: boolean;
  notifyOnBackup?: boolean;
  notifyOnLogin?: boolean;
}

export interface CreateCompanyPayload {
  companyName: string;
  panNumber: string;
}

// ── API functions ─────────────────────────────────────────────────────────────

export async function createCompany(payload: CreateCompanyPayload): Promise<Company> {
  const res = await axiosClient.post<Company>("/company/create", payload);
  return res.data;
}

export async function getAllCompanies(): Promise<Company[]> {
  const res = await axiosClient.get<Company[]>("/company");
  return res.data;
}

export async function getCompanyById(id: string): Promise<Company> {
  const res = await axiosClient.get<Company>(`/company/${id}`);
  return res.data;
}

export async function updateCompany(id: string, payload: any): Promise<Company> {
  const res = await axiosClient.put<Company>(`/company/${id}`, payload);
  return res.data;
}

export async function deleteCompany(id: string): Promise<void> {
  await axiosClient.delete(`/company/${id}`);
}

export async function getCurrentCompany(): Promise<Company> {
  const res = await axiosClient.get<Company>("/company/current");
  return res.data;
}

export async function sendTestEmail(id: string, payload: any): Promise<void> {
  await axiosClient.post(`/company/${id}/test-email`, payload);
}
