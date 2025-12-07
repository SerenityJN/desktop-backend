import express from 'express';
import PDFDocument from 'pdfkit';
import db from "../models/db.js";
import { verifyAdmin } from '../middleware/auth.js';
import fs from 'fs';
import path from 'path';

const router = express.Router();

// Helper function to draw logos
async function drawLogo(doc, side, yPosition) {
    try {
        const logoPath = path.join(process.cwd(), 'public', 'images', 'logo.png');
        if (fs.existsSync(logoPath)) {
            if (side === 'left') {
                doc.image(logoPath, 50, yPosition, { width: 60, height: 60 });
            } else {
                doc.image(logoPath, doc.page.width - 110, yPosition, { width: 60, height: 60 });
            }
        } else {
            // Fallback: Draw a simple logo placeholder
            if (side === 'left') {
                doc.rect(50, yPosition, 60, 60).stroke();
                doc.fontSize(8).text('SCHOOL', 55, yPosition + 20, { width: 50, align: 'center' });
                doc.text('LOGO', 55, yPosition + 35, { width: 50, align: 'center' });
            } else {
                doc.rect(doc.page.width - 110, yPosition, 60, 60).stroke();
                doc.fontSize(8).text('SCHOOL', doc.page.width - 105, yPosition + 20, { width: 50, align: 'center' });
                doc.text('LOGO', doc.page.width - 105, yPosition + 35, { width: 50, align: 'center' });
            }
        }
    } catch (error) {
        console.error('Error drawing logo:', error);
    }
}

async function getStudentData(LRN) {
    try {
        console.log('Fetching student data for LRN:', LRN);
        
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
        
        console.log('Query result count:', students.length);
        
        if (students.length === 0) {
            console.log('No student found with LRN:', LRN);
            return null;
        }
        
        const student = students[0];
        return student;
        
    } catch (error) {
        console.error('Error fetching student data:', error);
        console.error('Error stack:', error.stack);
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

function drawFormalHeader(doc, title, subtitle = null) {
    // Draw logos on both sides
    const logoY = 50;
    drawLogo(doc, 'left', logoY);
    drawLogo(doc, 'right', logoY);
    
    // Department header - CENTERED AND PROPERLY FORMATTED
    doc.font('Times-Bold').fontSize(12)
       .text('Republic of the Philippines', { align: 'center' })
       .moveDown(0.3);
    
    doc.font('Times-Bold').fontSize(14)
       .text('Department of Education', { align: 'center' })
       .moveDown(0.3);
    
    // Region header
    doc.font('Times-Roman').fontSize(11)
       .text('Region IV-A CALABARZON', { align: 'center' })
       .moveDown(0.3);
    
    doc.font('Times-Bold').fontSize(11)
       .text('SCHOOLS DIVISION OF RIZAL', { align: 'center' })
       .moveDown(0.3);
    
    // District
    doc.font('Times-Roman').fontSize(11)
       .text('RODRIGUEZ DISTRICT', { align: 'center' })
       .moveDown(1);
    
    // School name with emphasis
    doc.font('Times-Bold').fontSize(22)
       .text('SOUTHVILLE 8B SENIOR HIGH SCHOOL', { align: 'center' })
       .moveDown(0.5);
    
    doc.font('Times-Roman').fontSize(11)
       .text('San Isidro, Rodriguez, Rizal', { align: 'center' })
       .moveDown(0.3);
    
    doc.font('Times-Roman').fontSize(10)
       .text('Email: 342567@deped.gov.ph • Tel: (02) 85511982', { align: 'center' })
       .moveDown(2);
    
    // Main title with proper spacing
    doc.font('Times-Bold').fontSize(24)
       .text(title.toUpperCase(), { align: 'center' });
    
    if (subtitle) {
        doc.moveDown(0.5);
        doc.font('Times-Roman').fontSize(14)
           .text(subtitle, { align: 'center' });
    }
    
    // Decorative line
    const y = doc.y + 10;
    doc.moveTo(50, y).lineTo(doc.page.width - 50, y).lineWidth(1).stroke();
    doc.moveDown(2);
}

function addSignatureSection(doc, name, title, align = 'center', offsetX = 0) {
    const signatureY = doc.y + 20;
    const centerX = doc.page.width / 2;
    
    // Signature line (centered)
    doc.moveTo(centerX - 75 + offsetX, signatureY + 15)
       .lineTo(centerX + 75 + offsetX, signatureY + 15)
       .stroke();
    
    // Name
    doc.font('Times-Bold').fontSize(11)
       .text(name, centerX - 75 + offsetX, signatureY + 20, { 
           width: 150, 
           align: 'center' 
       });
    
    // Title
    doc.font('Times-Roman').fontSize(10)
       .text(title, centerX - 75 + offsetX, signatureY + 35, { 
           width: 150, 
           align: 'center' 
       });
}

router.get('/list', verifyAdmin, async (req, res) => {
    try {
        const [students] = await db.query(
            `SELECT 
                sd.LRN, sd.firstname, sd.lastname, sd.strand, se.year_level
             FROM student_details sd
             JOIN student_enrollments se ON sd.LRN = se.LRN
             WHERE se.status = 'enrolled'
             GROUP BY sd.LRN
             ORDER BY sd.lastname ASC`
        );
        res.json(students);
    } catch (error) {
        console.error('Error fetching list:', error);
        res.status(500).json({ message: 'Server error' });
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

// =================== ENROLLMENT CERTIFICATE ===================
router.get('/generate/enrollment/:lrn', verifyAdmin, async (req, res) => {
    console.log('=== START: Enrollment PDF Generation ===');
    console.log('Request for LRN:', req.params.lrn);
    
    try {
        // Test database connection first
        console.log('Testing database connection...');
        const [dbTest] = await db.query('SELECT 1 as test');
        console.log('Database test result:', dbTest);
        
        console.log('Fetching student data...');
        const student = await getStudentData(req.params.lrn);
        
        if (!student) {
            console.log('Student not found in database');
            return res.status(404).json({ 
                message: 'Student not found',
                details: `No student found with LRN: ${req.params.lrn}`
            });
        }
        
        console.log('Student data retrieved:', {
            LRN: student.LRN,
            name: `${student.firstname} ${student.lastname}`,
            yearlevel: student.yearlevel || student.enrolled_year_level,
            strand: student.strand || student.enrolled_strand,
            enrollment_status: student.enrollment_status
        });

        // Use fallback values
        const yearLevel = student.enrolled_year_level || student.yearlevel || 'Grade 11';
        const strand = student.enrolled_strand || student.strand || 'Not Specified';
        const schoolYear = student.school_year || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;
        const enrollmentType = student.enrollment_type || 'regular';
        
        console.log('Creating PDFDocument with values:', {
            yearLevel,
            strand,
            schoolYear,
            enrollmentType
        });
        
        const doc = new PDFDocument({ 
            margin: 50,
            size: 'A4',
            info: {
                Title: 'Certificate of Enrollment',
                Author: 'Southville 8B Senior High School',
                Subject: 'Student Enrollment Certificate'
            }
        });
        
        console.log('PDFDocument created successfully');
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="COE_${student.LRN}.pdf"`);
        
        console.log('Headers set, piping to response...');
        doc.pipe(res);
        
        // Formal header with logos
        drawFormalHeader(doc, 'CERTIFICATE OF ENROLLMENT');
        
        // Reference number and date on right
        doc.font('Times-Roman').fontSize(10)
           .text(`Reference No.: COE-${student.LRN}-${new Date().getFullYear()}`, { align: 'right' })
           .moveDown(0.5);
        
        const currentDate = formatDate(new Date());
        doc.font('Times-Roman').fontSize(11)
           .text(`Date: ${currentDate}`, { align: 'right' })
           .moveDown(3);
        
        // Address block - LEFT ALIGNED
        doc.font('Times-Bold').fontSize(12)
           .text('TO WHOM IT MAY CONCERN:', { align: 'left' })
           .moveDown();
        
        // Formal body text - JUSTIFIED
        const fullName = `${student.lastname || ''}, ${student.firstname || ''} ${student.middlename || ''} ${student.suffix || ''}`.trim();
        
        doc.font('Times-Roman').fontSize(12)
           .text(`This is to certify that `, { continued: true, align: 'justify' })
           .font('Times-Bold')
           .text(`${fullName.toUpperCase()}`, { continued: true })
           .font('Times-Roman')
           .text(`, bearing Learner Reference Number (LRN) `, { continued: true })
           .font('Times-Bold')
           .text(`${student.LRN || 'N/A'}`, { continued: true })
           .font('Times-Roman')
           .text(`, is a bona fide student of Southville 8B Senior High School, located at San Isidro, Rodriguez, Rizal.`, { align: 'justify' })
           .moveDown();
        
        doc.text(`The aforementioned student is currently enrolled as a `, { continued: true, align: 'justify' })
           .font('Times-Bold')
           .text(`${yearLevel}`, { continued: true })
           .font('Times-Roman')
           .text(` student under the `, { continued: true })
           .font('Times-Bold')
           .text(`${strand}`, { continued: true })
           .font('Times-Roman')
           .text(` strand for the School Year `, { continued: true })
           .font('Times-Bold')
           .text(`${schoolYear}.`, { align: 'justify' })
           .moveDown();
        
        doc.text(`This certification is issued upon the request of `, { continued: true, align: 'justify' })
           .font('Times-Bold')
           .text(`${student.firstname || ''} ${student.lastname || ''}`, { continued: true })
           .font('Times-Roman')
           .text(` for whatever legal purpose it may serve, particularly for `, { continued: true })
           .font('Times-Bold')
           .text(`${enrollmentType === 'transfer' ? 'transfer purposes' : 'scholarship application'}.`, { align: 'justify' })
           .moveDown(2);
        
        doc.text(`Issued this `, { continued: true })
           .font('Times-Bold')
           .text(`${formatDate(new Date())}`, { continued: true })
           .font('Times-Roman')
           .text(` at the office of the School Registrar, Southville 8B Senior High School, Rodriguez, Rizal.`)
           .moveDown(4);
        
        // Signature section - CENTERED
        addSignatureSection(doc, 'DARYL F. BALBINO', 'School Registrar');
        
        // Official stamp text
        doc.moveDown(3);
        doc.font('Times-Italic').fontSize(9)
           .text('Official Document • Not Valid Without School Seal', { align: 'center' });
        
        // Footer
        doc.moveTo(50, doc.page.height - 50)
           .lineTo(doc.page.width - 50, doc.page.height - 50)
           .stroke();
        
        doc.font('Times-Roman').fontSize(8)
           .text('Southville 8B Senior High School • San Isidro, Rodriguez, Rizal • (02) 85511982', 
           50, doc.page.height - 40, { width: doc.page.width - 100, align: 'center' });
        
        doc.end();
        console.log('=== END: Enrollment PDF Generation - SUCCESS ===');
        
    } catch (error) {
        console.error('=== ERROR: Enrollment PDF Generation ===');
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        
        // More detailed error checking
        if (error.code === 'MODULE_NOT_FOUND') {
            console.error('Missing module error - check package.json');
            console.error('Required: pdfkit package');
        }
        
        if (error.code === 'ER_ACCESS_DENIED_ERROR' || error.code === 'ECONNREFUSED') {
            console.error('Database connection error');
        }
        
        if (error.message.includes('Cannot read properties') || error.message.includes('undefined')) {
            console.error('Undefined value error - check student data structure');
        }
        
        res.status(500).json({ 
            message: 'Error generating document',
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
            suggestion: 'Check server logs and database connection'
        });
    }
});

// =================== GOOD MORAL CERTIFICATE ===================
router.get('/generate/good_moral/:lrn', verifyAdmin, async (req, res) => {
    try {
        const student = await getStudentData(req.params.lrn);
        if (!student) return res.status(404).json({ message: 'Student not found' });

        const doc = new PDFDocument({ 
            margin: 50,
            size: 'A4',
            info: {
                Title: 'Certificate of Good Moral Character',
                Author: 'Southville 8B Senior High School',
                Subject: 'Student Character Certificate'
            }
        });
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="GoodMoral_${student.LRN}.pdf"`);
        doc.pipe(res);
        
        // Formal header
        drawFormalHeader(doc, 'CERTIFICATE OF GOOD MORAL CHARACTER');
        
        // Reference number
        doc.font('Times-Roman').fontSize(10)
           .text(`Ref. No.: GM-${student.LRN}-${new Date().getFullYear()}`, { align: 'right' })
           .moveDown(0.5);
        
        const currentDate = formatDate(new Date());
        doc.font('Times-Roman').fontSize(11)
           .text(`Date: ${currentDate}`, { align: 'right' })
           .moveDown(3);
        
        // Address block
        doc.font('Times-Bold').fontSize(12)
           .text('TO WHOM IT MAY CONCERN:', { align: 'left' })
           .moveDown();
        
        // Formal body text
        const fullName = `${student.lastname || ''}, ${student.firstname || ''} ${student.middlename || ''}`.trim();
        const pronoun = student.sex?.toLowerCase() === 'male' ? 'He' : 'She';
        const possessive = student.sex?.toLowerCase() === 'male' ? 'his' : 'her';
        
        doc.font('Times-Roman').fontSize(12)
           .text(`This is to certify that `, { continued: true, align: 'justify' })
           .font('Times-Bold')
           .text(`${fullName.toUpperCase()}`, { continued: true })
           .font('Times-Roman')
           .text(`, bearing Learner Reference Number `, { continued: true })
           .font('Times-Bold')
           .text(`${student.LRN}`, { continued: true })
           .font('Times-Roman')
           .text(`, is a bona fide student of Southville 8B Senior High School.`, { align: 'justify' })
           .moveDown();
        
        const yearLevel = student.enrolled_year_level || student.yearlevel || 'Grade 11';
        const strand = student.enrolled_strand || student.strand || 'Not Specified';
        const schoolYear = student.school_year || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;
        
        doc.text(`${pronoun} is currently enrolled in `, { continued: true, align: 'justify' })
           .font('Times-Bold')
           .text(`${yearLevel}`, { continued: true })
           .font('Times-Roman')
           .text(` under the `, { continued: true })
           .font('Times-Bold')
           .text(`${strand}`, { continued: true })
           .font('Times-Roman')
           .text(` strand for the School Year `, { continued: true })
           .font('Times-Bold')
           .text(`${schoolYear}.`, { align: 'justify' })
           .moveDown();
        
        doc.text(`Based on school records and as certified by the Guidance Office, `, { continued: true, align: 'justify' })
           .font('Times-Bold')
           .text(`${fullName.toUpperCase()}`, { continued: true })
           .font('Times-Roman')
           .text(` has exhibited good moral character during ${possessive} entire stay in this institution. ${pronoun} has not been subjected to any disciplinary action and has consistently demonstrated proper conduct and behavior befitting a student of Southville 8B Senior High School.`, { align: 'justify' })
           .moveDown();
        
        doc.text(`This certification is issued upon the request of `, { continued: true, align: 'justify' })
           .font('Times-Bold')
           .text(`${student.firstname} ${student.lastname}`, { continued: true })
           .font('Times-Roman')
           .text(` for `, { continued: true })
           .font('Times-Bold')
           .text(`${student.enrollment_type === 'college' ? 'college admission purposes' : 'whatever legal purpose it may serve'}.`, { align: 'justify' })
           .moveDown(2);
        
        doc.text(`Issued this `, { continued: true })
           .font('Times-Bold')
           .text(`${formatDate(new Date())}`, { continued: true })
           .font('Times-Roman')
           .text(` at Southville 8B Senior High School, Rodriguez, Rizal.`)
           .moveDown(4);
        
        // Dual signatures - PROPERLY CENTERED
        const signatureY = doc.y;
        
        // Guidance Counselor (left)
        doc.moveTo(100, signatureY + 15)
           .lineTo(250, signatureY + 15)
           .stroke();
        
        doc.font('Times-Bold').fontSize(11)
           .text('JOPHYLYNE S. LUCENA', 100, signatureY + 20, { width: 150, align: 'center' });
        
        doc.font('Times-Roman').fontSize(10)
           .text('Guidance Coordinator', 100, signatureY + 35, { width: 150, align: 'center' });
        
        // School Principal (right)
        doc.moveTo(350, signatureY + 15)
           .lineTo(500, signatureY + 15)
           .stroke();
        
        doc.font('Times-Bold').fontSize(11)
           .text('ENGR. ROCHELLE Z. VALDULLA', 350, signatureY + 20, { width: 150, align: 'center' });
        
        doc.font('Times-Roman').fontSize(10)
           .text('School Head', 350, signatureY + 35, { width: 150, align: 'center' });
        
        // Official stamp
        doc.moveDown(4);
        doc.font('Times-Italic').fontSize(9)
           .text('• Official Document • Not Valid Without School Seal •', { align: 'center' });
        
        // Footer
        doc.moveTo(50, doc.page.height - 50)
           .lineTo(doc.page.width - 50, doc.page.height - 50)
           .stroke();
        
        doc.font('Times-Roman').fontSize(8)
           .text('Certificate of Good Moral Character • Southville 8B SHS • Issued Electronically', 
           50, doc.page.height - 40, { width: doc.page.width - 100, align: 'center' });
        
        doc.end();
    } catch (error) {
        console.error(error);
        res.status(500).send("Error generating document");
    }
});

// =================== FORM 137 ===================
router.get('/generate/form137/:lrn', verifyAdmin, async (req, res) => {
    try {
        const student = await getStudentData(req.params.lrn);
        if (!student) return res.status(404).json({ message: 'Student not found' });

        const doc = new PDFDocument({ 
            margin: 40, 
            size: 'Legal',
            info: {
                Title: 'Form 137 - Permanent Record',
                Author: 'Southville 8B Senior High School',
                Subject: 'Student Academic Record'
            }
        });
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="SF10_${student.LRN}.pdf"`);
        doc.pipe(res);
        
        // Header with logos
        const logoY = 40;
        drawLogo(doc, 'left', logoY);
        drawLogo(doc, 'right', logoY);
        
        // Official header - PROPERLY CENTERED
        doc.font('Times-Bold').fontSize(12)
           .text('Republic of the Philippines', 200, 45, { width: 200, align: 'center' })
           .moveDown(0.3);
        
        doc.font('Times-Bold').fontSize(14)
           .text('Department of Education', 200, 58, { width: 200, align: 'center' });
        
        doc.font('Times-Bold').fontSize(16)
           .text('LEARNER\'S PERMANENT ACADEMIC RECORD', 200, 75, { width: 200, align: 'center' });
        
        doc.font('Times-Roman').fontSize(10)
           .text('(Formerly Form 137)', 200, 92, { width: 200, align: 'center' });
        
        doc.font('Times-Bold').fontSize(18)
           .text('SOUTHVILLE 8B SENIOR HIGH SCHOOL', 200, 105, { width: 200, align: 'center' });
        
        doc.font('Times-Roman').fontSize(9)
           .text('San Isidro, Rodriguez, Rizal', 200, 122, { width: 200, align: 'center' });
        
        // Student Information Box - FORMAL TABLE STYLE
        const infoBoxY = 150;
        doc.rect(40, infoBoxY, 520, 100).stroke();
        
        doc.font('Times-Bold').fontSize(12)
           .text('LEARNER\'S INFORMATION', 45, infoBoxY - 10);
        
        doc.font('Times-Bold').fontSize(10);
        doc.text('Name:', 45, infoBoxY + 15);
        doc.text('LRN:', 45, infoBoxY + 35);
        doc.text('Date of Birth:', 45, infoBoxY + 55);
        doc.text('Sex:', 300, infoBoxY + 55);
        doc.text('Address:', 45, infoBoxY + 75);
        
        doc.font('Times-Roman').fontSize(10);
        const fullName = `${student.lastname}, ${student.firstname} ${student.middlename || ''}`.toUpperCase();
        doc.text(fullName, 100, infoBoxY + 15);
        doc.text(student.LRN, 100, infoBoxY + 35);
        doc.text(formatDate(student.birthdate), 130, infoBoxY + 55);
        doc.text(student.sex || 'Not Specified', 330, infoBoxY + 55);
        doc.text(student.address || 'Not Provided', 110, infoBoxY + 75);
        
        // Scholastic Record Header
        doc.font('Times-Bold').fontSize(14)
           .text('SENIOR HIGH SCHOOL SCHOLASTIC RECORD', 200, infoBoxY + 120, { width: 200, align: 'center' });
        
        doc.font('Times-Roman').fontSize(10)
           .text(`School Year: ${student.school_year || new Date().getFullYear() + '-' + (new Date().getFullYear()+1)} • Semester: ${student.semester || 'First'}`, 
           200, infoBoxY + 140, { width: 200, align: 'center' });
        
        // Table Header - FORMAL STYLE
        const tableTop = infoBoxY + 160;
        doc.rect(40, tableTop, 520, 20).fill('#f0f0f0').stroke();
        
        doc.font('Times-Bold').fontSize(10).fillColor('black');
        doc.text('SUBJECTS', 45, tableTop + 5);
        doc.text('MIDTERM', 350, tableTop + 5, { width: 60, align: 'center' });
        doc.text('FINALS', 410, tableTop + 5, { width: 60, align: 'center' });
        doc.text('REMARKS', 470, tableTop + 5, { width: 80, align: 'center' });
        
        // Sample Data - In production, fetch from database
        const subjects = [
            { code: 'CORE 101', name: 'Oral Communication', midterm: '88', final: '90' },
            { code: 'CORE 102', name: 'Komunikasyon sa Pananaliksik', midterm: '85', final: '87' },
            { code: 'CORE 103', name: 'General Mathematics', midterm: '83', final: '85' },
            { code: 'APPLIED 101', name: 'Empowerment Technologies', midterm: '91', final: '92' },
            { code: 'SPEC 201', name: 'Pre-Calculus', midterm: '80', final: '82' },
            { code: 'SPEC 202', name: 'Basic Calculus', midterm: '78', final: '80' },
        ];
        
        let currentY = tableTop + 25;
        
        subjects.forEach((subject, index) => {
            // Alternating row colors
            if (index % 2 === 0) {
                doc.rect(40, currentY - 5, 520, 20).fill('#f9f9f9').stroke();
            } else {
                doc.rect(40, currentY - 5, 520, 20).fill('#ffffff').stroke();
            }
            
            doc.font('Times-Roman').fontSize(9).fillColor('black');
            doc.text(`${subject.code}: ${subject.name}`, 45, currentY);
            doc.text(subject.midterm, 350, currentY, { width: 60, align: 'center' });
            doc.text(subject.final, 410, currentY, { width: 60, align: 'center' });
            doc.text(parseInt(subject.final) >= 75 ? 'PASSED' : 'FAILED', 470, currentY, { width: 80, align: 'center' });
            
            currentY += 20;
        });
        
        // Bottom border
        doc.rect(40, currentY - 5, 520, 1).fill('#000000').stroke();
        
        // Footer with signatures
        doc.moveDown(2);
        const signatureY = currentY + 20;
        
        // Class Adviser
        doc.moveTo(60, signatureY + 15)
           .lineTo(210, signatureY + 15)
           .stroke();
        
        doc.font('Times-Bold').fontSize(10)
           .text('JUANA DELA CRUZ', 60, signatureY + 20, { width: 150, align: 'center' });
        
        doc.font('Times-Roman').fontSize(9)
           .text('Class Adviser', 60, signatureY + 32, { width: 150, align: 'center' });
        
        // School Registrar
        doc.moveTo(230, signatureY + 15)
           .lineTo(380, signatureY + 15)
           .stroke();
        
        doc.font('Times-Bold').fontSize(10)
           .text('DARYL F. BALBINO', 230, signatureY + 20, { width: 150, align: 'center' });
        
        doc.font('Times-Roman').fontSize(9)
           .text('School Registrar II', 230, signatureY + 32, { width: 150, align: 'center' });
        
        // School Principal
        doc.moveTo(400, signatureY + 15)
           .lineTo(550, signatureY + 15)
           .stroke();
        
        doc.font('Times-Bold').fontSize(10)
           .text('ENGR. ROCHELLE Z. VALDULLA', 400, signatureY + 20, { width: 150, align: 'center' });
        
        doc.font('Times-Roman').fontSize(9)
           .text('School Head', 400, signatureY + 32, { width: 150, align: 'center' });
        
        // Official footer
        doc.moveTo(40, doc.page.height - 50)
           .lineTo(560, doc.page.height - 50)
           .stroke();
        
        doc.font('Times-Roman').fontSize(8)
           .text('SF10 - Permanent Academic Record • Southville 8B Senior High School • CONFIDENTIAL', 
           40, doc.page.height - 40, { width: 520, align: 'center' });
        
        doc.end();
    } catch (error) {
        console.error(error);
        res.status(500).send("Error generating Form 137");
    }
});

// =================== DIPLOMA ===================
router.get('/generate/diploma/:lrn', verifyAdmin, async (req, res) => {
    try {
        const student = await getStudentData(req.params.lrn);
        if (!student) return res.status(404).json({ message: 'Student not found' });

        const doc = new PDFDocument({ 
            layout: 'landscape', 
            size: 'A4', 
            margin: 50,
            info: {
                Title: 'Senior High School Diploma',
                Author: 'Southville 8B Senior High School',
                Subject: 'Graduation Diploma'
            }
        });
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="Diploma_${student.LRN}.pdf"`);
        doc.pipe(res);
        
        // Decorative border - FORMAL BLUE COLOR
        doc.rect(20, 20, doc.page.width - 40, doc.page.height - 40)
           .lineWidth(3)
           .strokeColor('#002060')  // Dark blue for formal documents
           .stroke();
        
        doc.rect(30, 30, doc.page.width - 60, doc.page.height - 60)
           .lineWidth(1)
           .strokeColor('#000000')
           .stroke();
        
        // Header with logos
        const logoY = 50;
        drawLogo(doc, 'left', logoY);
        drawLogo(doc, 'right', logoY);
        
        // Official header - CENTERED
        doc.font('Times-Bold').fontSize(16)
           .text('Republic of the Philippines', { align: 'center' })
           .moveDown(0.5);
        
        doc.font('Times-Bold').fontSize(18)
           .text('Department of Education', { align: 'center' })
           .moveDown(1);
        
        doc.font('Times-Roman').fontSize(14)
           .text('Region IV-A CALABARZON', { align: 'center' })
           .moveDown(0.5);
        
        doc.font('Times-Bold').fontSize(16)
           .text('Schools Division of Rizal', { align: 'center' })
           .moveDown(2);
        
        // School name in elegant font
        doc.font('Times-Bold').fontSize(32)
           .text('SOUTHVILLE 8B SENIOR HIGH SCHOOL', { align: 'center' })
           .moveDown(0.5);
        
        doc.font('Times-Roman').fontSize(14)
           .text('San Isidro, Rodriguez, Rizal', { align: 'center' })
           .moveDown(3);
        
        // Diploma title - ELEGANT
        doc.font('Times-Bold').fontSize(24)
           .text('DIPLOMA', { align: 'center' })
           .moveDown(2);
        
        // Body text
        doc.font('Times-Roman').fontSize(16)
           .text('This certifies that', { align: 'center' })
           .moveDown(1);
        
        // Student name in elegant style
        const fullName = `${student.firstname} ${student.middlename || ''} ${student.lastname} ${student.suffix || ''}`.toUpperCase();
        doc.font('Times-Bold').fontSize(36)
           .text(fullName, { align: 'center' })
           .moveDown(1);
        
        // Decorative underline
        doc.moveTo(doc.page.width / 2 - 150, doc.y)
           .lineTo(doc.page.width / 2 + 150, doc.y)
           .lineWidth(2)
           .strokeColor('#002060')
           .stroke();
        
        doc.moveDown(2);
        
        doc.font('Times-Roman').fontSize(16)
           .text('has satisfactorily completed the prescribed Senior High School Curriculum', { align: 'center' })
           .moveDown(0.5);
        
        doc.text('in accordance with the requirements of the Department of Education', { align: 'center' })
           .moveDown(0.5);
        
        const strand = student.enrolled_strand || student.strand || 'Academic Track';
        doc.font('Times-Bold').fontSize(17)
           .text(`under the ${strand} strand`, { align: 'center' })
           .moveDown(2);
        
        doc.font('Times-Roman').fontSize(16)
           .text('and is therefore awarded this', { align: 'center' })
           .moveDown(1);
        
        doc.font('Times-Bold').fontSize(28)
           .text('DIPLOMA', { align: 'center' })
           .moveDown(2);
        
        // Date and location
        doc.font('Times-Roman').fontSize(14)
           .text(`Given this ${formatDate(new Date())} at Rodriguez, Rizal, Philippines.`, { align: 'center' })
           .moveDown(4);
        
        // Official signatures
        const signatureY = doc.y;
        
        // School Principal
        doc.moveTo(100, signatureY + 15)
           .lineTo(300, signatureY + 15)
           .stroke();
        
        doc.font('Times-Bold').fontSize(14)
           .text('ENGR. ROCHELLE Z. VALDULLA', 100, signatureY + 20, { width: 200, align: 'center' });
        
        doc.font('Times-Roman').fontSize(12)
           .text('School Head', 100, signatureY + 35, { width: 200, align: 'center' });
        
        // Schools Division Superintendent
        doc.moveTo(350, signatureY + 15)
           .lineTo(550, signatureY + 15)
           .stroke();
        
        doc.font('Times-Bold').fontSize(14)
           .text('DR. ROBERT GARCIA', 350, signatureY + 20, { width: 200, align: 'center' });
        
        doc.font('Times-Roman').fontSize(12)
           .text('Schools Division Superintendent', 350, signatureY + 35, { width: 200, align: 'center' });
        
        // Official seal text
        doc.moveDown(3);
        doc.font('Times-Italic').fontSize(12)
           .text('• This diploma is valid only with the official school seal •', { align: 'center' });
        
        // Footer note
        doc.moveTo(50, doc.page.height - 60)
           .lineTo(doc.page.width - 50, doc.page.height - 60)
           .stroke();
        
        doc.font('Times-Roman').fontSize(10)
           .text(`Diploma Serial No.: DPL-${student.LRN}-${new Date().getFullYear()} • Official Transcript Available Upon Request`, 
           50, doc.page.height - 50, { width: doc.page.width - 100, align: 'center' });
        
        doc.end();
    } catch (error) {
        console.error(error);
        res.status(500).send("Error generating diploma");
    }
});

// =================== GENERAL CERTIFICATION (Like the image example) ===================
router.get('/generate/certification/:lrn', verifyAdmin, async (req, res) => {
    try {
        const student = await getStudentData(req.params.lrn);
        if (!student) return res.status(404).json({ message: 'Student not found' });

        const doc = new PDFDocument({ 
            margin: 50,
            size: 'A4',
            info: {
                Title: 'General Certification',
                Author: 'Southville 8B Senior High School',
                Subject: 'Student Certification'
            }
        });
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="Certification_${student.LRN}.pdf"`);
        doc.pipe(res);
        
        // Draw logos
        const logoY = 40;
        drawLogo(doc, 'left', logoY);
        drawLogo(doc, 'right', logoY);
        
        // Official header - SIMILAR TO THE IMAGE
        doc.font('Times-Bold').fontSize(12)
           .text('Republic of the Philippines', { align: 'center' })
           .moveDown(0.3);
        
        doc.font('Times-Bold').fontSize(14)
           .text('Department of Education', { align: 'center' })
           .moveDown(0.3);
        
        // Region and Division
        doc.font('Times-Roman').fontSize(11)
           .text('Region IV-A CALABARZON', { align: 'center' })
           .moveDown(0.3);
        
        doc.font('Times-Bold').fontSize(11)
           .text('SCHOOLS DIVISION OF RIZAL', { align: 'center' })
           .moveDown(0.3);
        
        // District
        doc.font('Times-Roman').fontSize(11)
           .text('RODRIGUEZ DISTRICT', { align: 'center' })
           .moveDown(1);
        
        // School name
        doc.font('Times-Bold').fontSize(20)
           .text('SOUTHVILLE 8B SENIOR HIGH SCHOOL', { align: 'center' })
           .moveDown(0.5);
        
        doc.font('Times-Roman').fontSize(11)
           .text('San Isidro, Rodriguez, Rizal', { align: 'center' })
           .moveDown(1.5);
        
        // Current date (centered like in the image)
        const currentDate = formatDate(new Date());
        doc.font('Times-Roman').fontSize(11)
           .text(currentDate, { align: 'center' })
           .moveDown(3);
        
        // Certificate title (spaced like in example)
        doc.font('Times-Bold').fontSize(28)
           .text('C E R T I F I C A T I O N', { align: 'center' })
           .moveDown(3);
        
        // Main certification text - CENTERED like in the image
        doc.font('Times-Roman').fontSize(12)
           .text('This is to certify that', { align: 'center' })
           .moveDown(1);
        
        // Student name in bold and centered
        const fullName = `${student.firstname} ${student.middlename ? student.middlename.charAt(0) + '.' : ''} ${student.lastname}`.trim();
        doc.font('Times-Bold').fontSize(14)
           .text(`${fullName.toUpperCase()}`, { align: 'center' })
           .moveDown(1);
        
        // Certification details - CENTERED
        doc.font('Times-Roman').fontSize(12)
           .text('is a bona fide student of Southville 8B Senior High School,', { align: 'center' })
           .moveDown(0.5);
        
        const yearLevel = student.enrolled_year_level || student.yearlevel || 'Grade 11';
        const strand = student.enrolled_strand || student.strand || '';
        const schoolYear = student.school_year || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;
        
        if (strand) {
            doc.text(`currently enrolled in ${yearLevel} under the ${strand} strand`, { align: 'center' })
               .moveDown(0.5);
        } else {
            doc.text(`currently enrolled in ${yearLevel}`, { align: 'center' })
               .moveDown(0.5);
        }
        
        doc.text(`for the School Year ${schoolYear}.`, { align: 'center' })
           .moveDown(2);
        
        // Second paragraph - CENTERED
        doc.font('Times-Roman').fontSize(12)
           .text('This certification is issued upon the request of the above-named student', { align: 'center' })
           .moveDown(0.5);
        
        doc.text('for whatever legal purpose it may serve him/her.', { align: 'center' })
           .moveDown(2);
        
        doc.text('Given this date, affixed with the school seal and signature below.', { align: 'center' })
           .moveDown(4);
        
        // Signature section - CENTERED
        const signatureY = doc.y;
        
        // Signature line
        doc.moveTo(doc.page.width / 2 - 100, signatureY + 20)
           .lineTo(doc.page.width / 2 + 100, signatureY + 20)
           .stroke();
        
        // Name
        doc.font('Times-Bold').fontSize(12)
           .text('ENGR. ROCHELLE Z. VALDULLA', doc.page.width / 2 - 100, signatureY + 25, { 
               width: 200, 
               align: 'center' 
           });
        
        // Title
        doc.font('Times-Roman').fontSize(10)
           .text('School Head', doc.page.width / 2 - 100, signatureY + 40, { 
               width: 200, 
               align: 'center' 
           });
        
        // Footer
        doc.moveTo(50, doc.page.height - 50)
           .lineTo(doc.page.width - 50, doc.page.height - 50)
           .stroke();
        
        doc.font('Times-Roman').fontSize(8)
           .text('Southville 8B Senior High School • San Isidro, Rodriguez, Rizal • Email: 342567@deped.gov.ph • Tel: (02) 85511982', 
           50, doc.page.height - 40, { width: doc.page.width - 100, align: 'center' });
        
        doc.end();
    } catch (error) {
        console.error('Error generating certification:', error);
        res.status(500).json({ 
            message: 'Error generating certification',
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

export default router;
