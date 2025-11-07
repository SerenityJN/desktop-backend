import express from "express";
import db from "../models/db.js";

const router = express.Router();

// Get enrollment status
router.get("/status", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT value FROM second_semester_settings WHERE name = 'second_sem_enrollment'");
    const status = rows.length ? rows[0].value : "closed";
    res.json({ status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// Toggle enrollment status
router.post("/toggle", async (req, res) => {
  try {
    const { status } = req.body; // expected "open" or "closed"
    await db.query(
      "INSERT INTO second_semester_settings (name, value) VALUES ('second_sem_enrollment', ?) ON DUPLICATE KEY UPDATE value=?",
      [status, status]
    );
    res.json({ message: `Enrollment status updated to ${status}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
