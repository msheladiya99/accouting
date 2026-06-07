import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "accountpro-demo-2026-secure-secret-key-12345";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    name: string;
  };
  companyId?: string;
  financialYear?: {
    id: string;
    startDate: string;
    endDate: string;
    label: string;
  };
}

export async function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ message: "Authentication required" });
    return;
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = {
      id: decoded.sub || decoded.id,
      email: decoded.email,
      role: decoded.role,
      name: decoded.name
    };

    // Inject companyId from context or headers
    const companyId = (req as any).companyId || req.headers["x-company-id"];
    if (companyId) {
      req.companyId = companyId as string;

      // Inject financialYear context from headers
      const fyId = req.headers["x-financial-year-id"];
      const { FinancialYear } = require("../models/FinancialYear");
      
      let fyObj = null;
      if (fyId) {
        try {
          fyObj = await FinancialYear.findOne({ _id: fyId, companyId });
        } catch (e) {
          // ignore invalid/malformed IDs
        }
      }
      
      if (!fyObj) {
        // Fallback: search for "current" status active FY
        fyObj = await FinancialYear.findOne({ status: "current", companyId });
        if (!fyObj) {
          // Fallback 2: grab latest chronological FY
          fyObj = await FinancialYear.findOne({ companyId }).sort({ startDate: -1 });
        }
      }

      if (fyObj) {
        req.financialYear = {
          id: fyObj._id.toString(),
          startDate: fyObj.startDate,
          endDate: fyObj.endDate,
          label: fyObj.label
        };
      }
    }

    next();
  } catch (error) {
    res.status(401).json({ message: "Invalid or expired token" });
  }
}

export async function companyRequired(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.companyId) {
    res.status(400).json({ message: "Company selection is required (x-company-id header missing)" });
    return;
  }
  try {
    const { Company } = require("../models/Company");
    const companyExists = await Company.exists({ _id: req.companyId });
    if (!companyExists) {
      res.status(404).json({ message: "Selected company not found" });
      return;
    }
  } catch (error) {
    res.status(400).json({ message: "Invalid company ID selection" });
    return;
  }
  next();
}

export function requireSuperAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user || req.user.role !== "SUPER_ADMIN") {
    res.status(403).json({ message: "Access denied. Superadmin role required." });
    return;
  }
  next();
}
