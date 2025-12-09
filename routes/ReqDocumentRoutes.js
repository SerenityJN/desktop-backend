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

// Helper function for formal school header
function drawSchoolHeader(doc, yStart = 40) {
    // Draw logos
    drawLogo(doc, 'left', yStart);
    drawLogo(doc, 'right', yStart);
    
    const pageCenter = doc.page.width / 2;
    let currentY = yStart;
    
    // Republic of the Philippines
    doc.font('Times-Bold').fontSize(11)
       .text('Republic of the Philippines', pageCenter, currentY, { align: 'center', width: 400 })
       .moveDown(0.2);
    
    currentY = doc.y;
    // Department of Education
    doc.font('Times-Bold').fontSize(13)
       .text('Department of Education', pageCenter, currentY, { align: 'center', width: 400 });
    
    // Region
    doc.moveDown(0.3);
    currentY = doc.y;
    doc.font('Times-Roman').fontSize(10)
       .text('Region IV-A CALABARZON', pageCenter, currentY, { align: 'center', width: 400 })
       .moveDown(0.2);
    
    // Schools Division
    currentY = doc.y;
    doc.font('Times-Bold').fontSize(10)
       .text('SCHOOLS DIVISION OF RIZAL', pageCenter, currentY, { align: 'center', width: 400 })
       .moveDown(0.2);
    
    // District
    currentY = doc.y;
    doc.font('Times-Roman').fontSize(10)
       .text('RODRIGUEZ DISTRICT', pageCenter, currentY, { align: 'center', width: 400 })
       .moveDown(0.5);
    
    // School name - EXACTLY LIKE IN IMAGE
    currentY = doc.y;
    doc.font('Times-Bold').fontSize(18)
       .text('SOUTHVILLE 8B SENIOR HIGH SCHOOL', pageCenter, currentY, { align: 'center', width: 400 })
       .moveDown(0.3);
    
    // Location
    currentY = doc.y;
    doc.font('Times-Roman').fontSize(10)
       .text('San Isidro, Rodriguez, Rizal', pageCenter, currentY, { align: 'center', width: 400 })
       .moveDown(0.2);
    
    // Contact info - EXACT FORMAT AS IMAGE
    currentY = doc.y;
    doc.font('Times-Roman').fontSize(9)
       .text('Email: 342567@deped.gov.ph • Telephone: (02) 8551-1982', pageCenter, currentY, { align: 'center', width: 400 })
       .moveDown(1);
    
    // Decorative line
    const lineY = doc.y + 5;
    doc.moveTo(50, lineY)
       .lineTo(doc.page.width - 50, lineY)
       .lineWidth(0.5)
       .stroke();
    
    doc.moveDown(1.5);
    
    return doc.y;
}

// Helper function for Form 137 header
function drawForm137Header(doc, yStart = 30) {
    // Draw logos
    drawLogo(doc, 'left', yStart + 10);
    drawLogo(doc, 'right', yStart + 10);
    
    const pageCenter = doc.page.width / 2;
    let currentY = yStart;
    
    // Republic of the Philippines
    doc.font('Times-Bold').fontSize(11)
       .text('Republic of the Philippines', pageCenter, currentY, { align: 'center', width: 400 });
    
    // Department of Education
    currentY += 15;
    doc.font('Times-Bold').fontSize(13)
       .text('Department of Education', pageCenter, currentY, { align: 'center', width: 400 });
    
    // LEARNER'S PERMANENT ACADEMIC RECORD
    currentY += 20;
    doc.font('Times-Bold').fontSize(14)
       .text('LEARNER\'S PERMANENT ACADEMIC RECORD', pageCenter, currentY, { align: 'center', width: 400 });
    
    // (Formerly Form 137)
    currentY += 15;
    doc.font('Times-Roman').fontSize(9)
       .text('(Formerly Form 137)', pageCenter, currentY, { align: 'center', width: 400 });
    
    // School name - TWO LINES LIKE IN IMAGE
    currentY += 18;
    doc.font('Times-Bold').fontSize(16)
       .text('SOUTHVILLE 8B SENIOR HIGH SCHOOL', pageCenter, currentY, { align: 'center', width: 400 });
    
    // Location
    currentY += 15;
    doc.font('Times-Roman').fontSize(9)
       .text('San Isidro, Rodriguez, Rizal', pageCenter, currentY, { align: 'center', width: 400 });
    
    return currentY + 20;
}

// Helper function to format date
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
        res.setHeader('Content-Disposition', `inline; filename="Good_Moral_Certificate_${student.LRN}.pdf"`);
        doc.pipe(res);
        
        // Draw school header
        drawSchoolHeader(doc, 40);
        
        // Certificate title - CENTERED WITH PROPER SPACING
        doc.moveDown(0.5);
        doc.font('Times-Bold').fontSize(22)
           .text('CERTIFICATE OF GOOD MORAL CHARACTER', { align: 'center' })
           .moveDown(1.5);
        
        // Reference number and date - RIGHT ALIGNED
        doc.font('Times-Roman').fontSize(10)
           .text(`Reference No.: GMC-${student.LRN}-${new Date().getFullYear()}`, { align: 'right' })
           .moveDown(0.2);
        
        const currentDate = formatDate(new Date());
        doc.font('Times-Roman').fontSize(10)
           .text(`Date Issued: ${currentDate}`, { align: 'right' })
           .moveDown(2);
        
        // Addressee - LEFT ALIGNED
        doc.font('Times-Bold').fontSize(12)
           .text('TO WHOM IT MAY CONCERN:', { align: 'left' })
           .moveDown(1);
        
        // Body text - EXACT FORMAT AS IMAGE
        const fullName = `${student.lastname || ''}, ${student.firstname || ''} ${student.middlename ? student.middlename.charAt(0) + '.' : ''}`.trim();
        
        // First paragraph - WITH BOLD TEXT PROPERLY
        doc.font('Times-Roman').fontSize(12)
           .text('This is to certify that ', { continued: true })
           .font('Times-Bold')
           .text(`${fullName.toUpperCase()}, `, { continued: true })
           .font('Times-Roman')
           .text('bearing Learner Reference Number ', { continued: true })
           .font('Times-Bold')
           .text(`${student.LRN}, `, { continued: true })
           .font('Times-Roman')
           .text('is a bona fide student of Southville 8B Senior High School.')
           .moveDown(1);
        
        // Second paragraph
        const yearLevel = student.enrolled_year_level || student.yearlevel || 'Grade 11';
        const strand = student.enrolled_strand || student.strand || 'ACAD - HUMSS';
        const schoolYear = student.school_year || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;
        const pronoun = student.sex?.toLowerCase() === 'male' ? 'He' : 'She';
        
        doc.font('Times-Roman').fontSize(12)
           .text(`${pronoun} is currently enrolled in `, { continued: true })
           .font('Times-Bold')
           .text(`${yearLevel} `, { continued: true })
           .font('Times-Roman')
           .text('under the ', { continued: true })
           .font('Times-Bold')
           .text(`${strand} `, { continued: true })
           .font('Times-Roman')
           .text('strand for the School Year ', { continued: true })
           .font('Times-Bold')
           .text(`${schoolYear}.`)
           .moveDown(1);
        
        // Third paragraph
        doc.font('Times-Roman').fontSize(12)
           .text('Based on official school records and as certified by the Guidance and Counseling Office, ', { continued: true })
           .font('Times-Bold')
           .text(`${fullName.toUpperCase()} `, { continued: true })
           .font('Times-Roman')
           .text('has exhibited good moral character during his entire stay in this institution. He has not been subjected to any disciplinary action and has consistently demonstrated proper conduct, behavior, and adherence to school rules and regulations.')
           .moveDown(1);
        
        // Fourth paragraph
        doc.font('Times-Roman').fontSize(12)
           .text('He is known to be ', { continued: true })
           .font('Times-Bold')
           .text('courteous, responsible, and respectful, ', { continued: true })
           .font('Times-Roman')
           .text('maintaining good relationships with peers, teachers, and school personnel.')
           .moveDown(1);
        
        // Fifth paragraph
        doc.font('Times-Roman').fontSize(12)
           .text('This certification is issued upon the request of ', { continued: true })
           .font('Times-Bold')
           .text(`${student.firstname.toLowerCase()} ${student.lastname.toLowerCase()} `, { continued: true })
           .font('Times-Roman')
           .text('for whatever legal purpose it may serve.')
           .moveDown(3);
        
        // Sixth paragraph
        doc.font('Times-Roman').fontSize(12)
           .text('Issued this ', { continued: true })
           .font('Times-Bold')
           .text(`${currentDate} `, { continued: true })
           .font('Times-Roman')
           .text('at Southville 8B Senior High School, Rodriguez, Rizal.')
           .moveDown(4);
        
        // Signatures - SIDE BY SIDE
        const signatureY = doc.y;
        
        // Guidance Counselor (LEFT)
        doc.moveTo(80, signatureY + 15)
           .lineTo(230, signatureY + 15)
           .stroke();
        
        doc.font('Times-Bold').fontSize(12)
           .text('JOPHYLYNE S. LUCENA', 80, signatureY + 20, { width: 150, align: 'center' });
        
        doc.font('Times-Roman').fontSize(10)
           .text('Guidance Counselor', 80, signatureY + 35, { width: 150, align: 'center' });
        
        // School Head (RIGHT)
        doc.moveTo(330, signatureY + 15)
           .lineTo(480, signatureY + 15)
           .stroke();
        
        doc.font('Times-Bold').fontSize(12)
           .text('ENGR. ROCHELLE Z. VALDULLA', 330, signatureY + 20, { width: 150, align: 'center' });
        
        doc.font('Times-Roman').fontSize(10)
           .text('School Head', 330, signatureY + 35, { width: 150, align: 'center' });
        
        // Official stamp
        doc.moveDown(3);
        doc.font('Times-Italic').fontSize(9)
           .text('• Not valid without school seal •', { align: 'center' });
        
        doc.end();
    } catch (error) {
        console.error('Error generating good moral certificate:', error);
        res.status(500).json({ message: 'Error generating document' });
    }
});

// =================== ENROLLMENT CERTIFICATE ===================
router.get('/generate/enrollment/:lrn', verifyAdmin, async (req, res) => {
    try {
        const student = await getStudentData(req.params.lrn);
        if (!student) return res.status(404).json({ message: 'Student not found' });

        const doc = new PDFDocument({ 
            margin: 50,
            size: 'A4',
            info: {
                Title: 'Certificate of Enrollment',
                Author: 'Southville 8B Senior High School',
                Subject: 'Student Enrollment Certificate'
            }
        });
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="Enrollment_Certificate_${student.LRN}.pdf"`);
        doc.pipe(res);
        
        // Draw school header
        drawSchoolHeader(doc, 40);
        
        // Certificate title - CENTERED
        doc.moveDown(0.5);
        doc.font('Times-Bold').fontSize(22)
           .text('CERTIFICATE OF ENROLLMENT', { align: 'center' })
           .moveDown(1.5);
        
        // Reference number and date - RIGHT ALIGNED
        doc.font('Times-Roman').fontSize(10)
           .text(`Reference No.: COE-${student.LRN}-${new Date().getFullYear()}`, { align: 'right' })
           .moveDown(0.2);
        
        const currentDate = formatDate(new Date());
        doc.font('Times-Roman').fontSize(10)
           .text(`Date Issued: ${currentDate}`, { align: 'right' })
           .moveDown(2);
        
        // Addressee - LEFT ALIGNED
        doc.font('Times-Bold').fontSize(12)
           .text('TO WHOM IT MAY CONCERN:', { align: 'left' })
           .moveDown(1);
        
        // Body text - EXACT FORMAT AS IMAGE
        const fullName = `${student.lastname || ''}, ${student.firstname || ''} ${student.middlename ? student.middlename.charAt(0) + '.' : ''}`.trim();
        
        // First paragraph
        doc.font('Times-Roman').fontSize(12)
           .text('This is to certify that ', { continued: true })
           .font('Times-Bold')
           .text(`${fullName.toUpperCase()} `, { continued: true })
           .font('Times-Roman')
           .text('bearing Learner Reference Number (LRN) ', { continued: true })
           .font('Times-Bold')
           .text(`${student.LRN}, `, { continued: true })
           .font('Times-Roman')
           .text('is a bona fide student of Southville 8B Senior High School, located at San Isidro, Rodriguez, Rizal.')
           .moveDown(1);
        
        // Second paragraph
        const yearLevel = student.enrolled_year_level || student.yearlevel || 'Grade 11';
        const strand = student.enrolled_strand || student.strand || 'ACAD - HUMSS';
        const schoolYear = student.school_year || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;
        
        doc.font('Times-Roman').fontSize(12)
           .text('The aforementioned student is currently enrolled as a ', { continued: true })
           .font('Times-Bold')
           .text(`${yearLevel} `, { continued: true })
           .font('Times-Roman')
           .text('student under the ', { continued: true })
           .font('Times-Bold')
           .text(`${strand} `, { continued: true })
           .font('Times-Roman')
           .text('strand for the School Year ', { continued: true })
           .font('Times-Bold')
           .text(`${schoolYear}.`)
           .moveDown(1);
        
        // Third paragraph
        const enrollmentType = student.enrollment_type || 'regular';
        const purpose = enrollmentType === 'scholarship' ? 'scholarship application' : 'transfer to another institution';
        
        doc.font('Times-Roman').fontSize(12)
           .text('This certification is issued upon the request of ', { continued: true })
           .font('Times-Bold')
           .text(`${student.firstname.toLowerCase()} ${student.lastname.toLowerCase()} `, { continued: true })
           .font('Times-Roman')
           .text('for whatever legal purpose it may serve, particularly for ', { continued: true })
           .font('Times-Bold')
           .text(`${purpose}.`)
           .moveDown(1.5);
        
        // Fourth paragraph
        doc.font('Times-Roman').fontSize(12)
           .text('Issued this ', { continued: true })
           .font('Times-Bold')
           .text(`${currentDate} `, { continued: true })
           .font('Times-Roman')
           .text('at the office of the School Registrar, Southville 8B Senior High School, Rodriguez, Rizal.')
           .moveDown(4);
        
        // Signature line and name - CENTERED
        doc.moveTo(doc.page.width / 2 - 100, doc.y + 10)
           .lineTo(doc.page.width / 2 + 100, doc.y + 10)
           .stroke();
        
        doc.font('Times-Bold').fontSize(12)
           .text('DARYL F. BALBINO', doc.page.width / 2 - 100, doc.y + 5, { width: 200, align: 'center' });
        
        doc.font('Times-Roman').fontSize(10)
           .text('School Registrar', doc.page.width / 2 - 100, doc.y + 20, { width: 200, align: 'center' });
        
        // Official stamp
        doc.moveDown(2);
        doc.font('Times-Italic').fontSize(9)
           .text('• Not valid without school seal •', { align: 'center' });
        
        doc.end();
    } catch (error) {
        console.error('Error generating enrollment certificate:', error);
        res.status(500).json({ message: 'Error generating document' });
    }
});

// =================== FORM 137 ===================
router.get('/generate/form137/:lrn', verifyAdmin, async (req, res) => {
    try {
        const student = await getStudentData(req.params.lrn);
        if (!student) return res.status(404).json({ message: 'Student not found' });

        const doc = new PDFDocument({ 
            margin: 30, 
            size: 'Legal',
            info: {
                Title: 'Form 137 - Permanent Academic Record',
                Author: 'Southville 8B Senior High School',
                Subject: 'Student Academic Record'
            }
        });
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="Form_137_${student.LRN}.pdf"`);
        doc.pipe(res);
        
        // Draw Form 137 header
        const afterHeaderY = drawForm137Header(doc, 30);
        
        // LEARNER'S INFORMATION box
        const infoBoxY = afterHeaderY;
        const infoBoxWidth = 520;
        
        // Box border
        doc.rect(30, infoBoxY, infoBoxWidth, 110).stroke();
        
        // Title background
        doc.rect(30, infoBoxY - 15, infoBoxWidth, 15).fill('#f0f0f0').stroke();
        doc.font('Times-Bold').fontSize(12).fillColor('black')
           .text('LEARNER\'S INFORMATION', 35, infoBoxY - 12);
        
        // Draw table lines
        const cellHeight = 22;
        const labelWidth = 120;
        const valueWidth = 380;
        
        // Draw horizontal lines
        for (let i = 0; i <= 5; i++) {
            const y = infoBoxY + (i * cellHeight);
            doc.moveTo(30, y).lineTo(550, y).stroke();
        }
        
        // Draw vertical lines
        doc.moveTo(30 + labelWidth, infoBoxY)
           .lineTo(30 + labelWidth, infoBoxY + (5 * cellHeight))
           .stroke();
        
        // Fill in information
        const fullName = `${student.lastname}, ${student.firstname} ${student.middlename || ''}`.toUpperCase();
        const strand = student.enrolled_strand || student.strand || 'ACAD - HUMSS';
        const birthDate = formatDate(student.birthdate);
        
        // Labels
        doc.font('Times-Bold').fontSize(10);
        doc.text('Name:', 35, infoBoxY + 8);
        doc.text('LRN:', 35, infoBoxY + 8 + cellHeight);
        doc.text('Date of Birth:', 35, infoBoxY + 8 + (cellHeight * 2));
        doc.text('Sex:', 35, infoBoxY + 8 + (cellHeight * 3));
        doc.text('Address:', 35, infoBoxY + 8 + (cellHeight * 4));
        doc.text('Track/Strand:', 35, infoBoxY + 8 + (cellHeight * 5));
        
        // Values
        doc.font('Times-Roman').fontSize(10);
        doc.text(fullName, 30 + labelWidth + 5, infoBoxY + 8, { width: valueWidth - 10 });
        doc.text(student.LRN, 30 + labelWidth + 5, infoBoxY + 8 + cellHeight, { width: valueWidth - 10 });
        doc.text(birthDate, 30 + labelWidth + 5, infoBoxY + 8 + (cellHeight * 2), { width: valueWidth - 10 });
        doc.text(student.sex || 'Male', 30 + labelWidth + 5, infoBoxY + 8 + (cellHeight * 3), { width: valueWidth - 10 });
        doc.text(student.address || 'Not Provided', 30 + labelWidth + 5, infoBoxY + 8 + (cellHeight * 4), { width: valueWidth - 10 });
        doc.text(strand, 30 + labelWidth + 5, infoBoxY + 8 + (cellHeight * 5), { width: valueWidth - 10 });
        
        // SENIOR HIGH SCHOOL SCHOLASTIC RECORD title
        const scholasticY = infoBoxY + 130;
        doc.font('Times-Bold').fontSize(14)
           .text('SENIOR HIGH SCHOOL SCHOLASTIC RECORD', 30, scholasticY, { width: infoBoxWidth, align: 'center' });
        
        // School Year info
        const schoolYear = student.school_year || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;
        doc.font('Times-Roman').fontSize(10)
           .text(`School Year: ${schoolYear}`, 30, scholasticY + 20, { width: infoBoxWidth, align: 'center' });
        
        // Grades table
        const tableTop = scholasticY + 45;
        const colWidths = [250, 60, 60, 60, 60]; // SUBJECTS, MIDTERM, FINALS, FINAL GRADE, REMARKS
        
        // Table header
        doc.rect(30, tableTop, infoBoxWidth, 25).fill('#002060').stroke();
        
        doc.font('Times-Bold').fontSize(11).fillColor('white');
        let currentX = 35;
        doc.text('SUBJECTS', currentX, tableTop + 8);
        
        currentX += colWidths[0];
        doc.text('MIDTERM', currentX, tableTop + 8, { width: colWidths[1], align: 'center' });
        
        currentX += colWidths[1];
        doc.text('FINALS', currentX, tableTop + 8, { width: colWidths[2], align: 'center' });
        
        currentX += colWidths[2];
        doc.text('FINAL GRADE', currentX, tableTop + 8, { width: colWidths[3], align: 'center' });
        
        currentX += colWidths[3];
        doc.text('REMARKS', currentX, tableTop + 8, { width: colWidths[4], align: 'center' });
        
        // Sample data (replace with actual database query)
        const subjects = [
            { code: 'CORE 101', name: 'Oral Communication', midterm: '88', final: '90' },
            { code: 'CORE 102', name: 'Komunikasyon sa Pananaliksik', midterm: '85', final: '87' },
            { code: 'CORE 103', name: 'General Mathematics', midterm: '83', final: '85' },
            { code: 'APPLIED 101', name: 'Empowerment Technologies', midterm: '91', final: '92' },
            { code: 'SPEC 201', name: 'Pre-Calculus', midterm: '80', final: '82' },
            { code: 'SPEC 202', name: 'Basic Calculus', midterm: '78', final: '80' },
        ];
        
        let currentY = tableTop + 25;
        const rowHeight = 25;
        
        subjects.forEach((subject, index) => {
            // Alternate row colors
            if (index % 2 === 0) {
                doc.rect(30, currentY, infoBoxWidth, rowHeight).fill('#f9f9f9').stroke();
            } else {
                doc.rect(30, currentY, infoBoxWidth, rowHeight).fill('#ffffff').stroke();
            }
            
            // Calculate final grade
            const finalGrade = Math.round((parseInt(subject.midterm) + parseInt(subject.final)) / 2);
            const remarks = finalGrade >= 75 ? 'PASSED' : 'FAILED';
            
            // Fill cells
            doc.font('Times-Roman').fontSize(10).fillColor('black');
            currentX = 35;
            doc.text(`${subject.code}: ${subject.name}`, currentX, currentY + 8);
            
            currentX += colWidths[0];
            doc.text(subject.midterm, currentX, currentY + 8, { width: colWidths[1], align: 'center' });
            
            currentX += colWidths[1];
            doc.text(subject.final, currentX, currentY + 8, { width: colWidths[2], align: 'center' });
            
            currentX += colWidths[2];
            doc.text(finalGrade.toString(), currentX, currentY + 8, { width: colWidths[3], align: 'center' });
            
            currentX += colWidths[3];
            const remarkColor = finalGrade >= 75 ? '#006600' : '#cc0000';
            doc.fillColor(remarkColor).text(remarks, currentX, currentY + 8, { width: colWidths[4], align: 'center' });
            
            currentY += rowHeight;
        });
        
        // General Average row
        doc.rect(30, currentY, infoBoxWidth, rowHeight).fill('#e6f0ff').stroke();
        
        // Calculate general average
        const totalGrades = subjects.reduce((sum, subject) => {
            return sum + Math.round((parseInt(subject.midterm) + parseInt(subject.final)) / 2);
        }, 0);
        const generalAverage = Math.round(totalGrades / subjects.length);
        const overallRemarks = generalAverage >= 75 ? 'PASSED' : 'FAILED';
        
        doc.font('Times-Bold').fontSize(10).fillColor('black');
        currentX = 35;
        doc.text('GENERAL AVERAGE:', currentX, currentY + 8);
        
        currentX += colWidths[0];
        doc.text('', currentX, currentY + 8, { width: colWidths[1], align: 'center' });
        
        currentX += colWidths[1];
        doc.text('', currentX, currentY + 8, { width: colWidths[2], align: 'center' });
        
        currentX += colWidths[2];
        doc.text(generalAverage.toString(), currentX, currentY + 8, { width: colWidths[3], align: 'center' });
        
        currentX += colWidths[3];
        const overallColor = generalAverage >= 75 ? '#006600' : '#cc0000';
        doc.fillColor(overallColor).text(overallRemarks, currentX, currentY + 8, { width: colWidths[4], align: 'center' });
        
        // Signatures section
        const signaturesY = currentY + 40;
        const signatureWidth = 150;
        const signatureSpacing = 50;
        
        // Class Adviser
        doc.moveTo(60, signaturesY + 15)
           .lineTo(60 + signatureWidth, signaturesY + 15)
           .stroke();
        
        doc.font('Times-Bold').fontSize(10)
           .text('JUANA DELA CRUZ', 60, signaturesY + 20, { width: signatureWidth, align: 'center' });
        
        doc.font('Times-Roman').fontSize(9)
           .text('Class Adviser', 60, signaturesY + 32, { width: signatureWidth, align: 'center' });
        
        // School Registrar
        doc.moveTo(60 + signatureWidth + signatureSpacing, signaturesY + 15)
           .lineTo(60 + signatureWidth + signatureSpacing + signatureWidth, signaturesY + 15)
           .stroke();
        
        doc.font('Times-Bold').fontSize(10)
           .text('DARYL F. BALBINO', 60 + signatureWidth + signatureSpacing, signaturesY + 20, { width: signatureWidth, align: 'center' });
        
        doc.font('Times-Roman').fontSize(9)
           .text('School Registrar II', 60 + signatureWidth + signatureSpacing, signaturesY + 32, { width: signatureWidth, align: 'center' });
        
        // School Head
        doc.moveTo(60 + (signatureWidth * 2) + (signatureSpacing * 2), signaturesY + 15)
           .lineTo(60 + (signatureWidth * 2) + (signatureSpacing * 2) + signatureWidth, signaturesY + 15)
           .stroke();
        
        doc.font('Times-Bold').fontSize(10)
           .text('ENGR. ROCHELLE Z. VALDULLA', 60 + (signatureWidth * 2) + (signatureSpacing * 2), signaturesY + 20, { width: signatureWidth, align: 'center' });
        
        doc.font('Times-Roman').fontSize(9)
           .text('School Head', 60 + (signatureWidth * 2) + (signatureSpacing * 2), signaturesY + 32, { width: signatureWidth, align: 'center' });
        
        // Footer
        doc.moveTo(30, doc.page.height - 40)
           .lineTo(550, doc.page.height - 40)
           .stroke();
        
        doc.font('Times-Roman').fontSize(8)
           .text('SF10 - Permanent Academic Record • Southville 8B Senior High School • CONFIDENTIAL', 
           30, doc.page.height - 35, { width: 520, align: 'center' });
        
        doc.end();
    } catch (error) {
        console.error('Error generating Form 137:', error);
        res.status(500).json({ message: 'Error generating Form 137' });
    }
});

export default router;
