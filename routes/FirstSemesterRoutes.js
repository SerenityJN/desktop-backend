// routes/FirstSemester.js
import express from "express";
import db from "../models/db.js";

const router = express.Router();

// Get 1st semester enrollment status AND dates
// In your FirstSemester.js and SecondSemester.js

// Get enrollment status WITH dates
router.get("/status", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT value, start_date, end_date FROM first_semester_settings WHERE name = 'first_sem_enrollment'"
    );
    
    if (rows.length === 0) {
      return res.json({ 
        status: "closed", 
        startDate: null, 
        endDate: null 
      });
    }
    
    const row = rows[0];
    
    // ✅ FIX: Handle timezone correctly - return dates as YYYY-MM-DD
    const formatDateForResponse = (date) => {
      if (!date) return null;
      
      // If it's already a string in YYYY-MM-DD format, return as-is
      if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return date;
      }
      
      // Create date in local timezone to avoid UTC conversion issues
      const d = new Date(date);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      
      return `${year}-${month}-${day}`;
    };
    
    res.json({
      status: row.value,
      startDate: formatDateForResponse(row.start_date),
      endDate: formatDateForResponse(row.end_date)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// Toggle 1st semester enrollment status
router.post("/toggle", async (req, res) => {
  try {
    const { status } = req.body;
    await db.query(
      "UPDATE first_semester_settings SET value = ? WHERE name = 'first_sem_enrollment'",
      [status]
    );
    res.json({ message: `1st semester enrollment ${status}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// Save 1st semester dates
router.post("/dates", async (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    
    if (startDate && endDate && new Date(startDate) >= new Date(endDate)) {
      return res.status(400).json({ error: "End date must be after start date" });
    }
    
    await db.query(
      "UPDATE first_semester_settings SET start_date = ?, end_date = ? WHERE name = 'first_sem_enrollment'",
      [startDate || null, endDate || null]
    );
    
    res.json({ message: "1st semester dates saved successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;