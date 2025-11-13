import express from "express";
import pool from "../models/db.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import { verifyAdmin } from "../middleware/auth.js"; // ✅ renamed

dotenv.config();
const router = express.Router();



// ✅ LOGIN ROUTE (with bcrypt + JWT)
router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    // Find admin by email
    const [rows] = await pool.query(
      "SELECT * FROM admin_accounts WHERE email = ?",
      [username]
    );

    if (rows.length === 0) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const admin = rows[0];

    // Check password hash
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Create JWT token WITH ROLE
    const token = jwt.sign(
      { 
        id: admin.id, 
        email: admin.email, 
        role: admin.role || 'super_admin'  // ✅ Add role here
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "1d" }
    );

    res.json({
      message: "Login successful",
      token,
      admin: { 
        id: admin.id, 
        email: admin.email,
        role: admin.role || 'super_admin'  // ✅ Return role to frontend
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


router.get("/dashboard", verifyAdmin, (req, res) => {
  res.json({ message: "Welcome Admin", user: req.user });
});

export default router;
