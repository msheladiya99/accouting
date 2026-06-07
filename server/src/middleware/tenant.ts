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
      if (parts.length >= 2) {
        const sub = parts[0];
        if (!["www", "api", "admin", "superadmin", "super-admin", "localhost"].includes(sub)) {
          subdomain = sub;
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
    const company = await Company.findOne({ subdomain, status: "active" });

    if (!company) {
      return res.status(404).json({ 
        message: `Company not found or suspended for subdomain: ${subdomain}` 
      });
    }

    // Set the headers and req parameter so that existing scoping works automatically
    req.headers["x-company-id"] = company._id.toString();
    (req as any).companyId = company._id.toString();
    (req as any).company = company;
    next();
  } catch (error) {
    console.error("Tenant middleware error:", error);
    res.status(500).json({ message: "Internal server error in tenant middleware" });
  }
};
