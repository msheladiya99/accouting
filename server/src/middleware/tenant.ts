import { Request, Response, NextFunction } from "express";
import { Company } from "../models/Company";

export const tenantMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  // 1. Get host/tenant details from headers
  const host = req.headers.host || "";
  const headerTenant = req.headers["x-tenant-id"];
  
  let subdomain = "";

  if (headerTenant && typeof headerTenant === "string") {
    subdomain = headerTenant.toLowerCase();
  } else {
    const hostname = host.split(":")[0].toLowerCase();
    
    // Extract subdomain (e.g., company.localhost or company.domain.com)
    if (hostname !== "localhost" && !/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
      const parts = hostname.split(".");
      const isCloudProvider = hostname.endsWith(".onrender.com") || 
                              hostname.endsWith(".vercel.app") || 
                              hostname.endsWith(".herokuapp.com");
      if (isCloudProvider) {
        if (parts.length >= 4) {
          const sub = parts[0];
          if (!["www", "api", "admin", "superadmin", "super-admin", "localhost"].includes(sub)) {
            subdomain = sub;
          }
        }
      } else {
        if (parts.length >= 3) {
          const sub = parts[0];
          if (!["www", "api", "admin", "superadmin", "super-admin", "localhost"].includes(sub)) {
            subdomain = sub;
          }
        }
      }
    }
  }
  // Skip tenant resolution for super-admin API or routes, or when no subdomain is present
  if (
    req.path.startsWith("/super-admin") ||
    req.path.startsWith("/api/super-admin") ||
    !subdomain
  ) {
    return next();
  }

  try {
    const tenantCompany = await Company.findOne({ subdomain, status: "active" });

    if (!tenantCompany) {
      return res.status(404).json({ 
        message: `Company not found or suspended for subdomain: ${subdomain}` 
      });
    }

    // Respect the user's selected company/firm if it belongs to the resolved tenant
    // EXCEPT for authentication (login)
    const isAuth = req.path.endsWith("/auth/login");
    const headerCompanyId = req.headers["x-company-id"];
    let finalCompanyId = tenantCompany._id.toString();

    if (headerCompanyId && typeof headerCompanyId === "string" && !isAuth) {
      try {
        const selectedCompany = await Company.findById(headerCompanyId);
        if (
          selectedCompany &&
          (selectedCompany._id.toString() === tenantCompany._id.toString() ||
           selectedCompany.parentCompanyId?.toString() === tenantCompany._id.toString())
        ) {
          finalCompanyId = selectedCompany._id.toString();
        }
      } catch (e) {
        // ignore invalid/malformed IDs
      }
    }

    // Set the headers and req parameter so that existing scoping works automatically
    req.headers["x-company-id"] = finalCompanyId;
    (req as any).companyId = finalCompanyId;
    (req as any).company = tenantCompany;
    next();
  } catch (error) {
    console.error("Tenant middleware error:", error);
    res.status(500).json({ message: "Internal server error in tenant middleware" });
  }
};
