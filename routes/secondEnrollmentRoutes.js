// routes/FirstSemester.js
import express from "express";
import db from "../models/db.js";

const router = express.Router();

// Approve semester progression
router.post('/approve-semester', async (req, res) => {
  try {
    const { LRN } = req.body;
    
    // Find the current enrollment record
    const { rows: currentEnrollment } = await db.query(
      'SELECT * FROM student_enrollments WHERE "LRN" = $1 AND school_year = $2 ORDER BY created_at DESC LIMIT 1',
      [LRN, '2025-2026']
    );

    if (currentEnrollment.length === 0) {
      return res.status(404).json({ message: 'Enrollment record not found' });
    }

    const currentRecord = currentEnrollment[0];
    
    // Get student data for password generation
    const { rows: studentData } = await db.query(
      'SELECT lastname FROM student_details WHERE "LRN" = $1',
      [LRN]
    );

    const student = studentData[0];
    
    // Create new record for 2nd semester
    await db.query(
      `INSERT INTO student_enrollments 
       ("LRN", school_year, semester, status, grade_slip, rejection_reason, enrollment_type) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        LRN,
        '2025-2026',
        '2nd',
        'Enrolled',
        currentRecord.grade_slip,
        null,
        currentRecord.enrollment_type
      ]
    );

    // Generate password
    const lastName = student.lastname.trim();
    const lastFourOfLRN = String(LRN).slice(-4);
    const plainTextPassword = `SV8B-${lastName}${lastFourOfLRN}`;

    res.json({ 
      message: 'Student successfully approved for 2nd semester enrollment',
      password: `Generated Password: ${plainTextPassword}`
    });

  } catch (error) {
    console.error('Error approving semester:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Alternative: Update existing record
router.post('/update-semester', async (req, res) => {
  try {
    const { LRN } = req.body;
    
    // Update the existing record
    const { rowCount } = await db.query(
      `UPDATE student_enrollments 
       SET semester = $1, status = $2, rejection_reason = NULL 
       WHERE "LRN" = $3 AND school_year = $4 AND semester = $5`,
      ['2nd', 'Enrolled', LRN, '2025-2026', '1st']
    );

    if (rowCount > 0) {
      // Get student data for password
      const { rows: studentData } = await db.query(
        'SELECT lastname FROM student_details WHERE "LRN" = $1',
        [LRN]
      );
      
      const student = studentData[0];
      const lastName = student.lastname.trim();
      const lastFourOfLRN = String(LRN).slice(-4);
      const plainTextPassword = `SV8B-${lastName}${lastFourOfLRN}`;

      res.json({ 
        message: 'Student successfully moved to 2nd semester',
        password: `Generated Password: ${plainTextPassword}`
      });
    } else {
      res.status(400).json({ message: 'Failed to update semester' });
    }

  } catch (error) {
    console.error('Error updating semester:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get students by semester
router.get('/students', async (req, res) => {
  try {
    const { semester } = req.query;
    let query = `
      SELECT e.*, s.firstname, s.lastname, s.middlename, s.suffix, s.strand, 
             s.cpnumber, s.home_add, s.student_type, s.enrollment_status
      FROM student_enrollments e
      LEFT JOIN student_details s ON e."LRN" = s."LRN"
      WHERE e.status IN ('Enrolled', 'Temporary Enrolled')
    `;
    
    const params = [];
    let paramIndex = 1;
    
    if (semester) {
      query += ` AND e.semester = $${paramIndex}`;
      params.push(semester);
      paramIndex++;
    }
    
    query += ' ORDER BY e.created_at DESC';
    
    const { rows } = await db.query(query, params);
    res.json(rows);
    
  } catch (error) {
    console.error('Error fetching students:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get enrollment status for a student
router.get('/status/:LRN', async (req, res) => {
  try {
    const { LRN } = req.params;
    
    const { rows: enrollment } = await db.query(
      'SELECT * FROM student_enrollments WHERE "LRN" = $1 AND school_year = $2 ORDER BY created_at DESC LIMIT 1',
      [LRN, '2025-2026']
    );

    if (enrollment.length === 0) {
      return res.status(404).json({ message: 'Enrollment not found' });
    }

    res.json(enrollment[0]);
  } catch (error) {
    console.error('Error fetching enrollment status:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
