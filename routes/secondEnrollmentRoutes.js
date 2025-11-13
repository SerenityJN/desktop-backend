// routes/FirstSemester.js
import express from "express";
import db from "../models/db.js";

const router = express.Router();
// Approve semester progression
router.post('/approve-semester', async (req, res) => {
  try {
    const { LRN } = req.body;
    
    // Find the current enrollment record
    const [currentEnrollment] = await db.execute(
      'SELECT * FROM student_enrollments WHERE LRN = ? AND school_year = ? ORDER BY created_at DESC LIMIT 1',
      [LRN, '2025-2026']
    );

    if (currentEnrollment.length === 0) {
      return res.status(404).json({ message: 'Enrollment record not found' });
    }

    const currentRecord = currentEnrollment[0];
    
    // Get student data for password generation
    const [studentData] = await db.execute(
      'SELECT lastname FROM students WHERE LRN = ?',
      [LRN]
    );

    const student = studentData[0];
    
    // Create new record for 2nd semester
    await db.execute(
      `INSERT INTO enrollments 
       (LRN, school_year, semester, status, grade_slip, rejection_reason, enrollment_type) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
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
    const lastFourOfLRN = LRN.slice(-4);
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
    const [result] = await db.execute(
      `UPDATE enrollments 
       SET semester = ?, status = ?, rejection_reason = NULL 
       WHERE LRN = ? AND school_year = ? AND semester = ?`,
      ['2nd', 'Enrolled', LRN, '2025-2026', '1st']
    );

    if (result.affectedRows > 0) {
      // Get student data for password
      const [studentData] = await db.execute(
        'SELECT lastname FROM students WHERE LRN = ?',
        [LRN]
      );
      
      const student = studentData[0];
      const lastName = student.lastname.trim();
      const lastFourOfLRN = LRN.slice(-4);
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
      FROM enrollments e
      LEFT JOIN students s ON e.LRN = s.LRN
      WHERE e.status IN ('Enrolled', 'Temporary Enrolled')
    `;
    
    const params = [];
    
    if (semester) {
      query += ' AND e.semester = ?';
      params.push(semester);
    }
    
    query += ' ORDER BY e.created_at DESC';
    
    const [students] = await db.execute(query, params);
    res.json(students);
    
  } catch (error) {
    console.error('Error fetching students:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get enrollment status for a student
router.get('/status/:LRN', async (req, res) => {
  try {
    const { LRN } = req.params;
    
    const [enrollment] = await db.execute(
      'SELECT * FROM enrollments WHERE LRN = ? AND school_year = ? ORDER BY created_at DESC LIMIT 1',
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