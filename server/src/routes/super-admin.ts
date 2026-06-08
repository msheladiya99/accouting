import { Router, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { SuperAdmin } from "../models/SuperAdmin";
import { Company } from "../models/Company";
import { User } from "../models/User";
import { Ledger } from "../models/Ledger";
import { AccountGroup } from "../models/AccountGroup";
import { authMiddleware, requireSuperAdmin, AuthenticatedRequest } from "../middleware/auth";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "accountpro-demo-2026-secure-secret-key-12345";
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const DEFAULT_GROUPS_SEEDS = [
  { groupName: "Direct Expenses", superGroup: "Expenses (Direct)" },
  { groupName: "Income (Trading)", superGroup: "Income (Trading)" },
  { groupName: "Purchase Account", superGroup: "Purchase Account" },
  { groupName: "Sales Account", superGroup: "Sales Account" },
  { groupName: "Expense Account", superGroup: "Expense Account" },
  { groupName: "Financial Expenses", superGroup: "Expense Account" },
  { groupName: "Income", superGroup: "Income" },
  { groupName: "Income (Other Then Sales)", superGroup: "Income (Other Then Sales)" },
  { groupName: "Indirect Expenses", superGroup: "Expense Account" },
  { groupName: "Partner Interest", superGroup: "Partner Interest" },
  { groupName: "Partner Remuneration", superGroup: "Partner Remuneration" },
  { groupName: "Advances From Customers", superGroup: "Current Liabilities" },
  { groupName: "Bank Accounts (Banks)", superGroup: "Current Assets" },
  { groupName: "Bank OCC a/c", superGroup: "Loans (Liability)" },
  { groupName: "Capital Account", superGroup: "Capital Account" },
  { groupName: "Cash Ledger A/C.", superGroup: "Cash Ledger A/C." },
  { groupName: "Cash-in-hand", superGroup: "Current Assets" },
  { groupName: "Current Capital Account", superGroup: "Capital Account" },
  { groupName: "Current Liabilities", superGroup: "Current Liabilities" },
  { groupName: "Deposits (Asset)", superGroup: "Current Assets" },
  { groupName: "Duties & Taxes", superGroup: "Current Liabilities" },
  { groupName: "Fixed Assets", superGroup: "Fixed Assets" },
  { groupName: "Investments", superGroup: "Investments" },
  { groupName: "Loans & Advances (Asset)", superGroup: "Current Assets" },
  { groupName: "Loans (Liability)", superGroup: "Loans (Liability)" },
  { groupName: "Misc. Expenses (Asset)", superGroup: "Misc. Expenses (Asset)" },
  { groupName: "Profit & Loss A/c", superGroup: "Profit & Loss A/c" },
  { groupName: "Provisions", superGroup: "Current Liabilities" },
  { groupName: "Reserves & Surplus", superGroup: "Capital Account" },
  { groupName: "Salary Expenses Payable", superGroup: "Current Liabilities" },
  { groupName: "Secured Loans", superGroup: "Loans (Liability)" },
  { groupName: "Stock-in-hand", superGroup: "Stock-in-hand" },
  { groupName: "Sundry Creditors", superGroup: "Current Liabilities" },
  { groupName: "Sundry Creditors - Material", superGroup: "Current Liabilities" },
  { groupName: "Sundry Creditors - Services", superGroup: "Current Liabilities" },
  { groupName: "Sundry Debtors", superGroup: "Current Assets" },
  { groupName: "Suspense Account", superGroup: "Suspense Account" },
  { groupName: "Unsecured Loans", superGroup: "Loans (Liability)" },
  { groupName: "Assets", superGroup: "Current Assets" },
  { groupName: "Liabilities", superGroup: "Current Liabilities" },
  { groupName: "Capital", superGroup: "Capital Account" },
  { groupName: "Income", superGroup: "Income" },
  { groupName: "Expense", superGroup: "Expense Account" },
  { groupName: "Bank", superGroup: "Current Assets" },
  { groupName: "Cash", superGroup: "Current Assets" },
  { groupName: "Purchases", superGroup: "Purchase Account" },
  { groupName: "Sales", superGroup: "Sales Account" }
];

// Helper to slugify company names
function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .replace(/\s+/g, "-") // Replace spaces with -
    .replace(/[^\w\-]+/g, "") // Remove all non-word chars
    .replace(/\-\-+/g, "-") // Replace multiple - with single -
    .replace(/^-+/, "") // Trim - from start
    .replace(/-+$/, ""); // Trim - from end
}

// Super Admin Login
router.post("/login", async (req, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const admin = await SuperAdmin.findOne({ email: email.toLowerCase() });
    if (!admin) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, admin.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { sub: admin._id, id: admin._id, email: admin.email, role: "SUPER_ADMIN", name: admin.name },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      token,
      user: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: "SUPER_ADMIN"
      }
    });
  } catch (error) {
    console.error("Super Admin Login Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Dashboard Stats & Charts
router.get("/dashboard", authMiddleware as any, requireSuperAdmin as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const [
      totalFirms,
      activeFirms,
      suspendedFirms,
      totalUsers,
      totalLedgers,
      recentCompanies
    ] = await Promise.all([
      Company.countDocuments({ parentCompanyId: null }),
      Company.countDocuments({ status: "active", parentCompanyId: null }),
      Company.countDocuments({ status: "suspended", parentCompanyId: null }),
      User.countDocuments(),
      Ledger.countDocuments(),
      Company.find({ parentCompanyId: null }).sort({ createdAt: -1 }).limit(5).lean()
    ]);

    const totalRevenue = activeFirms * 2000; // estimated monthly revenue

    // Growth trend over last 6 months
    const last6Months = Array.from({ length: 6 }).map((_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      return {
        month: d.toLocaleString("default", { month: "short" }),
        count: 0,
        fullMonth: d.getMonth(),
        fullYear: d.getFullYear()
      };
    }).reverse();

    const allCompanies = await Company.find({ parentCompanyId: null }, "createdAt").lean();
    allCompanies.forEach((c) => {
      if (!c.createdAt) return;
      const firmDate = new Date(c.createdAt);
      const item = last6Months.find(
        (m) => m.fullMonth === firmDate.getMonth() && m.fullYear === firmDate.getFullYear()
      );
      if (item) item.count++;
    });

    const planDistribution = [
      { name: "Trial", value: Math.round(totalFirms * 0.4) || 0 },
      { name: "Basic", value: Math.round(totalFirms * 0.3) || 0 },
      { name: "Professional", value: Math.round(totalFirms * 0.2) || 0 },
      { name: "Enterprise", value: Math.round(totalFirms * 0.1) || 0 }
    ];

    res.json({
      widgets: {
        totalFirms,
        activeFirms,
        suspendedFirms,
        totalUsers,
        totalRevenue,
        totalLedgers
      },
      recentFirms: recentCompanies.map(c => ({
        _id: c._id,
        firmName: c.companyName,
        subdomain: c.subdomain,
        plan: "Professional",
        status: c.status,
        createdAt: c.createdAt
      })),
      charts: {
        firmRegistrations: last6Months,
        plansDistribution: planDistribution
      }
    });
  } catch (error) {
    console.error("Super Admin Dashboard Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// List all companies
router.get("/companies", authMiddleware as any, requireSuperAdmin as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const companies = await Company.find({ parentCompanyId: null }).sort({ createdAt: -1 }).lean();
    
    const enrichedCompanies = await Promise.all(
      companies.map(async (c) => {
        const usersCount = await User.countDocuments({ companyId: c._id });
        const ledgersCount = await Ledger.countDocuments({ companyId: c._id });
        return {
          ...c,
          usersCount,
          ledgersCount
        };
      })
    );

    res.json(enrichedCompanies);
  } catch (error) {
    console.error("Super Admin Get Companies Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Get single company details
router.get("/companies/:id", authMiddleware as any, requireSuperAdmin as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }
    const users = await User.find({ companyId: company._id }).select("-password");
    res.json({
      company,
      users,
      stats: {
        ledgersCount: await Ledger.countDocuments({ companyId: company._id })
      }
    });
  } catch (error) {
    console.error("Super Admin Get Company Details Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Create a new Company (Firm)
router.post("/companies", authMiddleware as any, requireSuperAdmin as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      firmName,
      adminEmail,
      adminName,
      adminPassword,
      mobileNumber,
      panNumber
    } = req.body;
    let { subdomain } = req.body;

    if (!firmName || !adminEmail || !adminPassword || !panNumber) {
      return res.status(400).json({ message: "Company name, admin email, password, and PAN are required" });
    }

    // Auto-generate subdomain if not provided
    if (!subdomain) {
      subdomain = slugify(firmName);
    }

    // Ensure unique subdomain
    let finalSubdomain = subdomain;
    let counter = 1;
    while (await Company.findOne({ subdomain: finalSubdomain })) {
      finalSubdomain = `${subdomain}${counter}`;
      counter++;
    }

    // Check if user already exists
    const userConflict = await User.findOne({ email: adminEmail.toLowerCase() });
    if (userConflict) {
      return res.status(400).json({ message: "A user with this admin email already exists" });
    }

    // 1. Create Company
    const company = new Company({
      companyName: firmName,
      subdomain: finalSubdomain,
      panNumber: panNumber.toUpperCase(),
      status: "active",
      parentCompanyId: null
    });
    await company.save();

    // 2. Automatically create default account groups and ledgers
    const defaultGroups = DEFAULT_GROUPS_SEEDS.map((g) => ({
      groupName: g.groupName,
      superGroup: g.superGroup,
      companyId: company._id
    }));
    await AccountGroup.insertMany(defaultGroups);

    const defaultLedgers = DEFAULT_GROUPS_SEEDS.map((g) => ({
      ledgerName: g.groupName,
      groupName: g.groupName,
      companyId: company._id
    }));
    await Ledger.insertMany(defaultLedgers);

    // 3. Create Admin User for this Company
    const bcryptLib = await import("bcryptjs");
    const passwordHash = await bcryptLib.hash(adminPassword, 10);
    const initials = (adminName || firmName)
      .split(" ")
      .map((w: string) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

    const adminUser = new User({
      name: adminName || `${firmName} Admin`,
      email: adminEmail.toLowerCase(),
      password: passwordHash,
      role: "Admin",
      status: "Active",
      companyId: company._id,
      avatar: initials
    });
    await adminUser.save();

    res.status(201).json({
      message: "Company and Admin user created successfully",
      company,
      adminUser: {
        _id: adminUser._id,
        name: adminUser.name,
        email: adminUser.email,
        role: adminUser.role
      }
    });
  } catch (error) {
    console.error("Super Admin Create Company Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Update Company Status (Suspend/Activate)
router.patch("/companies/:id", authMiddleware as any, requireSuperAdmin as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { status } = req.body;
    if (!["active", "suspended"].includes(status)) {
      return res.status(400).json({ message: "Invalid status value" });
    }

    const company = await Company.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    res.json(company);
  } catch (error) {
    console.error("Super Admin Patch Company Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Reset admin password
router.post("/companies/:id/reset-password", authMiddleware as any, requireSuperAdmin as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword) {
      return res.status(400).json({ message: "New password is required" });
    }

    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Update all users who are Admins of this company
    await User.updateMany(
      { companyId: company._id, role: "Admin" },
      { password: passwordHash }
    );

    res.json({ message: "Company Admin password has been successfully reset" });
  } catch (error) {
    console.error("Super Admin Reset Password Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Delete Company
router.delete("/companies/:id", authMiddleware as any, requireSuperAdmin as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const company = await Company.findByIdAndDelete(req.params.id);
    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    // Clean up users associated with this company
    await User.deleteMany({ companyId: company._id });

    // Clean up ledgers, account groups
    await Ledger.deleteMany({ companyId: company._id });
    await AccountGroup.deleteMany({ companyId: company._id });

    res.json({ message: "Company and its associated users and ledgers deleted successfully" });
  } catch (error) {
    console.error("Super Admin Delete Company Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
