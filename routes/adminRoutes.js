import express from "express";
import pool from "../models/db.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import { verifyAdmin } from "../middleware/auth.js";

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
        role: admin.role || 'super_admin'
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
        role: admin.role || 'super_admin'
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ DASHBOARD ROUTE
router.get("/dashboard", verifyAdmin, (req, res) => {
  res.json({ message: "Welcome Admin", user: req.user });
});

// ============================================
// ✅ ADMIN ACCOUNTS MANAGEMENT ROUTES
// ============================================

// Middleware to check if user is super admin
const verifySuperAdmin = (req, res, next) => {
  if (req.user?.role !== 'super_admin') {
    return res.status(403).json({ message: 'Access denied. Super admin only.' });
  }
  next();
};

// ✅ GET ALL ADMIN ACCOUNTS (super admin only)
router.get("/accounts", verifyAdmin, verifySuperAdmin, async (req, res) => {
  try {
    const [admins] = await pool.query(`
      SELECT 
        id, 
        email, 
        role, 
        full_name, 
        status, 
        phone, 
        DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') as created_at
      FROM admin_accounts 
      ORDER BY created_at DESC
    `);
    
    res.json(admins);
  } catch (error) {
    console.error("Error fetching admin accounts:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ GET SINGLE ADMIN ACCOUNT
router.get("/accounts/:id", verifyAdmin, verifySuperAdmin, async (req, res) => {
  try {
    const [admins] = await pool.query(
      `SELECT 
        id, 
        email, 
        role, 
        full_name, 
        status, 
        phone, 
        DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') as created_at
       FROM admin_accounts 
       WHERE id = ?`,
      [req.params.id]
    );
    
    if (admins.length === 0) {
      return res.status(404).json({ message: "Admin account not found" });
    }
    
    res.json(admins[0]);
  } catch (error) {
    console.error("Error fetching admin account:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ CREATE NEW ADMIN ACCOUNT
router.post("/accounts", verifyAdmin, verifySuperAdmin, async (req, res) => {
  const { 
    email, 
    password, 
    confirm_password, 
    role, 
    full_name, 
    phone, 
    status = 'active' 
  } = req.body;
  
  // Validate required fields
  if (!email || !password || !role) {
    return res.status(400).json({ message: "Email, password, and role are required" });
  }
  
  // Check if passwords match
  if (password !== confirm_password) {
    return res.status(400).json({ message: "Passwords do not match" });
  }
  
  // Simple password validation
  if (password.length < 6) {
    return res.status(400).json({ message: "Password must be at least 6 characters" });
  }
  
  try {
    // Check if email already exists
    const [existing] = await pool.query(
      "SELECT id FROM admin_accounts WHERE email = ?",
      [email]
    );
    
    if (existing.length > 0) {
      return res.status(400).json({ message: "Email already exists" });
    }
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Insert new admin
    const [result] = await pool.query(
      `INSERT INTO admin_accounts 
        (email, password, role, full_name, phone, status, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [email, hashedPassword, role, full_name || null, phone || null, status]
    );
    
    res.status(201).json({
      message: "Admin account created successfully",
      adminId: result.insertId
    });
    
  } catch (error) {
    console.error("Error creating admin account:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ UPDATE ADMIN ACCOUNT
router.put("/accounts/:id", verifyAdmin, verifySuperAdmin, async (req, res) => {
  const { email, role, full_name, phone, status } = req.body;
  const adminId = req.params.id;
  
  try {
    // Check if admin exists
    const [existingAdmin] = await pool.query(
      "SELECT id, email, role FROM admin_accounts WHERE id = ?",
      [adminId]
    );
    
    if (existingAdmin.length === 0) {
      return res.status(404).json({ message: "Admin account not found" });
    }
    
    const currentAdmin = existingAdmin[0];
    
    // Build update query
    const updates = [];
    const values = [];
    
    if (email && email !== currentAdmin.email) {
      // Check if email already exists
      const [emailCheck] = await pool.query(
        "SELECT id FROM admin_accounts WHERE email = ? AND id != ?",
        [email, adminId]
      );
      
      if (emailCheck.length > 0) {
        return res.status(400).json({ message: "Email already exists" });
      }
      
      updates.push("email = ?");
      values.push(email);
    }
    
    if (role) {
      updates.push("role = ?");
      values.push(role);
    }
    
    if (full_name !== undefined) {
      updates.push("full_name = ?");
      values.push(full_name || null);
    }
    
    if (phone !== undefined) {
      updates.push("phone = ?");
      values.push(phone || null);
    }
    
    if (status) {
      updates.push("status = ?");
      values.push(status);
    }
    
    // If nothing to update
    if (updates.length === 0) {
      return res.status(400).json({ message: "No fields to update" });
    }
    
    // Add admin ID to values
    values.push(adminId);
    
    // Execute update
    await pool.query(
      `UPDATE admin_accounts SET ${updates.join(", ")} WHERE id = ?`,
      values
    );
    
    res.json({ message: "Admin account updated successfully" });
    
  } catch (error) {
    console.error("Error updating admin account:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ RESET ADMIN PASSWORD
router.post("/accounts/:id/reset-password", verifyAdmin, verifySuperAdmin, async (req, res) => {
  const { newPassword, confirmPassword } = req.body;
  const adminId = req.params.id;
  
  if (!newPassword || !confirmPassword) {
    return res.status(400).json({ message: "Both password fields are required" });
  }
  
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ message: "Passwords do not match" });
  }
  
  if (newPassword.length < 6) {
    return res.status(400).json({ message: "Password must be at least 6 characters" });
  }
  
  try {
    // Check if admin exists
    const [existingAdmin] = await pool.query(
      "SELECT id FROM admin_accounts WHERE id = ?",
      [adminId]
    );
    
    if (existingAdmin.length === 0) {
      return res.status(404).json({ message: "Admin account not found" });
    }
    
    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    
    // Update password
    await pool.query(
      "UPDATE admin_accounts SET password = ? WHERE id = ?",
      [hashedPassword, adminId]
    );
    
    res.json({ message: "Password reset successfully" });
    
  } catch (error) {
    console.error("Error resetting password:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ DELETE ADMIN ACCOUNT
router.delete("/accounts/:id", verifyAdmin, verifySuperAdmin, async (req, res) => {
  const adminId = req.params.id;
  
  try {
    // Check if admin exists
    const [existingAdmin] = await pool.query(
      "SELECT id, email, role FROM admin_accounts WHERE id = ?",
      [adminId]
    );
    
    if (existingAdmin.length === 0) {
      return res.status(404).json({ message: "Admin account not found" });
    }
    
    const adminToDelete = existingAdmin[0];
    
    // Prevent deleting your own account
    if (adminToDelete.email === req.user.email) {
      return res.status(400).json({ message: "You cannot delete your own account" });
    }
    
    // Prevent deleting the only super admin
    if (adminToDelete.role === "super_admin") {
      const [superAdmins] = await pool.query(
        'SELECT COUNT(*) as count FROM admin_accounts WHERE role = "super_admin"'
      );
      
      if (superAdmins[0].count <= 1) {
        return res.status(400).json({ 
          message: "Cannot delete the only super admin account" 
        });
      }
    }
    
    // Delete the admin account
    await pool.query("DELETE FROM admin_accounts WHERE id = ?", [adminId]);
    
    res.json({ message: "Admin account deleted successfully" });
    
  } catch (error) {
    console.error("Error deleting admin account:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ GET ADMIN STATISTICS (for dashboard)
router.get("/accounts/stats", verifyAdmin, async (req, res) => {
  try {
    const [stats] = await pool.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN role = 'super_admin' THEN 1 ELSE 0 END) as super_admins,
        SUM(CASE WHEN role = 'registrar' THEN 1 ELSE 0 END) as registrars,
        SUM(CASE WHEN role = 'admissions' THEN 1 ELSE 0 END) as admissions
      FROM admin_accounts
    `);
    
    res.json(stats[0]);
  } catch (error) {
    console.error("Error fetching admin stats:", error);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
