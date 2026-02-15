// routes/SecondSemester.js
import express from "express";
import db from "../models/db.js";

const router = express.Router();

/* ==========================================
   ✅ Get 2nd Semester Enrollment Status
========================================== */
router.get("/status", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT value, start_date, end_date
       FROM second_semester_settings
       WHERE name = $1`,
      ["second_sem_enrollment"]
    );

    if (result.rows.length === 0) {
      return res.json({
        status: "closed",
        startDate: null,
        endDate: null,
      });
    }

    const row = result.rows[0];

    const formatDateForResponse = (date) => {
      if (!date) return null;

      const d = new Date(date);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");

      return `${year}-${month}-${day}`;
    };

    res.json({
      status: row.value,
      startDate: formatDateForResponse(row.start_date),
      endDate: formatDateForResponse(row.end_date),
    });

  } catch (err) {
    console.error("Second semester status error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ==========================================
   ✅ Toggle 2nd Semester Enrollment
========================================== */
router.post("/toggle", async (req, res) => {
  try {
    const { status } = req.body;

    await db.query(
      `UPDATE second_semester_settings
       SET value = $1
       WHERE name = $2`,
      [status, "second_sem_enrollment"]
    );

    res.json({ message: `Enrollment status updated to ${status}` });

  } catch (err) {
    console.error("Toggle error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ==========================================
   ✅ Save 2nd Semester Dates
========================================== */
router.post("/dates", async (req, res) => {
  try {
    const { startDate, endDate } = req.body;

    if (startDate && endDate && new Date(startDate) >= new Date(endDate)) {
      return res
        .status(400)
        .json({ error: "End date must be after start date" });
    }

    await db.query(
      `UPDATE second_semester_settings
       SET start_date = $1,
           end_date = $2
       WHERE name = $3`,
      [startDate || null, endDate || null, "second_sem_enrollment"]
    );

    res.json({ message: "2nd semester dates saved successfully" });

  } catch (err) {
    console.error("Date save error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
