import axios from "axios";
import { getSubdomain } from "../utils/subdomain";

export const axiosClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
  headers: {
    "Content-Type": "application/json"
  }
});

// ── In-flight GET deduplication ────────────────────────────────────────────────
// Prevents duplicate HTTP requests when two components simultaneously call the
// same endpoint (e.g., during page mount). Only one real request is made;
// subsequent callers receive the same promise. React Query already deduplicates
// at the hook level, but this covers any remaining axiosClient.get() call sites.
const inflightGets = new Map<string, Promise<any>>();

function makeInflightKey(url: string, params?: Record<string, any>): string {
  const paramStr = params ? JSON.stringify(params) : "";
  return `${url}::${paramStr}`;
}

// Request interceptor to automatically add JWT bearer tokens and company ID scoping headers
axiosClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("ap_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    const subdomain = getSubdomain();
    if (subdomain) {
      config.headers["x-tenant-id"] = subdomain;
    }

    const savedCompany = localStorage.getItem("ap_company");
    const isLogin = config.url?.endsWith("/login");
    const isCurrentCompany = config.url?.endsWith("/company/current");
    if (savedCompany && (!isLogin && (!isCurrentCompany || token))) {
      try {
        const companyObj = JSON.parse(savedCompany);
        if (companyObj && companyObj.id) {
          config.headers["x-company-id"] = companyObj.id;
        }
      } catch (e) {
        // ignore JSON parsing errors
      }
    }

    const savedFY = localStorage.getItem("ap_selected_fy");
    if (savedFY) {
      try {
        const fyObj = JSON.parse(savedFY);
        if (fyObj && fyObj._id) {
          config.headers["x-financial-year-id"] = fyObj._id;
        }
      } catch (e) {
        // ignore JSON parsing errors
      }
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle errors globally
axiosClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      // If 401 unauthorized, clean up token and redirect to login
      if (error.response.status === 401) {
        localStorage.removeItem("ap_token");
        // If not already on login page or superadmin page, redirect to appropriate login
        const path = window.location.pathname;
        if (!path.endsWith("/login") && !path.endsWith("/superadmin")) {
          if (path.startsWith("/super-admin")) {
            window.location.href = "/superadmin";
          } else {
            window.location.href = "/login";
          }
        }
      }
      
      // If 404 and company is not found, clear storage and redirect to select company
      if (error.response.status === 404 && error.response.data.message === "Selected company not found") {
        localStorage.removeItem("ap_company");
        localStorage.removeItem("ap_selected_fy");
        if (!window.location.pathname.endsWith("/company-select")) {
          window.location.href = "/company-select";
        }
      }

      return Promise.reject(new Error(error.response.data.message || "Request failed"));
    }
    return Promise.reject(error);
  }
);

/**
 * GET with automatic in-flight deduplication.
 * If two callers request the same URL+params simultaneously, only one HTTP
 * request fires. Both callers receive the same response data.
 * React Query already does this at the hook level; this is a fallback for
 * direct axiosClient.get() usage outside of hooks.
 */
export async function deduplicatedGet<T>(url: string, params?: Record<string, any>): Promise<T> {
  const key = makeInflightKey(url, params);
  if (inflightGets.has(key)) {
    const data = await inflightGets.get(key)!;
    return data as T;
  }
  const promise = axiosClient.get<T>(url, params ? { params } : undefined)
    .then((r) => r.data)
    .finally(() => inflightGets.delete(key));
  inflightGets.set(key, promise);
  return promise;
}

export default axiosClient;

