import express from 'express';
import PDFDocument from 'pdfkit';
import db from "../models/db.js";
import { verifyAdmin } from '../middleware/auth.js';
import fs from 'fs';
import path from 'path';

const router = express.Router();

// Helper function to draw official DepEd logo
async function drawOfficialLogo(doc, side, yPosition) {
    try {
        const logoPath = path.join(process.cwd(), 'public', 'images', 'deped_logo.png');
        if (fs.existsSync(logoPath)) {
            if (side === 'left') {
                doc.image(logoPath, 50, yPosition, { width: 60, height: 60 });
            } else {
                doc.image(logoPath, doc.page.width - 110, yPosition, { width: 60, height: 60 });
            }
        } else {
            // Draw DepEd logo placeholder
            doc.fillColor('#003366');
            if (side === 'left') {
                doc.circle(80, yPosition + 30, 30).fill();
                doc.fillColor('white')
                   .fontSize(8)
                   .text('DepEd', 65, yPosition + 25, { width: 30, align: 'center' })
                   .text('Philippines', 65, yPosition + 35, { width: 30, align: 'center' });
            } else {
                doc.circle(doc.page.width - 80, yPosition + 30, 30).fill();
                doc.fillColor('white')
                   .fontSize(8)
                   .text('DepEd', doc.page.width - 95, yPosition + 25, { width: 30, align: 'center' })
                   .text('Philippines', doc.page.width - 95, yPosition + 35, { width: 30, align: 'center' });
            }
            doc.fillColor('black');
        }
    } catch (error) {
        console.error('Error drawing logo:', error);
    }
}

// Helper function to get official document border
function drawOfficialBorder(doc) {
    // Outer border
    doc.rect(25, 25, doc.page.width - 50, doc.page.height - 50)
       .lineWidth(2)
       .strokeColor('#003366')
       .stroke();
    
    // Inner border
    doc.rect(35, 35, doc.page.width - 70, doc.page.height - 70)
       .lineWidth(0.5)
       .strokeColor('#666666')
       .stroke();
}

// Helper function to add official DepEd header
function drawDepEdHeader(doc) {
    const headerY = 40;
    
    // Draw logos
    drawOfficialLogo(doc, 'left', headerY);
    drawOfficialLogo(doc, 'right', headerY);
    
    // Official header text - Centered
    doc.font('Times-Bold').fontSize(12)
       .text('Republic of the Philippines', { align: 'center' })
       .moveDown(0.2);
    
    doc.font('Times-Bold').fontSize(14)
       .text('Department of Education', { align: 'center' })
       .moveDown(0.2);
    
    doc.font('Times-Roman').fontSize(11)
       .text('REGION IV-A (CALABARZON)', { align: 'center' })
       .moveDown(0.2);
    
    doc.font('Times-Bold').fontSize(11)
       .text('SCHOOLS DIVISION OF RIZAL', { align: 'center' })
       .moveDown(0.2);
    
    doc.font('Times-Roman').fontSize(10)
       .text('RODRIGUEZ DISTRICT', { align: 'center' })
       .moveDown(0.5);
    
    // School information
    doc.font('Times-Bold').fontSize(16)
       .text('SOUTHVILLE 8B SENIOR HIGH SCHOOL', { align: 'center' })
       .moveDown(0.2);
    
    doc.font('Times-Roman').fontSize(10)
       .text('San Isidro, Rodriguez, Rizal', { align: 'center' })
       .moveDown(0.2);
    
    doc.font('Times-Roman').fontSize(9)
       .text('School ID: 342567 • Email: 342567@deped.gov.ph • Tel: (02) 8551-1982', { align: 'center' })
       .moveDown(1.5);
    
    return doc.y;
}

// Helper function to add signature section with proper formatting
function addOfficialSignature(doc, name, position, isPrincipal = false) {
    const currentY = doc.y;
    
    // Signature line
    doc.moveTo(doc.page.width / 2 - 100, currentY + 10)
       .lineTo(doc.page.width / 2 + 100, currentY + 10)
       .stroke();
    
    // Name
    doc.font('Times-Bold').fontSize(12)
       .text(name.toUpperCase(), doc.page.width / 2 - 100, currentY + 15, {
           width: 200,
           align: 'center'
       });
    
    // Position
    doc.font('Times-Roman').fontSize(10)
       .text(position, doc.page.width / 2 - 100, currentY + 30, {
           width: 200,
           align: 'center'
       });
    
    // License number for principal
    if (isPrincipal) {
        doc.font('Times-Italic').fontSize(9)
           .text('Professional License No. 123456', doc.page.width / 2 - 100, currentY + 42, {
               width: 200,
               align: 'center'
           });
    }
    
    doc.moveDown(2);
}

// Helper function to add document control information
function addDocumentControl(doc, docType, lrn) {
    const controlNumber = `${docType}-${lrn}-${new Date().getFullYear()}`;
    const dateIssued = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    
    doc.font('Times-Roman').fontSize(9)
       .text(`Control No.: ${controlNumber}`, 50, doc.page.height - 80)
       .text(`Date Issued: ${dateIssued}`, doc.page.width - 150, doc.page.height - 80);
}

// Get comprehensive student data
async function getCompleteStudentData(LRN) {
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
                se.enrollment_type,
                se.status,
                se.enrollment_date,
                gr.grade_level,
                gr.strand,
                gr.track
            FROM student_details sd
            LEFT JOIN guardians g ON sd.LRN = g.LRN
            LEFT JOIN student_enrollments se ON sd.LRN = se.LRN 
                AND se.status = 'enrolled'
                AND se.id = (
                    SELECT MAX(id) 
                    FROM student_enrollments 
                    WHERE LRN = sd.LRN AND status = 'enrolled'
                )
            LEFT JOIN grade_levels gr ON sd.grade_level_id = gr.id
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

// =================== OFFICIAL CERTIFICATE OF ENROLLMENT ===================
router.get('/generate/enrollment/:lrn', verifyAdmin, async (req, res) => {
    try {
        const student = await getCompleteStudentData(req.params.lrn);
        if (!student) {
            return res.status(404).json({ 
                message: 'Student not found',
                details: `No enrolled student found with LRN: ${req.params.lrn}`
            });
        }

        const doc = new PDFDocument({ 
            margin: 50,
            size: 'A4',
            info: {
                Title: 'Official Certificate of Enrollment',
                Author: 'Southville 8B Senior High School',
                Subject: 'Certificate of Enrollment',
                Keywords: 'enrollment, certificate, DepEd, Philippines'
            }
        });
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="COE_${student.LRN}_${new Date().getFullYear()}.pdf"`);
        doc.pipe(res);
        
        // Add official border
        drawOfficialBorder(doc);
        
        // Add DepEd header
        const afterHeaderY = drawDepEdHeader(doc);
        doc.y = afterHeaderY;
        
        // Document title
        doc.font('Times-Bold').fontSize(18)
           .text('CERTIFICATE OF ENROLLMENT', { align: 'center', underline: true })
           .moveDown(2);
        
        // Reference information
        doc.font('Times-Roman').fontSize(10)
           .text(`Reference No.: COE-${student.LRN}-${new Date().getFullYear()}`, { align: 'right' })
           .text(`Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, { align: 'right' })
           .moveDown(2);
        
        // Body of the certificate
        doc.font('Times-Bold').fontSize(12)
           .text('TO WHOM IT MAY CONCERN:', { align: 'left' })
           .moveDown();
        
        const fullName = `${student.lastname}, ${student.firstname} ${student.middlename || ''}`.trim().toUpperCase();
        const gradeLevel = student.grade_level || 'Grade 11';
        const strand = student.strand || 'Not Specified';
        const schoolYear = student.school_year || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;
        const currentDate = new Date().toLocaleDateString('en-PH', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        
        doc.font('Times-Roman').fontSize(12)
           .text('This is to certify that ', { continued: true })
           .font('Times-Bold')
           .text(fullName, { continued: true })
           .font('Times-Roman')
           .text(`, Learner Reference Number (LRN) `, { continued: true })
           .font('Times-Bold')
           .text(student.LRN, { continued: true })
           .font('Times-Roman')
           .text(`, is a bona fide student of Southville 8B Senior High School, Rodriguez District, Schools Division of Rizal.`, { align: 'justify' })
           .moveDown();
        
        doc.text(`The student is officially enrolled in `, { continued: true })
           .font('Times-Bold')
           .text(`${gradeLevel}`, { continued: true })
           .font('Times-Roman')
           .text(` under the `, { continued: true })
           .font('Times-Bold')
           .text(`${strand}`, { continued: true })
           .font('Times-Roman')
           .text(` strand for the School Year `, { continued: true })
           .font('Times-Bold')
           .text(`${schoolYear}.`, { align: 'justify' })
           .moveDown();
        
        doc.text(`This certification is issued upon the request of the student for `, { continued: true })
           .font('Times-Bold')
           .text(`${student.enrollment_type === 'transfer' ? 'transfer to another school' : 'scholarship application'}.`, { align: 'justify' })
           .moveDown();
        
        doc.text(`Issued this `, { continued: true })
           .font('Times-Bold')
           .text(currentDate, { continued: true })
           .font('Times-Roman')
           .text(` at Southville 8B Senior High School, San Isidro, Rodriguez, Rizal.`)
           .moveDown(4);
        
        // Signature section
        addOfficialSignature(doc, 'DARYL F. BALBINO', 'School Registrar II');
        
        // School seal text
        doc.font('Times-Italic').fontSize(9)
           .text('(Not valid without the official school seal)', { align: 'center' })
           .moveDown(3);
        
        // Document control
        addDocumentControl(doc, 'COE', student.LRN);
        
        // Official footer
        doc.font('Times-Roman').fontSize(8)
           .text('This document is issued in accordance with DepEd Order No. 11, s. 2018 (Updated Guidelines on the Management of Learner Records)', 
           50, doc.page.height - 60, { 
               width: doc.page.width - 100, 
               align: 'center' 
           });
        
        doc.text('SOUTHVILLE 8B SENIOR HIGH SCHOOL • SAN ISIDRO, RODRIGUEZ, RIZAL • SCHOOL ID: 342567', 
           50, doc.page.height - 45, { 
               width: doc.page.width - 100, 
               align: 'center' 
           });
        
        doc.end();
    } catch (error) {
        console.error('Error generating enrollment certificate:', error);
        res.status(500).json({ 
            message: 'Error generating document',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// =================== CERTIFICATE OF GOOD MORAL CHARACTER ===================
router.get('/generate/good_moral/:lrn', verifyAdmin, async (req, res) => {
    try {
        const student = await getCompleteStudentData(req.params.lrn);
        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }

        const doc = new PDFDocument({ 
            margin: 50,
            size: 'A4',
            info: {
                Title: 'Certificate of Good Moral Character',
                Author: 'Southville 8B Senior High School',
                Subject: 'Good Moral Character Certificate',
                Keywords: 'moral character, certificate, clearance, DepEd'
            }
        });
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="GoodMoral_${student.LRN}_${new Date().getFullYear()}.pdf"`);
        doc.pipe(res);
        
        drawOfficialBorder(doc);
        const afterHeaderY = drawDepEdHeader(doc);
        doc.y = afterHeaderY;
        
        // Title
        doc.font('Times-Bold').fontSize(18)
           .text('CERTIFICATE OF GOOD MORAL CHARACTER', { align: 'center', underline: true })
           .moveDown(2);
        
        // Reference
        doc.font('Times-Roman').fontSize(10)
           .text(`Reference No.: GMC-${student.LRN}-${new Date().getFullYear()}`, { align: 'right' })
           .moveDown(1.5);
        
        // Body
        doc.font('Times-Bold').fontSize(12)
           .text('TO WHOM IT MAY CONCERN:', { align: 'left' })
           .moveDown();
        
        const fullName = `${student.lastname}, ${student.firstname} ${student.middlename || ''}`.trim().toUpperCase();
        const pronoun = student.sex?.toLowerCase() === 'male' ? 'He' : 'She';
        const possessive = student.sex?.toLowerCase() === 'male' ? 'his' : 'her';
        
        doc.font('Times-Roman').fontSize(12)
           .text(`This is to certify that `, { continued: true })
           .font('Times-Bold')
           .text(fullName, { continued: true })
           .font('Times-Roman')
           .text(`, Learner Reference Number `, { continued: true })
           .font('Times-Bold')
           .text(student.LRN, { continued: true })
           .font('Times-Roman')
           .text(`, is a bona fide student of Southville 8B Senior High School.`, { align: 'justify' })
           .moveDown();
        
        doc.text(`Based on the records of the Guidance Office and certification from the class adviser, `, { continued: true })
           .font('Times-Bold')
           .text(fullName, { continued: true })
           .font('Times-Roman')
           .text(` has consistently demonstrated good moral character and proper conduct during ${possessive} entire stay in this institution.`, { align: 'justify' })
           .moveDown();
        
        doc.text(`${pronoun} has not been subjected to any disciplinary action and has complied with all school rules and regulations.`, { align: 'justify' })
           .moveDown();
        
        doc.text(`This certification is issued upon the request of the student for `, { continued: true })
           .font('Times-Bold')
           .text(`${student.enrollment_type === 'college' ? 'college admission purposes' : 'employment/reference purposes'}.`, { align: 'justify' })
           .moveDown(2);
        
        doc.text(`Issued this `, { continued: true })
           .font('Times-Bold')
           .text(new Date().toLocaleDateString('en-PH', { 
               year: 'numeric', 
               month: 'long', 
               day: 'numeric' 
           }), { continued: true })
           .font('Times-Roman')
           .text(` at Southville 8B Senior High School, Rodriguez, Rizal.`)
           .moveDown(4);
        
        // Dual signatures
        const signatureY = doc.y;
        
        // Guidance Counselor (Left)
        doc.moveTo(80, signatureY + 10)
           .lineTo(230, signatureY + 10)
           .stroke();
        
        doc.font('Times-Bold').fontSize(12)
           .text('JOPHYLYNE S. LUCENA', 80, signatureY + 15, { width: 150, align: 'center' });
        
        doc.font('Times-Roman').fontSize(10)
           .text('Guidance Coordinator', 80, signatureY + 30, { width: 150, align: 'center' });
        
        // School Head (Right)
        doc.moveTo(330, signatureY + 10)
           .lineTo(480, signatureY + 10)
           .stroke();
        
        doc.font('Times-Bold').fontSize(12)
           .text('ENGR. ROCHELLE Z. VALDULLA', 330, signatureY + 15, { width: 150, align: 'center' });
        
        doc.font('Times-Roman').fontSize(10)
           .text('School Head', 330, signatureY + 30, { width: 150, align: 'center' });
        
        doc.moveDown(3);
        
        // School seal text
        doc.font('Times-Italic').fontSize(9)
           .text('(Valid only with the official school seal and dry seal)', { align: 'center' })
           .moveDown(2);
        
        addDocumentControl(doc, 'GMC', student.LRN);
        
        // Footer
        doc.font('Times-Roman').fontSize(8)
           .text('Issued in accordance with DepEd Order No. 40, s. 2012 (Child Protection Policy)', 
           50, doc.page.height - 60, { width: doc.page.width - 100, align: 'center' });
        
        doc.end();
    } catch (error) {
        console.error('Error generating good moral certificate:', error);
        res.status(500).json({ message: 'Error generating document' });
    }
});

// =================== FORM 137 / SF10 (PERMANENT RECORD) ===================
router.get('/generate/form137/:lrn', verifyAdmin, async (req, res) => {
    try {
        const student = await getCompleteStudentData(req.params.lrn);
        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }

        const doc = new PDFDocument({ 
            margin: 40, 
            size: 'Legal',
            info: {
                Title: 'Learners Permanent Academic Record (SF10)',
                Author: 'Southville 8B Senior High School',
                Subject: 'Academic Record',
                Keywords: 'Form 137, SF10, permanent record, transcript'
            }
        });
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="SF10_${student.LRN}_${new Date().getFullYear()}.pdf"`);
        doc.pipe(res);
        
        // Official border for legal size
        doc.rect(30, 30, doc.page.width - 60, doc.page.height - 60)
           .lineWidth(2)
           .strokeColor('#003366')
           .stroke();
        
        // Header
        const logoY = 40;
        drawOfficialLogo(doc, 'left', logoY);
        drawOfficialLogo(doc, 'right', logoY);
        
        doc.font('Times-Bold').fontSize(14)
           .text('Republic of the Philippines', { align: 'center' })
           .moveDown(0.2);
        
        doc.font('Times-Bold').fontSize(16)
           .text('Department of Education', { align: 'center' })
           .moveDown(0.5);
        
        doc.font('Times-Bold').fontSize(18)
           .text('LEARNER\'S PERMANENT ACADEMIC RECORD', { align: 'center' })
           .moveDown(0.2);
        
        doc.font('Times-Roman').fontSize(12)
           .text('(Formerly Form 137)', { align: 'center' })
           .moveDown(1);
        
        doc.font('Times-Bold').fontSize(20)
           .text('SOUTHVILLE 8B SENIOR HIGH SCHOOL', { align: 'center' })
           .moveDown(0.2);
        
        doc.font('Times-Roman').fontSize(11)
           .text('San Isidro, Rodriguez, Rizal • School ID: 342567', { align: 'center' })
           .moveDown(2);
        
        // Learner's Information Box
        const infoBoxY = doc.y;
        doc.rect(40, infoBoxY, doc.page.width - 80, 80).stroke();
        
        doc.font('Times-Bold').fontSize(12)
           .text('LEARNER\'S INFORMATION', 45, infoBoxY - 15);
        
        // Column 1
        doc.font('Times-Bold').fontSize(10);
        doc.text('Name:', 45, infoBoxY + 10);
        doc.text('LRN:', 45, infoBoxY + 25);
        doc.text('Date of Birth:', 45, infoBoxY + 40);
        
        doc.font('Times-Roman').fontSize(10);
        const fullName = `${student.lastname}, ${student.firstname} ${student.middlename || ''}`.toUpperCase();
        doc.text(fullName, 90, infoBoxY + 10);
        doc.text(student.LRN, 90, infoBoxY + 25);
        doc.text(student.birthdate ? new Date(student.birthdate).toLocaleDateString('en-PH') : 'N/A', 120, infoBoxY + 40);
        
        // Column 2
        doc.font('Times-Bold').fontSize(10);
        doc.text('Sex:', 280, infoBoxY + 10);
        doc.text('Age:', 280, infoBoxY + 25);
        doc.text('Address:', 280, infoBoxY + 40);
        
        doc.font('Times-Roman').fontSize(10);
        doc.text(student.sex || 'N/A', 310, infoBoxY + 10);
        doc.text(student.age || 'N/A', 310, infoBoxY + 25);
        doc.text(student.address || 'N/A', 330, infoBoxY + 40);
        
        doc.moveDown(5);
        
        // Academic Information
        doc.font('Times-Bold').fontSize(14)
           .text('SENIOR HIGH SCHOOL ACADEMIC RECORD', { align: 'center' })
           .moveDown(0.5);
        
        const schoolYear = student.school_year || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;
        const semester = student.semester || 'First Semester';
        
        doc.font('Times-Roman').fontSize(11)
           .text(`School Year: ${schoolYear} • Semester: ${semester} • Track: ${student.track || 'Academic'} • Strand: ${student.strand || 'General Academic'}`, 
           { align: 'center' })
           .moveDown(1.5);
        
        // Grades Table Header
        const tableTop = doc.y;
        doc.rect(40, tableTop, doc.page.width - 80, 25).fill('#003366').stroke();
        
        doc.font('Times-Bold').fontSize(11).fillColor('white');
        doc.text('SUBJECTS', 45, tableTop + 8);
        doc.text('1st Quarter', 320, tableTop + 8, { width: 70, align: 'center' });
        doc.text('2nd Quarter', 395, tableTop + 8, { width: 70, align: 'center' });
        doc.text('Final Grade', 470, tableTop + 8, { width: 70, align: 'center' });
        doc.text('Remarks', 545, tableTop + 8, { width: 70, align: 'center' });
        
        doc.fillColor('black');
        
        // Sample subjects data (in production, fetch from database)
        const subjects = [
            { code: 'CORE 01', name: 'Oral Communication', q1: '88', q2: '90', final: '89', remarks: 'PASSED' },
            { code: 'CORE 02', name: 'Komunikasyon sa Pananaliksik', q1: '85', q2: '87', final: '86', remarks: 'PASSED' },
            { code: 'CORE 03', name: 'General Mathematics', q1: '83', q2: '85', final: '84', remarks: 'PASSED' },
            { code: 'CORE 04', name: 'Earth and Life Science', q1: '91', q2: '92', final: '91.5', remarks: 'PASSED' },
            { code: 'APPLIED 01', name: 'Empowerment Technologies', q1: '89', q2: '91', final: '90', remarks: 'PASSED' },
            { code: 'SPEC 01', name: 'Pre-Calculus', q1: '80', q2: '82', final: '81', remarks: 'PASSED' },
            { code: 'SPEC 02', name: 'Basic Calculus', q1: '78', q2: '80', final: '79', remarks: 'PASSED' },
        ];
        
        let currentY = tableTop + 30;
        
        subjects.forEach((subject, index) => {
            // Alternating row background
            if (index % 2 === 0) {
                doc.rect(40, currentY - 5, doc.page.width - 80, 20).fill('#f0f8ff').stroke();
            }
            
            doc.font('Times-Roman').fontSize(9);
            doc.text(`${subject.code}: ${subject.name}`, 45, currentY);
            doc.text(subject.q1, 320, currentY, { width: 70, align: 'center' });
            doc.text(subject.q2, 395, currentY, { width: 70, align: 'center' });
            doc.text(subject.final, 470, currentY, { width: 70, align: 'center' });
            doc.text(subject.remarks, 545, currentY, { width: 70, align: 'center' });
            
            currentY += 20;
        });
        
        // Total row
        doc.rect(40, currentY - 5, doc.page.width - 80, 25).fill('#e6f0ff').stroke();
        doc.font('Times-Bold').fontSize(10)
           .text('GENERAL AVERAGE:', 45, currentY + 5)
           .text('89.0', 470, currentY + 5, { width: 70, align: 'center' })
           .text('PASSED', 545, currentY + 5, { width: 70, align: 'center' });
        
        doc.moveDown(3);
        
        // Signatures section
        const signatureY = doc.y;
        
        // Class Adviser
        doc.moveTo(60, signatureY + 15)
           .lineTo(210, signatureY + 15)
           .stroke();
        
        doc.font('Times-Bold').fontSize(11)
           .text('JUANA DELA CRUZ', 60, signatureY + 20, { width: 150, align: 'center' });
        doc.font('Times-Roman').fontSize(9)
           .text('Class Adviser', 60, signatureY + 33, { width: 150, align: 'center' });
        
        // School Registrar
        doc.moveTo(250, signatureY + 15)
           .lineTo(400, signatureY + 15)
           .stroke();
        
        doc.font('Times-Bold').fontSize(11)
           .text('DARYL F. BALBINO', 250, signatureY + 20, { width: 150, align: 'center' });
        doc.font('Times-Roman').fontSize(9)
           .text('School Registrar II', 250, signatureY + 33, { width: 150, align: 'center' });
        
        // School Head
        doc.moveTo(440, signatureY + 15)
           .lineTo(590, signatureY + 15)
           .stroke();
        
        doc.font('Times-Bold').fontSize(11)
           .text('ENGR. ROCHELLE Z. VALDULLA', 440, signatureY + 20, { width: 150, align: 'center' });
        doc.font('Times-Roman').fontSize(9)
           .text('School Head', 440, signatureY + 33, { width: 150, align: 'center' });
        
        // Document control
        addDocumentControl(doc, 'SF10', student.LRN);
        
        // Confidential footer
        doc.font('Times-Roman').fontSize(8)
           .text('CONFIDENTIAL • For official use only • Issued pursuant to DepEd Order No. 11, s. 2018', 
           40, doc.page.height - 40, { width: doc.page.width - 80, align: 'center' });
        
        doc.end();
    } catch (error) {
        console.error('Error generating Form 137:', error);
        res.status(500).json({ message: 'Error generating document' });
    }
});

// =================== SENIOR HIGH SCHOOL DIPLOMA ===================
router.get('/generate/diploma/:lrn', verifyAdmin, async (req, res) => {
    try {
        const student = await getCompleteStudentData(req.params.lrn);
        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }

        const doc = new PDFDocument({ 
            layout: 'landscape',
            size: 'A4',
            margin: 50,
            info: {
                Title: 'Senior High School Diploma',
                Author: 'Southville 8B Senior High School',
                Subject: 'Graduation Diploma',
                Keywords: 'diploma, graduation, SHS, DepEd'
            }
        });
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="Diploma_${student.LRN}_${new Date().getFullYear()}.pdf"`);
        doc.pipe(res);
        
        // Fancy border
        doc.rect(20, 20, doc.page.width - 40, doc.page.height - 40)
           .lineWidth(5)
           .strokeColor('#003366')
           .stroke();
        
        doc.rect(30, 30, doc.page.width - 60, doc.page.height - 60)
           .lineWidth(1)
           .strokeColor('#666666')
           .stroke();
        
        // Official header
        doc.font('Times-Bold').fontSize(16)
           .text('Republic of the Philippines', { align: 'center' })
           .moveDown(0.5);
        
        doc.font('Times-Bold').fontSize(18)
           .text('Department of Education', { align: 'center' })
           .moveDown(0.5);
        
        doc.font('Times-Roman').fontSize(14)
           .text('Region IV-A (CALABARZON)', { align: 'center' })
           .moveDown(0.5);
        
        doc.font('Times-Bold').fontSize(16)
           .text('Schools Division of Rizal', { align: 'center' })
           .moveDown(1);
        
        // School name with decorative underline
        doc.font('Times-Bold').fontSize(28)
           .text('SOUTHVILLE 8B SENIOR HIGH SCHOOL', { align: 'center' })
           .moveDown(0.3);
        
        doc.moveTo(doc.page.width / 2 - 150, doc.y)
           .lineTo(doc.page.width / 2 + 150, doc.y)
           .lineWidth(1)
           .strokeColor('#003366')
           .stroke();
        
        doc.moveDown(0.5);
        doc.font('Times-Roman').fontSize(12)
           .text('San Isidro, Rodriguez, Rizal', { align: 'center' })
           .moveDown(2);
        
        // Diploma title
        doc.font('Times-Bold').fontSize(36)
           .text('D I P L O M A', { align: 'center' })
           .moveDown(2);
        
        // Certificate text
        doc.font('Times-Roman').fontSize(16)
           .text('This certifies that', { align: 'center' })
           .moveDown(1);
        
        // Student name with decorative underline
        const fullName = `${student.firstname} ${student.middlename || ''} ${student.lastname}`.trim().toUpperCase();
        doc.font('Times-Bold').fontSize(28)
           .text(fullName, { align: 'center' })
           .moveDown(0.5);
        
        doc.moveTo(doc.page.width / 2 - 200, doc.y)
           .lineTo(doc.page.width / 2 + 200, doc.y)
           .lineWidth(2)
           .strokeColor('#003366')
           .stroke();
        
        doc.moveDown(1.5);
        
        doc.font('Times-Roman').fontSize(14)
           .text('has satisfactorily completed the prescribed Senior High School curriculum', { align: 'center' })
           .moveDown(0.5);
        
        doc.text('in accordance with the requirements of the Department of Education', { align: 'center' })
           .moveDown(0.5);
        
        const strand = student.strand || 'Academic Track';
        doc.font('Times-Bold').fontSize(16)
           .text(`under the ${strand} Strand`, { align: 'center' })
           .moveDown(2);
        
        doc.font('Times-Roman').fontSize(16)
           .text('and is therefore awarded this', { align: 'center' })
           .moveDown(0.5);
        
        doc.font('Times-Bold').fontSize(24)
           .text('DIPLOMA', { align: 'center' })
           .moveDown(2);
        
        // Date and place
        doc.font('Times-Roman').fontSize(14)
           .text(`Given this ${new Date().toLocaleDateString('en-PH', { 
               year: 'numeric', 
               month: 'long', 
               day: 'numeric' 
           })} at Rodriguez, Rizal, Philippines.`, { align: 'center' })
           .moveDown(4);
        
        // Signatures
        const signatureY = doc.y;
        
        // School Head (Left)
        doc.moveTo(100, signatureY + 15)
           .lineTo(300, signatureY + 15)
           .stroke();
        
        doc.font('Times-Bold').fontSize(14)
           .text('ENGR. ROCHELLE Z. VALDULLA', 100, signatureY + 20, { width: 200, align: 'center' });
        doc.font('Times-Roman').fontSize(11)
           .text('School Head', 100, signatureY + 36, { width: 200, align: 'center' });
        
        // Schools Division Superintendent (Right)
        doc.moveTo(400, signatureY + 15)
           .lineTo(600, signatureY + 15)
           .stroke();
        
        doc.font('Times-Bold').fontSize(14)
           .text('DR. ROBERTO G. GARCIA', 400, signatureY + 20, { width: 200, align: 'center' });
        doc.font('Times-Roman').fontSize(11)
           .text('Schools Division Superintendent', 400, signatureY + 36, { width: 200, align: 'center' });
        
        // Diploma number
        doc.moveDown(3);
        doc.font('Times-Bold').fontSize(12)
           .text(`Diploma No.: DPL-${student.LRN}-${new Date().getFullYear()}`, { align: 'center' })
           .moveDown(0.5);
        
        doc.font('Times-Italic').fontSize(10)
           .text('(Valid only with the official school seal and dry seal)', { align: 'center' })
           .moveDown(2);
        
        // Footer
        doc.font('Times-Roman').fontSize(9)
           .text('Issued pursuant to DepEd Order No. 30, s. 2017 (Senior High School Program)', 
           50, doc.page.height - 50, { width: doc.page.width - 100, align: 'center' });
        
        doc.end();
    } catch (error) {
        console.error('Error generating diploma:', error);
        res.status(500).json({ message: 'Error generating document' });
    }
});

// =================== GENERAL CERTIFICATION ===================
router.get('/generate/certification/:lrn', verifyAdmin, async (req, res) => {
    try {
        const student = await getCompleteStudentData(req.params.lrn);
        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }

        const doc = new PDFDocument({ 
            margin: 50,
            size: 'A4',
            info: {
                Title: 'General Certification',
                Author: 'Southville 8B Senior High School',
                Subject: 'Student Certification',
                Keywords: 'certification, certificate, student, DepEd'
            }
        });
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="Certification_${student.LRN}_${new Date().getFullYear()}.pdf"`);
        doc.pipe(res);
        
        drawOfficialBorder(doc);
        const afterHeaderY = drawDepEdHeader(doc);
        doc.y = afterHeaderY;
        
        // Date
        const currentDate = new Date().toLocaleDateString('en-PH', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        
        doc.font('Times-Roman').fontSize(11)
           .text(currentDate, { align: 'center' })
           .moveDown(3);
        
        // Title
        doc.font('Times-Bold').fontSize(24)
           .text('CERTIFICATION', { align: 'center' })
           .moveDown(3);
        
        // Body
        doc.font('Times-Roman').fontSize(12)
           .text('TO WHOM IT MAY CONCERN:', { align: 'center' })
           .moveDown(2);
        
        const fullName = `${student.lastname}, ${student.firstname} ${student.middlename || ''}`.trim().toUpperCase();
        
        doc.font('Times-Roman').fontSize(12)
           .text('This is to certify that', { align: 'center' })
           .moveDown(1);
        
        doc.font('Times-Bold').fontSize(14)
           .text(fullName, { align: 'center' })
           .moveDown(1);
        
        doc.font('Times-Roman').fontSize(12)
           .text('is a bona fide student of Southville 8B Senior High School,', { align: 'center' })
           .moveDown(0.5);
        
        const gradeLevel = student.grade_level || 'Grade 11';
        const strand = student.strand || '';
        const schoolYear = student.school_year || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;
        
        if (strand) {
            doc.text(`currently enrolled in ${gradeLevel} under the ${strand} strand`, { align: 'center' })
               .moveDown(0.5);
        } else {
            doc.text(`currently enrolled in ${gradeLevel}`, { align: 'center' })
               .moveDown(0.5);
        }
        
        doc.text(`for the School Year ${schoolYear}.`, { align: 'center' })
           .moveDown(2);
        
        doc.text('This certification is issued upon the request of the above-named student', { align: 'center' })
           .moveDown(0.5);
        
        doc.text('for whatever legal purpose it may serve.', { align: 'center' })
           .moveDown(2);
        
        doc.text('Given this date, affixed with the school seal and signature below.', { align: 'center' })
           .moveDown(4);
        
        // Signature
        addOfficialSignature(doc, 'ENGR. ROCHELLE Z. VALDULLA', 'School Head', true);
        
        // Document control
        addDocumentControl(doc, 'CERT', student.LRN);
        
        // Footer
        doc.font('Times-Roman').fontSize(8)
           .text('This document is issued free of charge for the first copy pursuant to DepEd Order No. 23, s. 2015', 
           50, doc.page.height - 60, { width: doc.page.width - 100, align: 'center' });
        
        doc.text('SOUTHVILLE 8B SENIOR HIGH SCHOOL • SAN ISIDRO, RODRIGUEZ, RIZAL • Tel: (02) 8551-1982', 
           50, doc.page.height - 45, { width: doc.page.width - 100, align: 'center' });
        
        doc.end();
    } catch (error) {
        console.error('Error generating certification:', error);
        res.status(500).json({ message: 'Error generating document' });
    }
});

export default router;
