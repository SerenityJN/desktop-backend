import express from 'express';
import PDFDocument from 'pdfkit';
import db from "../models/db.js";
import { verifyAdmin } from '../middleware/auth.js';

const router = express.Router();

// Helper function to get student data with guardian info
async function getStudentData(LRN) {
    try {
        const [students] = await db.query(
            `SELECT 
                sd.*,
                g.FathersName,
                g.FathersContact,
                g.MothersName,
                g.MothersContact,
                g.GuardianName,
                g.GuardianContact,
                se.school_year,
                se.semester,
                se.status as enrollment_status,
                se.enrollment_type
            FROM student_details sd
            LEFT JOIN guardians g ON sd.LRN = g.LRN
            LEFT JOIN student_enrollments se ON sd.LRN = se.LRN 
                AND se.status = 'enrolled' 
                AND se.id = (
                    SELECT MAX(id) 
                    FROM student_enrollments 
                    WHERE LRN = sd.LRN
                )
            WHERE sd.LRN = ?`,
            [LRN]
        );
        return students[0];
    } catch (error) {
        console.error('Error fetching student data:', error);
        throw error;
    }
}

router.get('/search-documents', verifyAdmin, async (req, res) => {
    try {
        const { term } = req.query;
        
        if (!term) {
            return res.status(400).json({ message: 'Search term is required' });
        }
        
        const [students] = await db.query(
            `SELECT 
                sd.LRN,
                sd.firstname,
                sd.lastname,
                sd.middlename,
                sd.suffix,
                sd.strand,
                sd.yearlevel,
                sd.enrollment_status,
                se.school_year,
                se.semester
            FROM student_details sd
            LEFT JOIN student_enrollments se ON sd.LRN = se.LRN 
                AND se.status = 'enrolled' 
                AND se.id = (
                    SELECT MAX(id) 
                    FROM student_enrollments 
                    WHERE LRN = sd.LRN
                )
            WHERE (sd.LRN LIKE ? OR sd.firstname LIKE ? OR sd.lastname LIKE ?)
                AND sd.enrollment_status IN ('Enrolled', 'Temporary Enrolled')
            ORDER BY sd.lastname, sd.firstname
            LIMIT 20`,
            [`%${term}%`, `%${term}%`, `%${term}%`]
        );
        
        res.json(students);
        
    } catch (error) {
        console.error('Error searching students:', error);
        res.status(500).json({ message: 'Server error searching students' });
    }
});

// Helper function to format date
function formatDate(date) {
    if (!date) return '________________';
    return new Date(date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

// 1️⃣ CERTIFICATE OF ENROLLMENT (Auto-generated PDF)
router.get('/generate/certificate-of-enrollment/:lrn', verifyAdmin, async (req, res) => {
    try {
        const student = await getStudentData(req.params.lrn);
        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }

        const doc = new PDFDocument({ margin: 50 });
        
        // Set response headers for PDF download
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Certificate_of_Enrollment_${student.LRN}.pdf"`);
        
        doc.pipe(res);
        
        // ===== DOCUMENT CONTENT =====
        // School Header
        doc.font('Helvetica-Bold')
           .fontSize(24)
           .text('SOUTHVILLE 8B SENIOR HIGH SCHOOL', { align: 'center' })
           .moveDown(0.5);
        
        doc.font('Helvetica')
           .fontSize(12)
           .text('Bacoor City, Cavite', { align: 'center' })
           .moveDown(2);
        
        // Certificate Title
        doc.font('Helvetica-Bold')
           .fontSize(20)
           .text('CERTIFICATE OF ENROLLMENT', { align: 'center', underline: true })
           .moveDown(2);
        
        // Body Text
        doc.font('Helvetica')
           .fontSize(12)
           .text('TO WHOM IT MAY CONCERN:', { align: 'left' })
           .moveDown();
        
        const currentDate = formatDate(new Date());
        const studentName = `${student.firstname || ''} ${student.middlename || ''} ${student.lastname || ''} ${student.suffix || ''}`.trim();
        
        doc.text(`This is to certify that ${studentName}, with Learner Reference Number (LRN): ${student.LRN}, is a bona fide student of Southville 8B Senior High School.`, { align: 'justify' })
           .moveDown();
        
        // Get current enrollment info
        const semester = student.semester || '1st';
        const schoolYear = student.school_year || '2024-2025';
        const yearLevel = student.yearlevel || 'Grade 11';
        const strand = student.strand || '';
        
        doc.text(`The student is currently enrolled in ${yearLevel}, ${strand ? strand + ', ' : ''}for the ${semester} Semester of School Year ${schoolYear}.`, { align: 'justify' })
           .moveDown(2);
        
        doc.text('This certification is issued upon the request of the above-named student for whatever legal purpose it may serve.', { align: 'justify' })
           .moveDown(3);
        
        doc.text(`Given this ${currentDate} at Bacoor City, Cavite.`)
           .moveDown(4);
        
        // Signatures
        const lineY = doc.y;
        
        // Registrar
        doc.moveTo(80, lineY).lineTo(280, lineY).stroke();
        doc.fontSize(10)
           .text('REGISTRAR', 80, lineY + 5, { width: 200, align: 'center' })
           .text('Registrar\'s Office', 80, lineY + 20, { width: 200, align: 'center' });
        
        // Principal
        doc.moveTo(320, lineY).lineTo(520, lineY).stroke();
        doc.text('PRINCIPAL', 320, lineY + 5, { width: 200, align: 'center' })
           .text('School Principal', 320, lineY + 20, { width: 200, align: 'center' });
        
        doc.end();
        
    } catch (error) {
        console.error('Error generating certificate:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// 2️⃣ CERTIFICATE OF GOOD MORAL CHARACTER
router.get('/generate/good-moral/:lrn', verifyAdmin, async (req, res) => {
    try {
        const student = await getStudentData(req.params.lrn);
        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }

        const doc = new PDFDocument({ margin: 50 });
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Good_Moral_Certificate_${student.LRN}.pdf"`);
        
        doc.pipe(res);
        
        // Header
        doc.font('Helvetica-Bold')
           .fontSize(24)
           .text('SOUTHVILLE 8B SENIOR HIGH SCHOOL', { align: 'center' })
           .moveDown(0.5);
        
        doc.font('Helvetica')
           .fontSize(12)
           .text('Bacoor City, Cavite', { align: 'center' })
           .moveDown(2);
        
        // Title
        doc.font('Helvetica-Bold')
           .fontSize(20)
           .text('CERTIFICATE OF GOOD MORAL CHARACTER', { align: 'center', underline: true })
           .moveDown(2);
        
        // Body
        doc.font('Helvetica')
           .fontSize(12)
           .text('TO WHOM IT MAY CONCERN:', { align: 'left' })
           .moveDown();
        
        const studentName = `${student.firstname || ''} ${student.middlename || ''} ${student.lastname || ''} ${student.suffix || ''}`.trim();
        const currentDate = formatDate(new Date());
        
        doc.text(`This is to certify that ${studentName}, with LRN ${student.LRN}, is a student of Southville 8B Senior High School.`, { align: 'justify' })
           .moveDown();
        
        const yearLevel = student.yearlevel || '';
        const strand = student.strand || '';
        
        doc.text(`The student is enrolled in ${yearLevel}${strand ? ', ' + strand : ''} and has maintained good moral character during his/her stay in this institution.`, { align: 'justify' })
           .moveDown();
        
        doc.text('Based on our records, the above-named student has conducted himself/herself in a manner worthy of recognition and has not been subject to any disciplinary action.', { align: 'justify' })
           .moveDown(2);
        
        doc.text('This certification is issued upon the request of the student for whatever legal purpose it may serve.', { align: 'justify' })
           .moveDown(3);
        
        doc.text(`Given this ${currentDate} at Bacoor City, Cavite.`)
           .moveDown(4);
        
        // Signatures
        const lineY = doc.y;
        
        // Guidance Counselor
        doc.moveTo(80, lineY).lineTo(280, lineY).stroke();
        doc.fontSize(10)
           .text('GUIDANCE COUNSELOR', 80, lineY + 5, { width: 200, align: 'center' })
           .text('Guidance Office', 80, lineY + 20, { width: 200, align: 'center' });
        
        // Principal
        doc.moveTo(320, lineY).lineTo(520, lineY).stroke();
        doc.text('PRINCIPAL', 320, lineY + 5, { width: 200, align: 'center' })
           .text('School Principal', 320, lineY + 20, { width: 200, align: 'center' });
        
        doc.end();
        
    } catch (error) {
        console.error('Error generating good moral certificate:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// 3️⃣ FORM 137 (Permanent Record - Simplified)
router.get('/generate/form137/:lrn', verifyAdmin, async (req, res) => {
    try {
        const student = await getStudentData(req.params.lrn);
        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }

        const doc = new PDFDocument({ margin: 30, size: 'A4' });
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Form_137_${student.LRN}.pdf"`);
        
        doc.pipe(res);
        
        // ===== PAGE 1: PERSONAL INFORMATION =====
        // Header
        doc.font('Helvetica-Bold')
           .fontSize(16)
           .text('DEPARTMENT OF EDUCATION', { align: 'center' })
           .moveDown(0.3);
        
        doc.fontSize(14)
           .text('PERMANENT RECORD', { align: 'center' })
           .moveDown(0.3);
        
        doc.fontSize(12)
           .text('(Form 137)', { align: 'center' })
           .moveDown(1);
        
        // School Info
        doc.font('Helvetica')
           .fontSize(11)
           .text('School: SOUTHVILLE 8B SENIOR HIGH SCHOOL', 50, 120)
           .text('Address: Bacoor City, Cavite', 50, 135)
           .text(`School ID: ___________________`, 350, 120)
           .moveDown(2);
        
        // Student Info Box
        doc.rect(50, 160, 500, 200).stroke();
        
        // Student Information Header
        doc.font('Helvetica-Bold')
           .fontSize(12)
           .text('LEARNER INFORMATION', 55, 165);
        
        const startY = 190;
        let currentY = startY;
        
        // Personal Information Table
        const studentName = `${student.lastname || ''}, ${student.firstname || ''} ${student.middlename || ''} ${student.suffix || ''}`.trim();
        
        const personalInfo = [
            ['LEARNER REFERENCE NUMBER (LRN):', student.LRN || '________________'],
            ['NAME:', studentName],
            ['SEX:', student.sex || '________________'],
            ['DATE OF BIRTH:', formatDate(student.birthdate)],
            ['PLACE OF BIRTH:', student.birth_municipality && student.birth_province ? 
                `${student.birth_municipality}, ${student.birth_province}` : 
                (student.birth_municipality || student.birth_province || '________________')],
            ['AGE:', student.age ? `${student.age} years old` : '________________'],
            ['RELIGION:', student.religion || '________________'],
            ['NATIONALITY:', student.nationality || 'Filipino'],
            ['ADDRESS:', student.home_add || '________________'],
            ['CONTACT NUMBER:', student.cpnumber || '________________'],
            ['EMAIL:', student.email || '________________'],
            ['STUDENT TYPE:', student.student_type || '________________']
        ];
        
        personalInfo.forEach(([label, value]) => {
            doc.font('Helvetica-Bold').fontSize(10).text(label, 60, currentY);
            doc.font('Helvetica').fontSize(10).text(value || '', 250, currentY);
            currentY += 20;
        });
        
        // Enrollment Information
        currentY += 10;
        doc.font('Helvetica-Bold').fontSize(12).text('ENROLLMENT INFORMATION', 55, currentY);
        currentY += 25;
        
        const enrollmentInfo = [
            ['STRAND:', student.strand || '________________'],
            ['YEAR LEVEL:', student.yearlevel || '________________'],
            ['SEMESTER:', student.semester || '________________'],
            ['SCHOOL YEAR:', student.school_year || '2024-2025'],
            ['ENROLLMENT STATUS:', student.enrollment_status || '________________'],
            ['ENROLLMENT TYPE:', student.enrollment_type || '________________'],
            ['ENROLLMENT DATE:', formatDate(student.created_at)]
        ];
        
        enrollmentInfo.forEach(([label, value]) => {
            doc.font('Helvetica-Bold').fontSize(10).text(label, 60, currentY);
            doc.font('Helvetica').fontSize(10).text(value || '', 250, currentY);
            currentY += 20;
        });
        
        // Family Background
        doc.addPage();
        doc.font('Helvetica-Bold').fontSize(12).text('FAMILY BACKGROUND', 50, 50);
        
        const familyInfo = [
            ['FATHER\'S NAME:', student.FathersName || '________________'],
            ['FATHER\'S CONTACT:', student.FathersContact || '________________'],
            ['MOTHER\'S NAME:', student.MothersName || '________________'],
            ['MOTHER\'S CONTACT:', student.MothersContact || '________________'],
            ['GUARDIAN\'S NAME:', student.GuardianName || '________________'],
            ['GUARDIAN\'S CONTACT:', student.GuardianContact || '________________'],
            ['4Ps BENEFICIARY:', student.fourps_beneficiary === 'Yes' ? 'Yes' : 'No'],
            ['4Ps ID NUMBER:', student.fourps_id || '________________'],
            ['IP COMMUNITY:', student.ip_community === 'Yes' ? 'Yes' : 'No'],
            ['SPECIFY IP:', student.ip_specify || '________________']
        ];
        
        currentY = 80;
        familyInfo.forEach(([label, value]) => {
            doc.font('Helvetica-Bold').fontSize(10).text(label, 60, currentY);
            doc.font('Helvetica').fontSize(10).text(value || '', 250, currentY);
            currentY += 20;
        });
        
        // Remarks Section
        currentY += 20;
        doc.font('Helvetica-Bold').fontSize(12).text('REMARKS', 50, currentY);
        currentY += 20;
        
        doc.font('Helvetica').fontSize(10)
           .text('This certifies that the above information is true and correct based on the records of the school.', 60, currentY)
           .moveDown();
        
        currentY += 40;
        doc.text(`Date Issued: ${formatDate(new Date())}`, 60, currentY);
        
        // Signatures
        currentY += 60;
        doc.moveTo(80, currentY).lineTo(280, currentY).stroke();
        doc.fontSize(10)
           .text('REGISTRAR', 80, currentY + 5, { width: 200, align: 'center' })
           .text('School Registrar', 80, currentY + 20, { width: 200, align: 'center' });
        
        doc.moveTo(320, currentY).lineTo(520, currentY).stroke();
        doc.text('PRINCIPAL', 320, currentY + 5, { width: 200, align: 'center' })
           .text('School Principal', 320, currentY + 20, { width: 200, align: 'center' });
        
        // School Seal
        doc.circle(400, 150, 40).stroke();
        doc.fontSize(8)
           .text('OFFICIAL SEAL', 360, 145, { width: 80, align: 'center' })
           .text('Southville 8B SHS', 360, 155, { width: 80, align: 'center' });
        
        doc.end();
        
    } catch (error) {
        console.error('Error generating Form 137:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// 4️⃣ REPORT CARD (Simplified)
router.get('/generate/report-card/:lrn', verifyAdmin, async (req, res) => {
    try {
        const student = await getStudentData(req.params.lrn);
        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }

        const doc = new PDFDocument({ margin: 30 });
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Report_Card_${student.LRN}.pdf"`);
        
        doc.pipe(res);
        
        // Header
        doc.font('Helvetica-Bold')
           .fontSize(20)
           .text('SOUTHVILLE 8B SENIOR HIGH SCHOOL', { align: 'center' })
           .moveDown(0.3);
        
        doc.fontSize(16)
           .text('REPORT CARD', { align: 'center' })
           .moveDown(1);
        
        // Student Info
        const infoY = 120;
        doc.font('Helvetica').fontSize(11);
        
        const fullName = `${student.firstname || ''} ${student.lastname || ''}`.trim();
        
        doc.text(`Student Name: ${fullName}`, 50, infoY);
        doc.text(`LRN: ${student.LRN || ''}`, 350, infoY);
        
        doc.text(`Strand: ${student.strand || ''}`, 50, infoY + 20);
        doc.text(`Year Level: ${student.yearlevel || ''}`, 350, infoY + 20);
        
        doc.text(`Semester: ${student.semester || '1st'}`, 50, infoY + 40);
        doc.text(`School Year: ${student.school_year || '2024-2025'}`, 350, infoY + 40);
        
        // Table Header
        const tableY = infoY + 80;
        doc.rect(50, tableY, 500, 30).stroke();
        
        doc.font('Helvetica-Bold')
           .fontSize(12)
           .text('SUBJECT', 60, tableY + 10)
           .text('GRADE', 400, tableY + 10)
           .text('REMARKS', 450, tableY + 10);
        
        // Sample Subjects (You would get these from database)
        const subjects = [
            'Core Subjects',
            'Applied Subjects',
            'Specialized Subjects',
            'General Academic Strand'
        ];
        
        let currentTableY = tableY + 30;
        subjects.forEach((subject) => {
            doc.rect(50, currentTableY, 500, 25).stroke();
            doc.font('Helvetica').fontSize(11)
               .text(subject, 60, currentTableY + 8)
               .text('______', 400, currentTableY + 8)
               .text('PASSED', 450, currentTableY + 8);
            currentTableY += 25;
        });
        
        // Grading Scale
        currentTableY += 20;
        doc.font('Helvetica-Bold').fontSize(12).text('GRADING SCALE:', 50, currentTableY);
        currentTableY += 20;
        
        const scale = [
            '90-100: Outstanding',
            '85-89: Very Satisfactory',
            '80-84: Satisfactory',
            '75-79: Fairly Satisfactory',
            'Below 75: Did Not Meet Expectations'
        ];
        
        scale.forEach((item) => {
            doc.font('Helvetica').fontSize(10).text(item, 60, currentTableY);
            currentTableY += 15;
        });
        
        // Signatures
        currentTableY += 30;
        doc.moveTo(80, currentTableY).lineTo(280, currentTableY).stroke();
        doc.fontSize(10)
           .text('ADVISER', 80, currentTableY + 5, { width: 200, align: 'center' });
        
        doc.moveTo(320, currentTableY).lineTo(520, currentTableY).stroke();
        doc.text('PRINCIPAL', 320, currentTableY + 5, { width: 200, align: 'center' });
        
        doc.end();
        
    } catch (error) {
        console.error('Error generating report card:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// 5️⃣ TRANSCRIPT OF RECORDS
router.get('/generate/transcript/:lrn', verifyAdmin, async (req, res) => {
    try {
        const student = await getStudentData(req.params.lrn);
        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }

        const doc = new PDFDocument({ margin: 40 });
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Transcript_${student.LRN}.pdf"`);
        
        doc.pipe(res);
        
        // Header
        doc.font('Helvetica-Bold')
           .fontSize(18)
           .text('OFFICIAL TRANSCRIPT OF RECORDS', { align: 'center' })
           .moveDown(0.5);
        
        doc.fontSize(14)
           .text('SOUTHVILLE 8B SENIOR HIGH SCHOOL', { align: 'center' })
           .moveDown(1);
        
        // Student Info
        doc.font('Helvetica').fontSize(11);
        
        const fullName = `${student.lastname || ''}, ${student.firstname || ''} ${student.middlename || ''}`.trim();
        
        const infoRows = [
            ['Name:', fullName],
            ['LRN:', student.LRN || ''],
            ['Date of Birth:', formatDate(student.birthdate)],
            ['Strand:', student.strand || ''],
            ['Year Level:', student.yearlevel || ''],
            ['School Year:', student.school_year || '2024-2025']
        ];
        
        let currentY = 150;
        infoRows.forEach(([label, value]) => {
            doc.text(label, 50, currentY, { continued: true, width: 100 })
               .text(value, 150, currentY);
            currentY += 20;
        });
        
        // Academic Record Section
        currentY += 30;
        doc.font('Helvetica-Bold').fontSize(14).text('ACADEMIC RECORD', 50, currentY);
        currentY += 30;
        
        // You would populate this with actual data from database
        doc.font('Helvetica').fontSize(11)
           .text('This transcript shows the complete academic record of the student.', 50, currentY)
           .moveDown();
        
        doc.text('All requirements for the Senior High School program have been completed.', 50, doc.y)
           .moveDown(2);
        
        // Certification
        doc.text('CERTIFICATION:', 50, doc.y)
           .moveDown();
        
        doc.text('This is to certify that the above-named student has fulfilled all the academic requirements', 50, doc.y)
           .moveDown(0.5);
        
        doc.text('of Southville 8B Senior High School and is eligible for graduation.', 50, doc.y)
           .moveDown(3);
        
        // Signatures
        const sigY = doc.y;
        doc.moveTo(80, sigY).lineTo(280, sigY).stroke();
        doc.fontSize(10)
           .text('REGISTRAR', 80, sigY + 5, { width: 200, align: 'center' });
        
        doc.moveTo(320, sigY).lineTo(520, sigY).stroke();
        doc.text('PRINCIPAL', 320, sigY + 5, { width: 200, align: 'center' });
        
        doc.text(`Date Issued: ${formatDate(new Date())}`, 50, sigY + 50);
        
        // School Seal
        doc.circle(400, 200, 40).stroke();
        doc.fontSize(8)
           .text('OFFICIAL SEAL', 360, 195, { width: 80, align: 'center' })
           .text('Southville 8B SHS', 360, 205, { width: 80, align: 'center' });
        
        doc.end();
        
    } catch (error) {
        console.error('Error generating transcript:', error);
        res.status(500).json({ message: 'Server error' });
    }
});


export default router;
