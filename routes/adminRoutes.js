import express from "express";
import pool from "../models/db.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import { verifyAdmin } from "../middleware/auth.js";

dotenv.config();
const router = express.Router();

/* ======================================================
   ✅ LOGIN ROUTE (PostgreSQL FIXED)
====================================================== */
router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    const result = await pool.query(
      "SELECT * FROM admin_accounts WHERE email = $1",
      [username]
    );

    const rows = result.rows;

    if (rows.length === 0) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const admin = rows[0];

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      {
        id: admin.id,
        email: admin.email,
        role: admin.role || "super_admin",
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
        role: admin.role || "super_admin",
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ======================================================
   ✅ DASHBOARD
====================================================== */
router.get("/dashboard", verifyAdmin, (req, res) => {
  res.json({ message: "Welcome Admin", user: req.user });
});

/* ======================================================
   ✅ SUPER ADMIN CHECK
====================================================== */
const verifySuperAdmin = (req, res, next) => {
  if (req.user?.role !== "super_admin") {
    return res.status(403).json({
      message: "Access denied. Super admin only.",
    });
  }
  next();
};

/* ======================================================
   ✅ GET ALL ACCOUNTS
====================================================== */
router.get("/accounts", verifyAdmin, verifySuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        id,
        email,
        role,
        full_name,
        status,
        TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') as created_at
      FROM admin_accounts
      ORDER BY created_at DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching admin accounts:", error);
    res.status(500).json({ message: "Server error" });
  }
});

/* ======================================================
   ✅ GET SINGLE ACCOUNT
====================================================== */
router.get("/accounts/:id", verifyAdmin, verifySuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        id,
        email,
        role,
        full_name,
        status,
        TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') as created_at
       FROM admin_accounts
       WHERE id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Admin account not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching admin account:", error);
    res.status(500).json({ message: "Server error" });
  }
});

/* ======================================================
   ✅ CREATE ADMIN
====================================================== */
router.post("/accounts", verifyAdmin, verifySuperAdmin, async (req, res) => {
  const {
    email,
    password,
    confirm_password,
    role,
    full_name,
    status = "active",
  } = req.body;

  if (!email || !password || !role) {
    return res
      .status(400)
      .json({ message: "Email, password, and role are required" });
  }

  if (password !== confirm_password) {
    return res.status(400).json({ message: "Passwords do not match" });
  }

  if (password.length < 6) {
    return res
      .status(400)
      .json({ message: "Password must be at least 6 characters" });
  }

  try {
    const existing = await pool.query(
      "SELECT id FROM admin_accounts WHERE email = $1",
      [email]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ message: "Email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO admin_accounts
        (email, password, role, full_name, status, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING id`,
      [email, hashedPassword, role, full_name || null, status]
    );

    res.status(201).json({
      message: "Admin account created successfully",
      adminId: result.rows[0].id,
    });
  } catch (error) {
    console.error("Error creating admin account:", error);
    res.status(500).json({ message: "Server error" });
  }
});

/* ======================================================
   ✅ UPDATE ADMIN
====================================================== */
router.put("/accounts/:id", verifyAdmin, verifySuperAdmin, async (req, res) => {
  const { email, role, full_name, status } = req.body;
  const adminId = req.params.id;

  try {
    const existing = await pool.query(
      "SELECT id FROM admin_accounts WHERE id = $1",
      [adminId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ message: "Admin not found" });
    }

    await pool.query(
      `UPDATE admin_accounts
       SET email = $1,
           role = $2,
           full_name = $3,
           status = $4
       WHERE id = $5`,
      [email, role, full_name, status, adminId]
    );

    res.json({ message: "Admin updated successfully" });
  } catch (error) {
    console.error("Error updating admin:", error);
    res.status(500).json({ message: "Server error" });
  }
});

/* ======================================================
   ✅ DELETE ADMIN
====================================================== */
router.delete("/accounts/:id", verifyAdmin, verifySuperAdmin, async (req, res) => {
  const adminId = req.params.id;

  try {
    const existing = await pool.query(
      "SELECT id FROM admin_accounts WHERE id = $1",
      [adminId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ message: "Admin not found" });
    }

    await pool.query(
      "DELETE FROM admin_accounts WHERE id = $1",
      [adminId]
    );

    res.json({ message: "Admin deleted successfully" });
  } catch (error) {
    console.error("Error deleting admin:", error);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
