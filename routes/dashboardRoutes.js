import express from "express";
import db from "../models/db.js";

const router = express.Router();

/* ===========================
   GET Dashboard Stats
=========================== */
router.get("/stats", async (req, res) => {
  try {
    /* 1️⃣ Count by enrollment_status */
    const statusResult = await db.query(`
      SELECT enrollment_status AS status, COUNT(*)::int AS total
      FROM student_details
      GROUP BY enrollment_status
    `);

    const statusCounts = statusResult.rows;

    /* 2️⃣ Count by student_type */
    const typeResult = await db.query(`
      SELECT student_type AS type, COUNT(*)::int AS total
      FROM student_details
      GROUP BY student_type
    `);

    const typeCounts = typeResult.rows;

    /* 3️⃣ Initialize counters */
    const counts = {
      enrolled: 0,
      temporary_enrolled: 0,
      rejected: 0,
      pending: 0,
      under_review: 0,
      new_enrollees: 0,
      transferees: 0,
      returnees: 0,
    };

    /* 4️⃣ Process enrollment_status */
    statusCounts.forEach(row => {
      if (!row.status) return;

      const status = row.status.toLowerCase().trim();

      if (status === "enrolled") {
        counts.enrolled = row.total;
      } else if (status === "temporary enrolled") {
        counts.temporary_enrolled = row.total;
      } else if (status === "rejected") {
        counts.rejected = row.total;
      } else if (status === "pending") {
        counts.pending = row.total;
      } else if (status === "under review") {
        counts.under_review = row.total;
      }
      else if (status.includes("reject")) {
        counts.rejected = row.total;
      } else if (status.includes("pending")) {
        counts.pending = row.total;
      } else if (status.includes("under review")) {
        counts.under_review = row.total;
      }
    });

    /* 5️⃣ Process student_type */
    typeCounts.forEach(row => {
      if (!row.type) return;

      const type = row.type.toLowerCase().trim();

      if (type === "new enrollee") {
        counts.new_enrollees += row.total;
      } else if (type === "transferee") {
        counts.transferees = row.total;
      } else if (type === "returnee") {
        counts.returnees = row.total;
      }
    });

    /* 6️⃣ Enrollment Trend (Last 6 Months - PostgreSQL Version) */
    const trendResult = await db.query(`
      SELECT 
        TO_CHAR(created_at, 'Mon YYYY') AS month,
        COUNT(*)::int AS count
      FROM student_details
      WHERE created_at >= CURRENT_DATE - INTERVAL '6 months'
      GROUP BY DATE_TRUNC('month', created_at), month
      ORDER BY DATE_TRUNC('month', created_at)
    `);

    const trend = trendResult.rows;

    /* 7️⃣ Strand Distribution */
    const strandResult = await db.query(`
      SELECT strand, COUNT(*)::int AS count
      FROM student_details
      WHERE strand IS NOT NULL AND strand <> ''
      GROUP BY strand
    `);

    const strand = strandResult.rows;

    /* ✅ Send response */
    res.json({
      ...counts,
      trend,
      strand,
    });

  } catch (err) {
    console.error("DB error:", err);
    res.status(500).json({
      error: "Database error",
      details: err.message,
    });
  }
});

export default router;
