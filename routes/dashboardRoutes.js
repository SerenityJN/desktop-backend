import express from "express";
import db from "../models/db.js";

const router = express.Router();

// ============================
// GET Dashboard Stats
// ============================
router.get("/stats", async (req, res) => {
  try {
    // 1️⃣ Count by enrollment_status
    const [statusCounts] = await db.query(`
      SELECT enrollment_status AS status, COUNT(*) AS total
      FROM student_details
      GROUP BY enrollment_status
    `);

    // 2️⃣ Count by student_type
    const [typeCounts] = await db.query(`
      SELECT student_type AS type, COUNT(*) AS total
      FROM student_details
      GROUP BY student_type
    `);

    // 3️⃣ Initialize dashboard counters
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

    // 4️⃣ Loop through statuses (check for exact matches first)
    statusCounts.forEach(row => {
      if (!row.status) return;
      const status = row.status.toLowerCase().trim();

      // Exact matches first
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
      // Fallback for variations
      else if (status.includes("reject")) {
        counts.rejected = row.total;
      } else if (status.includes("pending")) {
        counts.pending = row.total;
      } else if (status.includes("under review")) {
        counts.under_review = row.total;
      }
    });

    // 5️⃣ Loop through student_type counts (separate from enrollment status)
    typeCounts.forEach(row => {
      if (!row.type) return;
      const type = row.type.toLowerCase().trim();
      
      if (type === "new enrollee") {
        counts.new_enrollees += row.total; // Add to existing count
      } else if (type === "transferee") {
        counts.transferees = row.total;
      } else if (type === "returnee") {
        counts.returnees = row.total;
      }
    });

    // 6️⃣ Enrollment trend (last 6 months)
    const [trend] = await db.query(`
      SELECT 
        DATE_FORMAT(created_at, '%b %Y') AS month,
        COUNT(*) AS count
      FROM student_details
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
      GROUP BY YEAR(created_at), MONTH(created_at)
      ORDER BY YEAR(created_at), MONTH(created_at)
    `);

    // 7️⃣ Strand distribution
    const [strand] = await db.query(`
      SELECT strand, COUNT(*) AS count
      FROM student_details
      WHERE strand IS NOT NULL AND strand != ''
      GROUP BY strand
    `);

    // ✅ Send all data
    res.json({
      ...counts,
      trend,
      strand,
    });

  } catch (err) {
    console.error("DB error:", err);
    res.status(500).json({ error: "Database error", details: err.message });
  }
});

export default router;