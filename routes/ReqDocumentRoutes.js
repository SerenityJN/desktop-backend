// file: routes/request.js (backend)
import express from 'express';
import db from "../models/db.js";
import { verifyAdmin } from '../middleware/auth.js';

const router = express.Router();

// Helper function to get student data
async function getStudentData(LRN) {
    try {
        const [students] = await db.query(
            `SELECT 
                sd.*,
                sd.yearlevel as enrolled_year_level,
                sd.strand as enrolled_strand,
                g.FathersName,
                g.FathersContact,
                g.MothersName,
                g.MothersContact,
                g.GuardianName as guardian_name,
                g.GuardianContact as guardian_contact,
                se.school_year,
                se.semester,
                se.status as enrollment_status_db,
                se.enrollment_type
            FROM student_details sd
            LEFT JOIN guardians g ON sd.LRN = g.LRN
            LEFT JOIN student_enrollments se ON sd.LRN = se.LRN 
                AND se.status = 'enrolled'
                AND se.id = (
                    SELECT MAX(id) 
                    FROM student_enrollments 
                    WHERE LRN = sd.LRN AND status = 'enrolled'
                )
            WHERE sd.LRN = ?
            LIMIT 1`,
            [LRN]
        );
        
        if (students.length === 0) {
            return null;
        }
        
        return students[0];
        
    } catch (error) {
        console.error('Error fetching student data:', error);
        throw error;
    }
}

// API endpoint to get student data for document generation
router.get('/student-data/:lrn', verifyAdmin, async (req, res) => {
    try {
        const student = await getStudentData(req.params.lrn);
        if (!student) {
            return res.status(404).json({ 
                message: 'Student not found',
                details: `No student found with LRN: ${req.params.lrn}`
            });
        }
        
        // Return clean student data
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
                yearlevel: student.enrolled_year_level || student.yearlevel,
                strand: student.enrolled_strand || student.strand,
                school_year: student.school_year,
                semester: student.semester,
                enrollment_type: student.enrollment_type,
                enrollment_status: student.enrollment_status_db || student.enrollment_status
            }
        });
        
    } catch (error) {
        console.error('Error fetching student data:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error fetching student data',
            error: error.message
        });
    }
});

export default router;
