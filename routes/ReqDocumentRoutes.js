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

// Helper function to draw formal header with consistent styling
function drawFormalHeader(doc, title, subtitle = null, includeDate = true) {
    // Draw logos on both sides
    const logoY = 50;
    drawLogo(doc, 'left', logoY);
    drawLogo(doc, 'right', logoY);
    
    // Calculate center for proper alignment
    const pageCenter = doc.page.width / 2;
    
    // Department header - PROPERLY FORMATTED
    doc.font('Times-Bold').fontSize(12)
       .text('Republic of the Philippines', pageCenter, 55, { align: 'center', width: 400 })
       .moveDown(0.2);
    
    doc.font('Times-Bold').fontSize(14)
       .text('Department of Education', pageCenter, doc.y, { align: 'center', width: 400 })
       .moveDown(0.2);
    
    // Region header
    doc.font('Times-Roman').fontSize(11)
       .text('Region IV-A CALABARZON', pageCenter, doc.y, { align: 'center', width: 400 })
       .moveDown(0.2);
    
    doc.font('Times-Bold').fontSize(11)
       .text('SCHOOLS DIVISION OF RIZAL', pageCenter, doc.y, { align: 'center', width: 400 })
       .moveDown(0.2);
    
    // District
    doc.font('Times-Roman').fontSize(11)
       .text('RODRIGUEZ DISTRICT', pageCenter, doc.y, { align: 'center', width: 400 })
       .moveDown(0.5);
    
    // School name with emphasis
    doc.font('Times-Bold').fontSize(20)
       .text('SOUTHVILLE 8B SENIOR HIGH SCHOOL', pageCenter, doc.y, { align: 'center', width: 400 })
       .moveDown(0.3);
    
    doc.font('Times-Roman').fontSize(11)
       .text('San Isidro, Rodriguez, Rizal', pageCenter, doc.y, { align: 'center', width: 400 })
       .moveDown(0.3);
    
    doc.font('Times-Roman').fontSize(10)
       .text('Email: 342567@deped.gov.ph • Telephone: (02) 8551-1982', pageCenter, doc.y, { align: 'center', width: 400 })
       .moveDown(1.5);
    
    // Decorative line
    const lineY = doc.y;
    doc.moveTo(50, lineY).lineTo(doc.page.width - 50, lineY).lineWidth(1).stroke();
    doc.moveDown(1.5);
    
    // Main title
    doc.font('Times-Bold').fontSize(22)
       .text(title.toUpperCase(), pageCenter, doc.y, { align: 'center', width: 400 })
       .moveDown(0.3);
    
    if (subtitle) {
        doc.font('Times-Roman').fontSize(14)
           .text(subtitle, pageCenter, doc.y, { align: 'center', width: 400 })
           .moveDown(1);
    } else {
        doc.moveDown(1);
    }
    
    // Add date if requested
    if (includeDate) {
        const currentDate = new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        doc.font('Times-Roman').fontSize(11)
           .text(currentDate, { align: 'center' })
           .moveDown(2);
    } else {
        doc.moveDown(2);
    }
}

// Helper function for formal signature section
function addFormalSignature(doc, name, title, positionX = null) {
    const signatureY = doc.y + 20;
    const pageCenter = doc.page.width / 2;
    const xPosition = positionX || pageCenter;
    
    // Signature line (centered relative to position)
    doc.moveTo(xPosition - 75, signatureY + 15)
       .lineTo(xPosition + 75, signatureY + 15)
       .stroke();
    
    // Name
    doc.font('Times-Bold').fontSize(12)
       .text(name, xPosition - 75, signatureY + 20, { 
           width: 150, 
           align: 'center' 
       });
    
    // Title/Position
    doc.font('Times-Roman').fontSize(10)
       .text(title, xPosition - 75, signatureY + 35, { 
           width: 150, 
           align: 'center' 
       });
    
    doc.moveDown(2);
}

// Helper function to format date properly
function formatDate(date) {
    if (!date) {
        return new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }
    return new Date(date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

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

// =================== ENROLLMENT CERTIFICATE ===================
router.get('/generate/enrollment/:lrn', verifyAdmin, async (req, res) => {
    try {
        const student = await getStudentData(req.params.lrn);
        if (!student) {
            return res.status(404).json({ 
                message: 'Student not found',
                details: `No student found with LRN: ${req.params.lrn}`
            });
        }

        const yearLevel = student.enrolled_year_level || student.yearlevel || 'Grade 11';
        const strand = student.enrolled_strand || student.strand || 'General Academic Strand';
        const schoolYear = student.school_year || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;
        const enrollmentType = student.enrollment_type || 'regular';
        
        const doc = new PDFDocument({ 
            margin: 50,
            size: 'A4',
            info: {
                Title: 'Certificate of Enrollment',
                Author: 'Southville 8B Senior High School',
                Subject: 'Student Enrollment Certificate',
                Keywords: 'enrollment,certificate,school,student'
            }
        });
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="Certificate_of_Enrollment_${student.LRN}.pdf"`);
        doc.pipe(res);
        
        // Formal header
        drawFormalHeader(doc, 'CERTIFICATE OF ENROLLMENT', null, false);
        
        // Reference number
        doc.font('Times-Roman').fontSize(10)
           .text(`Reference No.: COE-${student.LRN}-${new Date().getFullYear()}`, { align: 'right' })
           .moveDown(0.3);
        
        const currentDate = formatDate(new Date());
        doc.font('Times-Roman').fontSize(11)
           .text(`Date Issued: ${currentDate}`, { align: 'right' })
           .moveDown(2);
        
        // Addressee
        doc.font('Times-Bold').fontSize(12)
           .text('TO WHOM IT MAY CONCERN:', { align: 'left' })
           .moveDown(1.2);
        
        // Formal body text - PROPERLY JUSTIFIED
        const fullName = `${student.lastname || ''}, ${student.firstname || ''} ${student.middlename ? student.middlename.charAt(0) + '.' : ''} ${student.suffix || ''}`.trim();
        
        doc.font('Times-Roman').fontSize(12)
           .text(`This is to certify that `, { continued: true })
           .font('Times-Bold')
           .text(`${fullName.toUpperCase()}`, { continued: true })
           .font('Times-Roman')
           .text(`, bearing Learner Reference Number (LRN) `, { continued: true })
           .font('Times-Bold')
           .text(`${student.LRN || 'N/A'}`, { continued: true })
           .font('Times-Roman')
           .text(`, is a bona fide student of Southville 8B Senior High School, located at San Isidro, Rodriguez, Rizal.`, { align: 'justify' })
           .moveDown(1);
        
        doc.text(`The aforementioned student is currently enrolled as a `, { continued: true })
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
           .moveDown(1);
        
        doc.text(`This certification is issued upon the request of `, { continued: true })
           .font('Times-Bold')
           .text(`${student.firstname || ''} ${student.lastname || ''}`, { continued: true })
           .font('Times-Roman')
           .text(` for whatever legal purpose it may serve, particularly for `, { continued: true })
           .font('Times-Bold')
           .text(`${enrollmentType === 'transfer' ? 'transfer to another educational institution' : 'scholarship application'}.`, { align: 'justify' })
           .moveDown(1.5);
        
        doc.text(`Issued this `, { continued: true })
           .font('Times-Bold')
           .text(`${formatDate(new Date())}`, { continued: true })
           .font('Times-Roman')
           .text(` at the office of the School Registrar, Southville 8B Senior High School, Rodriguez, Rizal.`)
           .moveDown(3);
        
        // Signature section
        addFormalSignature(doc, 'DARYL F. BALBINO', 'School Registrar');
        
        // Official stamp
        doc.moveDown(1);
        doc.font('Times-Italic').fontSize(10)
           .text('• Official Document • Not Valid Without School Seal and Signature •', { align: 'center' })
           .moveDown(0.5);
        
        // Document reference
        doc.font('Times-Roman').fontSize(8)
           .text(`Document ID: COE-${student.LRN}-${Date.now()} • Generated Electronically`, { align: 'center' });
        
        // Footer with contact information
        doc.moveTo(50, doc.page.height - 40)
           .lineTo(doc.page.width - 50, doc.page.height - 40)
           .stroke();
        
        doc.font('Times-Roman').fontSize(9)
           .text('Southville 8B Senior High School • San Isidro, Rodriguez, Rizal • 342567@deped.gov.ph • (02) 8551-1982', 
           50, doc.page.height - 35, { width: doc.page.width - 100, align: 'center' });
        
        doc.end();
        
    } catch (error) {
        console.error('Error generating enrollment certificate:', error);
        res.status(500).json({ 
            message: 'Error generating document',
            error: error.message,
            suggestion: 'Please check the student data and try again'
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
                Subject: 'Student Character Certificate',
                Keywords: 'good,moral,character,certificate,school'
            }
        });
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="Good_Moral_Character_${student.LRN}.pdf"`);
        doc.pipe(res);
        
        // Formal header
        drawFormalHeader(doc, 'CERTIFICATE OF GOOD MORAL CHARACTER', null, false);
        
        // Reference number
        doc.font('Times-Roman').fontSize(10)
           .text(`Reference No.: GMC-${student.LRN}-${new Date().getFullYear()}`, { align: 'right' })
           .moveDown(0.3);
        
        const currentDate = formatDate(new Date());
        doc.font('Times-Roman').fontSize(11)
           .text(`Date Issued: ${currentDate}`, { align: 'right' })
           .moveDown(2);
        
        // Addressee
        doc.font('Times-Bold').fontSize(12)
           .text('TO WHOM IT MAY CONCERN:', { align: 'left' })
           .moveDown(1.2);
        
        // Formal body text
        const fullName = `${student.lastname || ''}, ${student.firstname || ''} ${student.middlename ? student.middlename.charAt(0) + '.' : ''}`.trim();
        const pronoun = student.sex?.toLowerCase() === 'male' ? 'He' : 'She';
        const possessive = student.sex?.toLowerCase() === 'male' ? 'his' : 'her';
        
        doc.font('Times-Roman').fontSize(12)
           .text(`This is to certify that `, { continued: true })
           .font('Times-Bold')
           .text(`${fullName.toUpperCase()}`, { continued: true })
           .font('Times-Roman')
           .text(`, bearing Learner Reference Number `, { continued: true })
           .font('Times-Bold')
           .text(`${student.LRN}`, { continued: true })
           .font('Times-Roman')
           .text(`, is a bona fide student of Southville 8B Senior High School.`, { align: 'justify' })
           .moveDown(1);
        
        const yearLevel = student.enrolled_year_level || student.yearlevel || 'Grade 11';
        const strand = student.enrolled_strand || student.strand || 'General Academic Strand';
        const schoolYear = student.school_year || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;
        
        doc.text(`${pronoun} is currently enrolled in `, { continued: true })
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
           .moveDown(1);
        
        doc.text(`Based on official school records and as certified by the Guidance and Counseling Office, `, { continued: true })
           .font('Times-Bold')
           .text(`${fullName.toUpperCase()}`, { continued: true })
           .font('Times-Roman')
           .text(` has exhibited good moral character during ${possessive} entire stay in this institution. ${pronoun} has not been subjected to any disciplinary action and has consistently demonstrated proper conduct, behavior, and adherence to school rules and regulations.`, { align: 'justify' })
           .moveDown(1);
        
        doc.text(`${pronoun} is known to be `, { continued: true })
           .font('Times-Bold')
           .text(`courteous, responsible, and respectful`, { continued: true })
           .font('Times-Roman')
           .text(`, maintaining good relationships with peers, teachers, and school personnel.`)
           .moveDown(1);
        
        doc.text(`This certification is issued upon the request of `, { continued: true })
           .font('Times-Bold')
           .text(`${student.firstname} ${student.lastname}`, { continued: true })
           .font('Times-Roman')
           .text(` for `, { continued: true })
           .font('Times-Bold')
           .text(`${student.enrollment_type === 'college' ? 'college/university admission requirements' : 'whatever legal purpose it may serve'}.`, { align: 'justify' })
           .moveDown(1.5);
        
        doc.text(`Issued this `, { continued: true })
           .font('Times-Bold')
           .text(`${formatDate(new Date())}`, { continued: true })
           .font('Times-Roman')
           .text(` at Southville 8B Senior High School, Rodriguez, Rizal.`)
           .moveDown(3);
        
        // Dual signatures
        const signatureY = doc.y;
        
        // Guidance Counselor (left)
        doc.moveTo(100, signatureY + 15)
           .lineTo(250, signatureY + 15)
           .stroke();
        
        doc.font('Times-Bold').fontSize(12)
           .text('JOPHYLYNE S. LUCENA', 100, signatureY + 20, { width: 150, align: 'center' });
        
        doc.font('Times-Roman').fontSize(10)
           .text('Guidance Coordinator', 100, signatureY + 35, { width: 150, align: 'center' });
        
        // School Principal (right)
        doc.moveTo(350, signatureY + 15)
           .lineTo(500, signatureY + 15)
           .stroke();
        
        doc.font('Times-Bold').fontSize(12)
           .text('ENGR. ROCHELLE Z. VALDULLA', 350, signatureY + 20, { width: 150, align: 'center' });
        
        doc.font('Times-Roman').fontSize(10)
           .text('School Head', 350, signatureY + 35, { width: 150, align: 'center' });
        
        // Official stamp
        doc.moveDown(3);
        doc.font('Times-Italic').fontSize(10)
           .text('• Official Document • Not Valid Without School Seal and Signatures •', { align: 'center' })
           .moveDown(0.5);
        
        // Document reference
        doc.font('Times-Roman').fontSize(8)
           .text(`Document ID: GMC-${student.LRN}-${Date.now()} • Generated Electronically`, { align: 'center' });
        
        // Footer
        doc.moveTo(50, doc.page.height - 40)
           .lineTo(doc.page.width - 50, doc.page.height - 40)
           .stroke();
        
        doc.font('Times-Roman').fontSize(9)
           .text('Certificate of Good Moral Character • Southville 8B Senior High School • San Isidro, Rodriguez, Rizal', 
           50, doc.page.height - 35, { width: doc.page.width - 100, align: 'center' });
        
        doc.end();
    } catch (error) {
        console.error('Error generating good moral certificate:', error);
        res.status(500).json({ message: 'Error generating document' });
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
                Title: 'Form 137 - Permanent Academic Record',
                Author: 'Southville 8B Senior High School',
                Subject: 'Student Academic Record',
                Keywords: 'form137,academic,record,transcript,grades'
            }
        });
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="SF10_Permanent_Record_${student.LRN}.pdf"`);
        doc.pipe(res);
        
        // Header with logos
        const logoY = 40;
        drawLogo(doc, 'left', logoY);
        drawLogo(doc, 'right', logoY);
        
        // Official header
        doc.font('Times-Bold').fontSize(12)
           .text('Republic of the Philippines', 200, 45, { width: 200, align: 'center' })
           .moveDown(0.2);
        
        doc.font('Times-Bold').fontSize(14)
           .text('Department of Education', 200, 58, { width: 200, align: 'center' });
        
        doc.font('Times-Bold').fontSize(16)
           .text('LEARNER\'S PERMANENT ACADEMIC RECORD', 200, 75, { width: 200, align: 'center' });
        
        doc.font('Times-Roman').fontSize(10)
           .text('(Formerly Form 137)', 200, 92, { width: 200, align: 'center' });
        
        doc.font('Times-Bold').fontSize(18)
           .text('SOUTHVILLE 8B SENIOR HIGH SCHOOL', 200, 105, { width: 200, align: 'center' });
        
        doc.font('Times-Roman').fontSize(9)
           .text('San Isidro, Rodriguez, Rizal', 200, 122, { width: 200, align: 'center' })
           .moveDown(1);
        
        // Student Information Box
        const infoBoxY = 150;
        doc.rect(40, infoBoxY, 520, 110).lineWidth(1.5).stroke();
        
        // Title box
        doc.rect(40, infoBoxY - 15, 520, 15).fill('#f0f0f0').stroke();
        doc.font('Times-Bold').fontSize(12)
           .fillColor('black')
           .text('LEARNER\'S INFORMATION', 45, infoBoxY - 12);
        
        // Information labels
        const labelStartX = 45;
        const valueStartX = 180;
        
        doc.font('Times-Bold').fontSize(10);
        doc.text('Name:', labelStartX, infoBoxY + 20);
        doc.text('LRN:', labelStartX, infoBoxY + 40);
        doc.text('Date of Birth:', labelStartX, infoBoxY + 60);
        doc.text('Sex:', 320, infoBoxY + 60);
        doc.text('Address:', labelStartX, infoBoxY + 80);
        doc.text('Track/Strand:', labelStartX, infoBoxY + 100);
        
        // Information values
        doc.font('Times-Roman').fontSize(10);
        const fullName = `${student.lastname}, ${student.firstname} ${student.middlename || ''}`.toUpperCase();
        doc.text(fullName, valueStartX, infoBoxY + 20);
        doc.text(student.LRN, valueStartX, infoBoxY + 40);
        doc.text(formatDate(student.birthdate), valueStartX, infoBoxY + 60);
        doc.text(student.sex || 'Not Specified', 370, infoBoxY + 60);
        doc.text(student.address || 'Not Provided', valueStartX, infoBoxY + 80);
        const strand = student.enrolled_strand || student.strand || 'Not Specified';
        doc.text(strand, valueStartX, infoBoxY + 100);
        
        // Scholastic Record Header
        doc.moveDown(0.5);
        const recordY = infoBoxY + 130;
        doc.font('Times-Bold').fontSize(14)
           .text('SENIOR HIGH SCHOOL SCHOLASTIC RECORD', 200, recordY, { width: 200, align: 'center' })
           .moveDown(0.3);
        
        const schoolYear = student.school_year || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;
        doc.font('Times-Roman').fontSize(10)
           .text(`School Year: ${schoolYear} • Semester: ${student.semester || 'First'}`, 
           200, recordY + 20, { width: 200, align: 'center' })
           .moveDown(1);
        
        // Table Header
        const tableTop = recordY + 40;
        doc.rect(40, tableTop, 520, 25).fill('#002060').stroke();
        
        doc.font('Times-Bold').fontSize(11).fillColor('white');
        doc.text('SUBJECTS', 45, tableTop + 8);
        doc.text('MIDTERM', 350, tableTop + 8, { width: 60, align: 'center' });
        doc.text('FINALS', 410, tableTop + 8, { width: 60, align: 'center' });
        doc.text('FINAL GRADE', 470, tableTop + 8, { width: 60, align: 'center' });
        doc.text('REMARKS', 530, tableTop + 8, { width: 30, align: 'center' });
        
        // Sample Data (In production, fetch from database)
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
            // Row background
            if (index % 2 === 0) {
                doc.rect(40, currentY, 520, 25).fill('#f9f9f9').stroke();
            } else {
                doc.rect(40, currentY, 520, 25).fill('#ffffff').stroke();
            }
            
            doc.font('Times-Roman').fontSize(10).fillColor('black');
            doc.text(`${subject.code}: ${subject.name}`, 45, currentY + 8);
            doc.text(subject.midterm, 350, currentY + 8, { width: 60, align: 'center' });
            doc.text(subject.final, 410, currentY + 8, { width: 60, align: 'center' });
            
            // Calculate final grade
            const finalGrade = Math.round((parseInt(subject.midterm) + parseInt(subject.final)) / 2);
            doc.text(finalGrade.toString(), 470, currentY + 8, { width: 60, align: 'center' });
            
            // Remarks
            const remarks = finalGrade >= 75 ? 'PASSED' : 'FAILED';
            const remarksColor = finalGrade >= 75 ? '#006600' : '#cc0000';
            doc.fillColor(remarksColor).text(remarks, 530, currentY + 8, { width: 30, align: 'center' });
            
            currentY += 25;
        });
        
        // Total row
        doc.rect(40, currentY, 520, 25).fill('#e6f0ff').stroke();
        doc.font('Times-Bold').fontSize(10).fillColor('black');
        doc.text('GENERAL AVERAGE:', 45, currentY + 8);
        
        // Calculate general average
        const totalGrades = subjects.reduce((sum, subject) => {
            return sum + Math.round((parseInt(subject.midterm) + parseInt(subject.final)) / 2);
        }, 0);
        const generalAverage = Math.round(totalGrades / subjects.length);
        doc.text(generalAverage.toString(), 470, currentY + 8, { width: 60, align: 'center' });
        
        const overallRemarks = generalAverage >= 75 ? 'PASSED' : 'FAILED';
        const overallColor = generalAverage >= 75 ? '#006600' : '#cc0000';
        doc.fillColor(overallColor).text(overallRemarks, 530, currentY + 8, { width: 30, align: 'center' });
        
        // Signatures section
        currentY += 40;
        const signatureY = currentY;
        
        // Class Adviser
        doc.moveTo(60, signatureY + 15)
           .lineTo(210, signatureY + 15)
           .stroke();
        
        doc.font('Times-Bold').fontSize(10).fillColor('black')
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
        doc.moveTo(40, doc.page.height - 60)
           .lineTo(560, doc.page.height - 60)
           .stroke();
        
        doc.font('Times-Roman').fontSize(8)
           .text('SF10 - Permanent Academic Record • Southville 8B Senior High School • CONFIDENTIAL • Do Not Duplicate Without Authorization', 
           40, doc.page.height - 50, { width: 520, align: 'center' });
        
        doc.text(`Document ID: SF10-${student.LRN}-${Date.now()} • Generated Electronically`, 
           40, doc.page.height - 35, { width: 520, align: 'center' });
        
        doc.end();
    } catch (error) {
        console.error('Error generating Form 137:', error);
        res.status(500).json({ message: 'Error generating Form 137' });
    }
});

// =================== GENERAL CERTIFICATION ===================
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
                Subject: 'Student Certification',
                Keywords: 'certification,school,student,bona fide'
            }
        });
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="General_Certification_${student.LRN}.pdf"`);
        doc.pipe(res);
        
        // Formal header without date
        drawFormalHeader(doc, 'CERTIFICATION', null, false);
        
        // Reference number
        doc.font('Times-Roman').fontSize(10)
           .text(`Reference No.: CERT-${student.LRN}-${new Date().getFullYear()}`, { align: 'right' })
           .moveDown(0.3);
        
        const currentDate = formatDate(new Date());
        doc.font('Times-Roman').fontSize(11)
           .text(`Date: ${currentDate}`, { align: 'right' })
           .moveDown(2);
        
        // Body text with proper spacing
        doc.font('Times-Roman').fontSize(12)
           .text('This is to certify that', { align: 'center' })
           .moveDown(1);
        
        // Student name
        const fullName = `${student.firstname} ${student.middlename ? student.middlename.charAt(0) + '.' : ''} ${student.lastname}`.trim().toUpperCase();
        doc.font('Times-Bold').fontSize(16)
           .text(fullName, { align: 'center' })
           .moveDown(1);
        
        // Underline name
        doc.moveTo(doc.page.width / 2 - 150, doc.y)
           .lineTo(doc.page.width / 2 + 150, doc.y)
           .lineWidth(1)
           .stroke();
        
        doc.moveDown(1.5);
        
        // Certification details
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
        
        // Second paragraph
        doc.font('Times-Roman').fontSize(12)
           .text('This certification is issued upon the request of the above-named student', { align: 'center' })
           .moveDown(0.5);
        
        doc.text('for whatever legal purpose it may serve him/her.', { align: 'center' })
           .moveDown(2);
        
        doc.text('Given this date, affixed with the school seal and signature below.', { align: 'center' })
           .moveDown(3);
        
        // Signature section
        addFormalSignature(doc, 'ENGR. ROCHELLE Z. VALDULLA', 'School Head');
        
        // Official stamp
        doc.moveDown(1);
        doc.font('Times-Italic').fontSize(10)
           .text('• Official Document • Valid only with school seal and signature •', { align: 'center' })
           .moveDown(0.5);
        
        // Document reference
        doc.font('Times-Roman').fontSize(8)
           .text(`Document ID: CERT-${student.LRN}-${Date.now()} • Generated Electronically`, { align: 'center' });
        
        // Footer
        doc.moveTo(50, doc.page.height - 40)
           .lineTo(doc.page.width - 50, doc.page.height - 40)
           .stroke();
        
        doc.font('Times-Roman').fontSize(9)
           .text('Southville 8B Senior High School • San Isidro, Rodriguez, Rizal • Email: 342567@deped.gov.ph • Telephone: (02) 8551-1982', 
           50, doc.page.height - 35, { width: doc.page.width - 100, align: 'center' });
        
        doc.end();
    } catch (error) {
        console.error('Error generating certification:', error);
        res.status(500).json({ 
            message: 'Error generating certification',
            error: error.message
        });
    }
});

export default router;
