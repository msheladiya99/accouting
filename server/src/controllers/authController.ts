import { Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User } from "../models/User";
import { AuthenticatedRequest } from "../middleware/auth";

const JWT_SECRET = process.env.JWT_SECRET || "accountpro-demo-2026-secure-secret-key-12345";
const TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

export async function login(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { email, password } = req.body;
  try {
    if (!email || !password) {
      res.status(400).json({ message: "Email and password are required" });
      return;
    }

    const companyId = (req as any).companyId || req.headers["x-company-id"];
    const query: any = { email: email.toLowerCase() };
    if (companyId) {
      query.companyId = companyId;
    }

    const user = await User.findOne(query);
    if (!user) {
      res.status(401).json({ message: "Invalid email or password" });
      return;
    }

    if (user.status === "Inactive") {
      res.status(403).json({ message: "Account is inactive. Contact your administrator." });
      return;
    }

    // Compare passwords: support both hashed in production and plaintext from seeder/development
    let isMatch = false;
    if (password === user.password) {
      isMatch = true;
    } else {
      isMatch = await bcrypt.compare(password, user.password);
    }

    if (!isMatch) {
      res.status(401).json({ message: "Invalid email or password" });
      return;
    }

    // Update lastLogin
    user.lastLogin = new Date();
    await user.save();

    const payload = {
      sub: user._id,
      email: user.email,
      role: user.role,
      name: user.name,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor((Date.now() + TTL_MS) / 1000)
    };

    const token = jwt.sign(payload, JWT_SECRET);

    // Remove password from returned user object
    const userObj = user.toObject();
    delete (userObj as any).password;

    res.json({ token, user: userObj });
  } catch (error: any) {
    console.error("Login error:", error);
    res.status(500).json({ message: error.message || "Server error during login" });
  }
}

export async function logout(req: AuthenticatedRequest, res: Response): Promise<void> {
  res.json({ message: "Logged out successfully" });
}
