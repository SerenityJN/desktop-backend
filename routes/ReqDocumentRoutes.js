// file: routes/request.js
import express from "express";
import db from "../models/db.js";
import { verifyAdmin } from "../middleware/auth.js";

const router = express.Router();

/* ==========================================
   ✅ Helper: Get Student Data
========================================== */
async function getStudentData(LRN) {
  try {
    const result = await db.query(
      `SELECT 
          sd.*,
          sd.yearlevel AS enrolled_year_level,
          sd.strand AS enrolled_strand,
          g."FathersName",
          g."FathersContact",
          g."MothersName",
          g."MothersContact",
          g."GuardianName" AS guardian_name,
          g."GuardianContact" AS guardian_contact,
          se.school_year,
          se.semester,
          se.status AS enrollment_status_db,
          se.enrollment_type
       FROM student_details sd
       LEFT JOIN guardians g ON sd."LRN" = g."LRN"
       LEFT JOIN student_enrollments se 
         ON sd."LRN" = se."LRN"
         AND se.status = 'enrolled'
         AND se.id = (
             SELECT MAX(id)
             FROM student_enrollments
             WHERE "LRN" = sd."LRN"
               AND status = 'enrolled'
         )
       WHERE sd."LRN" = $1
       LIMIT 1`,
      [LRN]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];

  } catch (error) {
    console.error("Error fetching student data:", error);
    throw error;
  }
}

/* ==========================================
   ✅ API: Get Student Data for Documents
========================================== */
router.get("/student-data/:lrn", verifyAdmin, async (req, res) => {
  try {
    const student = await getStudentData(req.params.lrn);

    if (!student) {
      return res.status(404).json({
        message: "Student not found",
        details: `No student found with LRN: ${req.params.lrn}`,
      });
    }

    res.json({
      success: true,
      data: {
        LRN: student.LRN,
        firstname: student.firstname,
        lastname: student.lastname,
        middlename: student.middlename,
        suffix: student.suffix,
        sex: student.sex,
        birthdate: student.birthdate,
        address: student.address,
        yearlevel:
          student.enrolled_year_level || student.yearlevel,
        strand:
          student.enrolled_strand || student.strand,
        school_year: student.school_year,
        semester: student.semester,
        enrollment_type: student.enrollment_type,
        enrollment_status:
          student.enrollment_status_db ||
          student.enrollment_status,
      },
    });

  } catch (error) {
    console.error("Error fetching student data:", error);

    res.status(500).json({
      success: false,
      message: "Error fetching student data",
      error: error.message,
    });
  }
});

export default router;
