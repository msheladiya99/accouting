import { Response } from "express";
import bcrypt from "bcryptjs";
import { User } from "../models/User";
import { AuthenticatedRequest } from "../middleware/auth";

export async function getAllUsers(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const query: any = {};
    if (req.companyId) {
      query.companyId = req.companyId;
    }
    const users = await User.find(query).select("-password");
    res.json(users);
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to retrieve users" });
  }
}

export async function createUser(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { name, email, password, role, status } = req.body;
  try {
    if (!name || !email || !password || !role) {
      res.status(400).json({ message: "Name, email, password, and role are required" });
      return;
    }

    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) {
      res.status(400).json({ message: "A user with this email already exists" });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const initials = name
      .split(" ")
      .map((w: string) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

    const user = new User({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      role,
      status: status || "Active",
      avatar: initials,
      companyId: req.companyId
    });

    await user.save();

    const userObj = user.toObject();
    delete (userObj as any).password;

    res.status(201).json(userObj);
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to create user" });
  }
}

export async function updateUser(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const { name, email, role, status } = req.body;
  try {
    const user = await User.findById(id);
    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    if (email) {
      const conflict = await User.findOne({
        email: email.toLowerCase(),
        _id: { $ne: id }
      });
      if (conflict) {
        res.status(400).json({ message: "Email already in use" });
        return;
      }
      user.email = email.toLowerCase();
    }

    if (name) {
      user.name = name;
      user.avatar = name
        .split(" ")
        .map((w: string) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    }
    if (role) user.role = role;
    if (status) user.status = status;

    await user.save();

    const userObj = user.toObject();
    delete (userObj as any).password;

    res.json(userObj);
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to update user" });
  }
}

export async function deleteUser(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  try {
    const user = await User.findById(id);
    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    await User.findByIdAndDelete(id);
    res.json({ message: "User deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to delete user" });
  }
}

export async function resetPassword(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const { newPassword } = req.body;
  try {
    if (!newPassword) {
      res.status(400).json({ message: "New password is required" });
      return;
    }

    const user = await User.findById(id);
    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.json({ message: "Password reset successful" });
  } catch (error: any) {
    res.status(500).json({ message: error.message || "Failed to reset password" });
  }
}
