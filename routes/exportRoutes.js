// routes/export.js
import express from 'express';
import db from "../models/db.js";

const router = express.Router();

router.get('/student-data', async (req, res) => {
  try {
    const query = `
      SELECT 
        sd."LRN",
        sd.firstname,
        sd.lastname, 
        sd.middlename,
        sd.suffix,
        sd.age,
        sd.sex,
        sd.status,
        sd.nationality,
        sd.birthdate,
        sd.birth_province,
        sd.birth_municipality,
        sd.religion,
        sd.cpnumber,
        sd.home_add,
        sd.email,
        sd.yearlevel,
        sd.strand,
        sd.student_type,
        sd.enrollment_status,
        sd.reason,
        sd.ip_community,
        sd.ip_specify,
        sd.fourps_beneficiary,
        sd.fourps_id,
        se.school_year,
        se.semester,
        se.status as enrollment_status_detail,
        se.grade_slip,
        se.enrollment_type,
        g."FathersName",
        g."FathersContact", 
        g."MothersName",
        g."MothersContact",
        g."GuardianName",
        g."GuardianContact"
      FROM student_details sd
      LEFT JOIN student_enrollments se ON sd."LRN" = se."LRN"
      LEFT JOIN guardians g ON sd."LRN" = g."LRN"
      WHERE sd.is_active = true 
      AND (sd.enrollment_status = 'Enrolled' OR sd.enrollment_status = 'Temporary Enrolled')
      ORDER BY sd.enrollment_status, sd.lastname, sd.firstname
    `;

    // PostgreSQL uses query() which returns { rows } object
    const { rows } = await db.query(query);
    
    res.json(rows);
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

export default router;
