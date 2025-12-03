import express from 'express';
import PDFDocument from 'pdfkit';
import db from "../models/db.js";
import { verifyAdmin } from '../middleware/auth.js';

const router = express.Router();

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
                se.enrollment_type,
                se.year_level as enrolled_year_level,
                se.strand as enrolled_strand
            FROM student_details sd
            LEFT JOIN guardians g ON sd.LRN = g.LRN
            LEFT JOIN student_enrollments se ON sd.LRN = se.LRN 
                AND se.status = 'enrolled' 
            WHERE sd.LRN = ?
            ORDER BY se.id DESC LIMIT 1`,
            [LRN]
        );
        return students[0];
    } catch (error) {
        console.error('Error fetching student data:', error);
        throw error;
    }
}

function formatDate(date) {
    if (!date) return new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    return new Date(date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

function drawLine(doc, y) {
    doc.moveTo(50, y).lineTo(550, y).stroke();
}

router.get('/list', verifyAdmin, async (req, res) => {
    try {
        const [students] = await db.query(
            `SELECT 
                sd.LRN, 
                sd.firstname, 
                sd.lastname, 
                sd.strand,
                sd.enrollment_status,
                se.year_level,
                se.school_year,
                se.semester
             FROM student_details sd
             LEFT JOIN student_enrollments se ON sd.LRN = se.LRN
             WHERE sd.enrollment_status IN ('Enrolled', 'Temporary Enrolled')
             GROUP BY sd.LRN
             ORDER BY sd.lastname ASC`
        );
        res.json(students);
    } catch (error) {
        console.error('Error fetching enrolled students:', error);
        res.status(500).json({ message: 'Server error fetching students' });
    }
});

router.get('/search-documents', verifyAdmin, async (req, res) => {
    try {
        const { term } = req.query;
        if (!term) return res.status(400).json({ message: 'Search term is required' });
        
        const [students] = await db.query(
            `SELECT sd.LRN, sd.firstname, sd.lastname, sd.strand
             FROM student_details sd
             WHERE (sd.LRN LIKE ? OR sd.firstname LIKE ? OR sd.lastname LIKE ?)
             AND sd.enrollment_status = 'Enrolled'
             LIMIT 20`,
            [`%${term}%`, `%${term}%`, `%${term}%`]
        );
        
        res.json(students);
    } catch (error) {
        console.error('Error searching:', error);
        res.status(500).json({ message: 'Server error searching students' });
    }
});

router.get('/generate/enrollment/:lrn', verifyAdmin, async (req, res) => {
    try {
        const student = await getStudentData(req.params.lrn);
        if (!student) return res.status(404).json({ message: 'Student not found' });

        const doc = new PDFDocument({ margin: 50 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="COE_${student.LRN}.pdf"`);
        doc.pipe(res);
        
        doc.font('Helvetica-Bold').fontSize(12).text('Republic of the Philippines', { align: 'center' });
        doc.text('Department of Education', { align: 'center' });
        doc.fontSize(16).text('SOUTHVILLE 8B SENIOR HIGH SCHOOL', { align: 'center' });
        doc.fontSize(10).font('Helvetica').text('San Isidro, Rodriguez, Rizal', { align: 'center' });
        doc.moveDown(3);
        
        doc.font('Helvetica-Bold').fontSize(24).text('CERTIFICATE OF ENROLLMENT', { align: 'center' });
        doc.moveDown(2);
        
        doc.font('Helvetica').fontSize(12).text('TO WHOM IT MAY CONCERN:', { align: 'left' });
        doc.moveDown();
        
        const fullName = `${student.firstname} ${student.middlename || ''} ${student.lastname} ${student.suffix || ''}`.toUpperCase();
        const sy = student.school_year || new Date().getFullYear() + '-' + (new Date().getFullYear()+1);
        
        doc.text(`This is to certify that ${fullName}, with Learner Reference Number (LRN) ${student.LRN}, is officially enrolled in ${student.enrolled_year_level || 'Grade 11'}, under the ${student.enrolled_strand || student.strand} strand for the School Year ${sy}.`, { align: 'justify', indent: 50, lineGap: 5 });
        doc.moveDown();
        
        doc.text('This certification is issued upon the request of the above-named student for whatever legal purpose it may serve.', { align: 'justify', indent: 50, lineGap: 5 });
        doc.moveDown(2);
        
        doc.text(`Given this ${formatDate(new Date())} at Rodriguez, Rizal.`, { indent: 50 });
        doc.moveDown(4);
        
        doc.font('Helvetica-Bold').text('SCHOOL REGISTRAR', { align: 'right' });
        doc.font('Helvetica').fontSize(10).text('Registrar II', { align: 'right' });

        doc.end();
    } catch (error) {
        console.error(error);
        res.status(500).send("Error generating document");
    }
});

router.get('/generate/good_moral/:lrn', verifyAdmin, async (req, res) => {
    try {
        const student = await getStudentData(req.params.lrn);
        if (!student) return res.status(404).json({ message: 'Student not found' });

        const doc = new PDFDocument({ margin: 50 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="GoodMoral_${student.LRN}.pdf"`);
        doc.pipe(res);
        
        doc.font('Helvetica-Bold').fontSize(16).text('SOUTHVILLE 8B SENIOR HIGH SCHOOL', { align: 'center' });
        doc.fontSize(10).font('Helvetica').text('San Isidro, Rodriguez, Rizal', { align: 'center' });
        doc.moveDown(3);
        
        doc.font('Helvetica-Bold').fontSize(20).text('CERTIFICATE OF GOOD MORAL CHARACTER', { align: 'center', underline: true });
        doc.moveDown(3);
        
        const fullName = `${student.firstname} ${student.lastname}`.toUpperCase();
        
        doc.font('Helvetica').fontSize(12)
           .text(`This is to certify that ${fullName} is a bona fide student of this institution.`, { align: 'justify', indent: 50, lineGap: 6 })
           .moveDown();
           
        doc.text(`He/She is a person of good moral character and has not been subjected to any disciplinary action during his/her stay in this school.`, { align: 'justify', indent: 50, lineGap: 6 })
           .moveDown();
           
        doc.text(`Issued this ${formatDate(new Date())} for whatever legal purpose it may serve.`, { indent: 50 });
        doc.moveDown(4);
        
        const y = doc.y;
        doc.text('GUIDANCE COUNSELOR', 50, y);
        doc.text('SCHOOL PRINCIPAL', 350, y, { align: 'right' });

        doc.end();
    } catch (error) {
        res.status(500).send("Error generating document");
    }
});

router.get('/generate/form137/:lrn', verifyAdmin, async (req, res) => {
    try {
        const student = await getStudentData(req.params.lrn);
        if (!student) return res.status(404).json({ message: 'Student not found' });

        const doc = new PDFDocument({ margin: 30, size: 'Legal' });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="SF10_${student.LRN}.pdf"`);
        doc.pipe(res);
        
        doc.font('Helvetica-Bold').fontSize(10).text('Learner\'s Permanent Academic Record (SF10-SHS)', { align: 'center' });
        doc.moveDown();
        
        doc.rect(30, doc.y, 550, 80).stroke();
        const startY = doc.y + 10;
        
        doc.font('Helvetica-Bold').fontSize(9);
        doc.text(`Name: ${student.lastname}, ${student.firstname} ${student.middlename || ''}`, 40, startY);
        doc.text(`LRN: ${student.LRN}`, 350, startY);
        
        doc.text(`Date of Birth: ${formatDate(student.birthdate)}`, 40, startY + 15);
        doc.text(`Sex: ${student.sex}`, 350, startY + 15);
        
        doc.text(`Parent/Guardian: ${student.GuardianName || student.FathersName || student.MothersName}`, 40, startY + 30);
        
        doc.moveDown(4);
        
        doc.font('Helvetica-Bold').fontSize(10).text('SCHOLASTIC RECORD', { align: 'center' });
        doc.moveDown(0.5);
        
        const tableTop = doc.y;
        doc.font('Helvetica-Bold').fontSize(9);
        doc.text('Subject', 40, tableTop);
        doc.text('Midterm', 300, tableTop);
        doc.text('Finals', 360, tableTop);
        doc.text('Action', 420, tableTop);
        
        drawLine(doc, tableTop + 15);
        
        const subjects = [
            { name: 'Core: Oral Communication', mid: '88', fin: '90' },
            { name: 'Core: Komunikasyon', mid: '85', fin: '87' },
            { name: 'Core: General Mathematics', mid: '83', fin: '85' },
            { name: 'Applied: Empowerment Tech', mid: '91', fin: '92' },
            { name: 'Specialized: Pre-Calculus', mid: '80', fin: '82' }
        ];
        
        let rowY = tableTop + 25;
        doc.font('Helvetica').fontSize(9);
        
        subjects.forEach(sub => {
            doc.text(sub.name, 40, rowY);
            doc.text(sub.mid, 300, rowY);
            doc.text(sub.fin, 360, rowY);
            doc.text('PASSED', 420, rowY);
            rowY += 15;
        });
        
        drawLine(doc, rowY);
        
        doc.end();
    } catch (error) {
        res.status(500).send("Error generating SF10");
    }
});

router.get('/generate/diploma/:lrn', verifyAdmin, async (req, res) => {
    try {
        const student = await getStudentData(req.params.lrn);
        if (!student) return res.status(404).json({ message: 'Student not found' });

        const doc = new PDFDocument({ layout: 'landscape', size: 'A4', margin: 50 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="Diploma_${student.LRN}.pdf"`);
        doc.pipe(res);
        
        doc.rect(20, 20, 800, 555).lineWidth(3).stroke();
        doc.rect(25, 25, 790, 545).lineWidth(1).stroke();
        
        doc.moveDown(2);
        doc.font('Helvetica').fontSize(12).text('Republic of the Philippines', { align: 'center' });
        doc.text('Department of Education', { align: 'center' });
        doc.moveDown();
        
        doc.font('Helvetica-Bold').fontSize(26).text('SOUTHVILLE 8B SENIOR HIGH SCHOOL', { align: 'center' });
        doc.font('Helvetica').fontSize(14).text('Rodriguez, Rizal', { align: 'center' });
        doc.moveDown(3);
        
        doc.font('Times-Roman').fontSize(18).text('has satisfactorily completed the requirements for Senior High School', { align: 'center' });
        doc.text('prescribed by the Department of Education and is therefore awarded this', { align: 'center' });
        doc.moveDown(2);
        
        doc.font('Times-Bold').fontSize(40).text('DIPLOMA', { align: 'center' });
        doc.moveDown(2);
        
        doc.font('Times-Roman').fontSize(16).text('to', { align: 'center' });
        doc.moveDown();
        
        const fullName = `${student.firstname} ${student.middlename || ''} ${student.lastname}`.toUpperCase();
        doc.font('Helvetica-Bold').fontSize(28).text(fullName, { align: 'center', underline: true });
        doc.moveDown(2);
        
        doc.font('Times-Roman').fontSize(14).text(`Signed this ${formatDate(new Date())} at Rodriguez, Rizal, Philippines.`, { align: 'center' });
        
        doc.moveDown(5);
        const sigY = doc.y;
        
        doc.fontSize(12).font('Helvetica-Bold');
        doc.text('SCHOOL PRINCIPAL', 100, sigY, { width: 250, align: 'center' });
        doc.text('SCHOOLS DIVISION SUPERINTENDENT', 500, sigY, { width: 250, align: 'center' });
        
        doc.lineWidth(1)
           .moveTo(125, sigY - 5).lineTo(325, sigY - 5).stroke()
           .moveTo(525, sigY - 5).lineTo(725, sigY - 5).stroke();

        doc.end();
    } catch (error) {
        res.status(500).send("Error generating diploma");
    }
});

export default router;

