import axiosClient from "./axiosClient";

export interface Company {
  _id: string;
  companyName: string;
  panNumber: string;
  createdAt: string;
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

export async function updateCompany(id: string, payload: Partial<CreateCompanyPayload>): Promise<Company> {
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
