import express from 'express';
import PDFDocument from 'pdfkit';
import db from "../models/db.js";
import { verifyAdmin } from '../middleware/auth.js';
import fs from 'fs';
import path from 'path';

const router = express.Router();

// Helper function to draw logos
async function drawLogo(doc, side, yPosition, size = 60) {
    try {
        const logoPath = path.join(process.cwd(), 'public', 'images', 'logo.png');
        if (fs.existsSync(logoPath)) {
            if (side === 'left') {
                doc.image(logoPath, 50, yPosition, { width: size, height: size });
            } else {
                doc.image(logoPath, doc.page.width - (50 + size), yPosition, { width: size, height: size });
            }
        } else {
            // Fallback: Draw a simple logo placeholder
            if (side === 'left') {
                doc.rect(50, yPosition, size, size).stroke();
                doc.fontSize(8).text('SCHOOL', 55, yPosition + 15, { width: size - 10, align: 'center' });
                doc.text('LOGO', 55, yPosition + 30, { width: size - 10, align: 'center' });
            } else {
                doc.rect(doc.page.width - (50 + size), yPosition, size, size).stroke();
                doc.fontSize(8).text('SCHOOL', doc.page.width - (50 + size) + 5, yPosition + 15, { width: size - 10, align: 'center' });
                doc.text('LOGO', doc.page.width - (50 + size) + 5, yPosition + 30, { width: size - 10, align: 'center' });
            }
        }
    } catch (error) {
        console.error('Error drawing logo:', error);
    }
}

// Helper function for formal school header - FIXED VERSION
function drawSchoolHeader(doc, yStart = 40) {
    // Draw logos - smaller size to avoid overlapping text
    drawLogo(doc, 'left', yStart, 50);
    drawLogo(doc, 'right', yStart, 50);
    
    const pageCenter = doc.page.width / 2;
    const textWidth = 400; // Reduced width to prevent overflow
    
    // Calculate positions carefully to avoid overlap
    let currentY = yStart + 5; // Start a bit lower
    
    // Republic of the Philippines
    doc.font('Times-Bold').fontSize(11)
       .text('Republic of the Philippines', pageCenter, currentY, { align: 'center', width: textWidth });
    
    currentY += 14;
    
    // Department of Education
    doc.font('Times-Bold').fontSize(13)
       .text('Department of Education', pageCenter, currentY, { align: 'center', width: textWidth });
    
    currentY += 18;
    
    // Region
    doc.font('Times-Roman').fontSize(10)
       .text('Region IV-A CALABARZON', pageCenter, currentY, { align: 'center', width: textWidth });
    
    currentY += 14;
    
    // Schools Division
    doc.font('Times-Bold').fontSize(10)
       .text('SCHOOLS DIVISION OF RIZAL', pageCenter, currentY, { align: 'center', width: textWidth });
    
    currentY += 14;
    
    // District
    doc.font('Times-Roman').fontSize(10)
       .text('RODRIGUEZ DISTRICT', pageCenter, currentY, { align: 'center', width: textWidth });
    
    currentY += 18;
    
    // School name - FIXED: Proper line wrapping
    doc.font('Times-Bold').fontSize(18)
       .text('SOUTHVILLE 8B SENIOR HIGH SCHOOL', pageCenter, currentY, { align: 'center', width: textWidth });
    
    currentY += 18;
    
    // Location
    doc.font('Times-Roman').fontSize(10)
       .text('San Isidro, Rodriguez, Rizal', pageCenter, currentY, { align: 'center', width: textWidth });
    
    currentY += 14;
    
    // Contact info - FIXED: Complete telephone number
    doc.font('Times-Roman').fontSize(9)
       .text('Email: 342567@deped.gov.ph • Telephone: (02) 8551-1982', pageCenter, currentY, { align: 'center', width: textWidth });
    
    currentY += 20;
    
    // Decorative line - positioned properly
    doc.moveTo(50, currentY)
       .lineTo(doc.page.width - 50, currentY)
       .lineWidth(0.5)
       .stroke();
    
    doc.y = currentY + 20;
    
    return doc.y;
}

// Helper function for Form 137 header
function drawForm137Header(doc, yStart = 30) {
    // Draw logos
    drawLogo(doc, 'left', yStart + 10, 50);
    drawLogo(doc, 'right', yStart + 10, 50);
    
    const pageCenter = doc.page.width / 2;
    const textWidth = 400;
    let currentY = yStart;
    
    // Republic of the Philippines
    doc.font('Times-Bold').fontSize(11)
       .text('Republic of the Philippines', pageCenter, currentY, { align: 'center', width: textWidth });
    
    currentY += 14;
    
    // Department of Education
    doc.font('Times-Bold').fontSize(13)
       .text('Department of Education', pageCenter, currentY, { align: 'center', width: textWidth });
    
    currentY += 20;
    
    // LEARNER'S PERMANENT ACADEMIC RECORD - FIXED: Proper line breaks
    doc.font('Times-Bold').fontSize(14)
       .text('LEARNER\'S PERMANENT ACADEMIC RECORD', pageCenter, currentY, { align: 'center', width: textWidth });
    
    currentY += 16;
    
    // (Formerly Form 137)
    doc.font('Times-Roman').fontSize(9)
       .text('(Formerly Form 137)', pageCenter, currentY, { align: 'center', width: textWidth });
    
    currentY += 20;
    
    // School name - TWO LINES LIKE IN IMAGE
    doc.font('Times-Bold').fontSize(16)
       .text('SOUTHVILLE 8B SENIOR HIGH SCHOOL', pageCenter, currentY, { align: 'center', width: textWidth });
    
    currentY += 16;
    
    // Location
    doc.font('Times-Roman').fontSize(9)
       .text('San Isidro, Rodriguez, Rizal', pageCenter, currentY, { align: 'center', width: textWidth });
    
    return currentY + 25;
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

// Helper function to add text with proper word wrapping
function addWrappedText(doc, text, options = {}) {
    const defaults = {
        fontSize: 12,
        lineGap: 5,
        align: 'left',
        font: 'Times-Roman',
        boldParts: [],
        width: doc.page.width - 100
    };
    
    const settings = { ...defaults, ...options };
    doc.font(settings.font).fontSize(settings.fontSize);
    
    // Handle bold parts in text
    if (settings.boldParts.length > 0) {
        let remainingText = text;
        let position = 0;
        
        // Sort bold parts by position
        const sortedBoldParts = [...settings.boldParts].sort((a, b) => a.position - b.position);
        
        for (const boldPart of sortedBoldParts) {
            // Text before bold part
            const beforeText = remainingText.substring(0, boldPart.position - position);
            if (beforeText) {
                doc.text(beforeText, { 
                    width: settings.width,
                    align: settings.align,
                    continued: true 
                });
            }
            
            // Bold text
            doc.font('Times-Bold')
               .text(boldPart.text, {
                   width: settings.width,
                   align: settings.align,
                   continued: true
               })
               .font(settings.font);
            
            position += beforeText.length + boldPart.text.length;
            remainingText = remainingText.substring(boldPart.position - position + boldPart.text.length);
        }
        
        // Remaining text after last bold part
        if (remainingText) {
            doc.text(remainingText, {
                width: settings.width,
                align: settings.align
            });
        }
    } else {
        doc.text(text, {
            width: settings.width,
            align: settings.align
        });
    }
    
    doc.moveDown(settings.lineGap / 10);
    return doc;
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
        
        // Certificate title - FIXED: Proper spacing and no text cutoff
        doc.moveDown(0.5);
        doc.font('Times-Bold').fontSize(20) // Reduced from 22 to prevent cutoff
           .text('CERTIFICATE OF GOOD MORAL CHARACTER', { 
               align: 'center',
               width: doc.page.width - 100 // Ensure it fits
            })
           .moveDown(1.5);
        
        // Reference number and date
        doc.font('Times-Roman').fontSize(10)
           .text(`Reference No.: GMC-${student.LRN}-${new Date().getFullYear()}`, { align: 'right' })
           .moveDown(0.2);
        
        const currentDate = formatDate(new Date());
        doc.font('Times-Roman').fontSize(10)
           .text(`Date Issued: ${currentDate}`, { align: 'right' })
           .moveDown(2);
        
        // Addressee
        doc.font('Times-Bold').fontSize(12)
           .text('TO WHOM IT MAY CONCERN:', { align: 'left' })
           .moveDown(1);
        
        // Body text with proper word wrapping
        const fullName = `${student.lastname || ''}, ${student.firstname || ''} ${student.middlename ? student.middlename.charAt(0) + '.' : ''}`.trim();
        const pronoun = student.sex?.toLowerCase() === 'male' ? 'He' : 'She';
        const possessive = student.sex?.toLowerCase() === 'male' ? 'his' : 'her';
        
        // Paragraph 1
        const para1 = `This is to certify that ${fullName.toUpperCase()}, bearing Learner Reference Number ${student.LRN}, is a bona fide student of Southville 8B Senior High School.`;
        
        // Paragraph 2
        const yearLevel = student.enrolled_year_level || student.yearlevel || 'Grade 11';
        const strand = student.enrolled_strand || student.strand || 'ACAD - HUMSS';
        const schoolYear = student.school_year || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;
        const para2 = `${pronoun} is currently enrolled in ${yearLevel} under the ${strand} strand for the School Year ${schoolYear}.`;
        
        // Paragraph 3
        const para3 = `Based on official school records and as certified by the Guidance and Counseling Office, ${fullName.toUpperCase()} has exhibited good moral character during ${possessive} entire stay in this institution. ${pronoun} has not been subjected to any disciplinary action and has consistently demonstrated proper conduct, behavior, and adherence to school rules and regulations.`;
        
        // Paragraph 4
        const para4 = `${pronoun} is known to be courteous, responsible, and respectful, maintaining good relationships with peers, teachers, and school personnel.`;
        
        // Paragraph 5
        const para5 = `This certification is issued upon the request of ${student.firstname.toLowerCase()} ${student.lastname.toLowerCase()} for whatever legal purpose it may serve.`;
        
        // Add all paragraphs with proper spacing
        doc.font('Times-Roman').fontSize(12)
           .text(para1, {
               width: doc.page.width - 100,
               align: 'justify'
           })
           .moveDown(1);
        
        doc.text(para2, {
            width: doc.page.width - 100,
            align: 'justify'
        })
        .moveDown(1);
        
        doc.text(para3, {
            width: doc.page.width - 100,
            align: 'justify'
        })
        .moveDown(1);
        
        doc.text(para4, {
            width: doc.page.width - 100,
            align: 'justify'
        })
        .moveDown(1);
        
        doc.text(para5, {
            width: doc.page.width - 100,
            align: 'justify'
        })
        .moveDown(3);
        
        // Issuance paragraph
        doc.text(`Issued this ${currentDate} at Southville 8B Senior High School, Rodriguez, Rizal.`, {
            width: doc.page.width - 100,
            align: 'justify'
        })
        .moveDown(4);
        
        // Signatures - SIDE BY SIDE with proper positioning
        const signatureY = doc.y;
        const signatureWidth = 150;
        const gap = 80;
        
        // Calculate positions to center both signatures
        const totalWidth = (signatureWidth * 2) + gap;
        const startX = (doc.page.width - totalWidth) / 2;
        
        // Guidance Counselor (LEFT)
        doc.moveTo(startX, signatureY + 15)
           .lineTo(startX + signatureWidth, signatureY + 15)
           .stroke();
        
        doc.font('Times-Bold').fontSize(12)
           .text('JOPHYLYNE S. LUCENA', startX, signatureY + 20, { 
               width: signatureWidth, 
               align: 'center' 
           });
        
        doc.font('Times-Roman').fontSize(10)
           .text('Guidance Counselor', startX, signatureY + 35, { 
               width: signatureWidth, 
               align: 'center' 
           });
        
        // School Head (RIGHT)
        doc.moveTo(startX + signatureWidth + gap, signatureY + 15)
           .lineTo(startX + signatureWidth + gap + signatureWidth, signatureY + 15)
           .stroke();
        
        doc.font('Times-Bold').fontSize(12)
           .text('ENGR. ROCHELLE Z. VALDULLA', startX + signatureWidth + gap, signatureY + 20, { 
               width: signatureWidth, 
               align: 'center' 
           });
        
        doc.font('Times-Roman').fontSize(10)
           .text('School Head', startX + signatureWidth + gap, signatureY + 35, { 
               width: signatureWidth, 
               align: 'center' 
           });
        
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
        
        // Certificate title
        doc.moveDown(0.5);
        doc.font('Times-Bold').fontSize(20)
           .text('CERTIFICATE OF ENROLLMENT', { 
               align: 'center',
               width: doc.page.width - 100
            })
           .moveDown(1.5);
        
        // Reference number and date
        doc.font('Times-Roman').fontSize(10)
           .text(`Reference No.: COE-${student.LRN}-${new Date().getFullYear()}`, { align: 'right' })
           .moveDown(0.2);
        
        const currentDate = formatDate(new Date());
        doc.font('Times-Roman').fontSize(10)
           .text(`Date Issued: ${currentDate}`, { align: 'right' })
           .moveDown(2);
        
        // Addressee
        doc.font('Times-Bold').fontSize(12)
           .text('TO WHOM IT MAY CONCERN:', { align: 'left' })
           .moveDown(1);
        
        // Body text
        const fullName = `${student.lastname || ''}, ${student.firstname || ''} ${student.middlename ? student.middlename.charAt(0) + '.' : ''}`.trim();
        
        // Paragraph 1
        const para1 = `This is to certify that ${fullName.toUpperCase()}, bearing Learner Reference Number (LRN) ${student.LRN}, is a bona fide student of Southville 8B Senior High School, located at San Isidro, Rodriguez, Rizal.`;
        
        // Paragraph 2
        const yearLevel = student.enrolled_year_level || student.yearlevel || 'Grade 11';
        const strand = student.enrolled_strand || student.strand || 'ACAD - HUMSS';
        const schoolYear = student.school_year || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;
        const para2 = `The aforementioned student is currently enrolled as a ${yearLevel} student under the ${strand} strand for the School Year ${schoolYear}.`;
        
        // Paragraph 3
        const enrollmentType = student.enrollment_type || 'scholarship';
        const purpose = enrollmentType === 'transfer' ? 'transfer to another institution' : 'scholarship application';
        const para3 = `This certification is issued upon the request of ${student.firstname.toLowerCase()} ${student.lastname.toLowerCase()} for whatever legal purpose it may serve, particularly for ${purpose}.`;
        
        // Paragraph 4
        const para4 = `Issued this ${currentDate} at the office of the School Registrar, Southville 8B Senior High School, Rodriguez, Rizal.`;
        
        // Add all paragraphs
        doc.font('Times-Roman').fontSize(12)
           .text(para1, {
               width: doc.page.width - 100,
               align: 'justify'
           })
           .moveDown(1);
        
        doc.text(para2, {
            width: doc.page.width - 100,
            align: 'justify'
        })
        .moveDown(1);
        
        doc.text(para3, {
            width: doc.page.width - 100,
            align: 'justify'
        })
        .moveDown(1.5);
        
        doc.text(para4, {
            width: doc.page.width - 100,
            align: 'justify'
        })
        .moveDown(4);
        
        // Single centered signature
        const signatureY = doc.y;
        const signatureWidth = 200;
        const signatureX = (doc.page.width - signatureWidth) / 2;
        
        // Signature line
        doc.moveTo(signatureX, signatureY + 10)
           .lineTo(signatureX + signatureWidth, signatureY + 10)
           .stroke();
        
        // Name
        doc.font('Times-Bold').fontSize(12)
           .text('DARYL F. BALBINO', signatureX, signatureY + 15, { 
               width: signatureWidth, 
               align: 'center' 
           });
        
        // Title
        doc.font('Times-Roman').fontSize(10)
           .text('School Registrar', signatureX, signatureY + 30, { 
               width: signatureWidth, 
               align: 'center' 
           });
        
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
            margin: 40, 
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
        const afterHeaderY = drawForm137Header(doc, 40);
        
        // LEARNER'S INFORMATION box
        const infoBoxY = afterHeaderY;
        const infoBoxWidth = 520;
        
        // Box border
        doc.rect(40, infoBoxY, infoBoxWidth, 110).stroke();
        
        // Title background
        doc.rect(40, infoBoxY - 15, infoBoxWidth, 15).fill('#f0f0f0').stroke();
        doc.font('Times-Bold').fontSize(12).fillColor('black')
           .text('LEARNER\'S INFORMATION', 45, infoBoxY - 12);
        
        // Draw table lines
        const cellHeight = 22;
        const labelWidth = 120;
        const valueWidth = infoBoxWidth - labelWidth;
        
        // Draw horizontal lines
        for (let i = 0; i <= 5; i++) {
            const y = infoBoxY + (i * cellHeight);
            doc.moveTo(40, y).lineTo(40 + infoBoxWidth, y).stroke();
        }
        
        // Draw vertical line
        doc.moveTo(40 + labelWidth, infoBoxY)
           .lineTo(40 + labelWidth, infoBoxY + (5 * cellHeight))
           .stroke();
        
        // Fill in information
        const fullName = `${student.lastname}, ${student.firstname} ${student.middlename || ''}`.toUpperCase();
        const strand = student.enrolled_strand || student.strand || 'ACAD - HUMSS';
        const birthDate = student.birthdate ? formatDate(student.birthdate) : 'Not Provided';
        
        // Labels
        doc.font('Times-Bold').fontSize(10);
        doc.text('Name:', 45, infoBoxY + 8);
        doc.text('LRN:', 45, infoBoxY + 8 + cellHeight);
        doc.text('Date of Birth:', 45, infoBoxY + 8 + (cellHeight * 2));
        doc.text('Sex:', 45, infoBoxY + 8 + (cellHeight * 3));
        doc.text('Address:', 45, infoBoxY + 8 + (cellHeight * 4));
        doc.text('Track/Strand:', 45, infoBoxY + 8 + (cellHeight * 5));
        
        // Values
        doc.font('Times-Roman').fontSize(10);
        doc.text(fullName, 40 + labelWidth + 5, infoBoxY + 8, { width: valueWidth - 10 });
        doc.text(student.LRN, 40 + labelWidth + 5, infoBoxY + 8 + cellHeight, { width: valueWidth - 10 });
        doc.text(birthDate, 40 + labelWidth + 5, infoBoxY + 8 + (cellHeight * 2), { width: valueWidth - 10 });
        doc.text(student.sex || 'Male', 40 + labelWidth + 5, infoBoxY + 8 + (cellHeight * 3), { width: valueWidth - 10 });
        doc.text(student.address || 'Not Provided', 40 + labelWidth + 5, infoBoxY + 8 + (cellHeight * 4), { width: valueWidth - 10 });
        doc.text(strand, 40 + labelWidth + 5, infoBoxY + 8 + (cellHeight * 5), { width: valueWidth - 10 });
        
        // SENIOR HIGH SCHOOL SCHOLASTIC RECORD title
        const scholasticY = infoBoxY + 130;
        doc.font('Times-Bold').fontSize(14)
           .text('SENIOR HIGH SCHOOL SCHOLASTIC RECORD', 40, scholasticY, { width: infoBoxWidth, align: 'center' });
        
        // School Year info
        const schoolYear = student.school_year || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;
        doc.font('Times-Roman').fontSize(10)
           .text(`School Year: ${schoolYear}`, 40, scholasticY + 20, { width: infoBoxWidth, align: 'center' });
        
        // Grades table
        const tableTop = scholasticY + 45;
        const colWidths = [240, 60, 60, 70, 60]; // Adjusted for better fit
        
        // Table header
        doc.rect(40, tableTop, infoBoxWidth, 25).fill('#002060').stroke();
        
        doc.font('Times-Bold').fontSize(10).fillColor('white');
        let currentX = 45;
        doc.text('SUBJECTS', currentX, tableTop + 8);
        
        currentX += colWidths[0];
        doc.text('MIDTERM', currentX, tableTop + 8, { width: colWidths[1], align: 'center' });
        
        currentX += colWidths[1];
        doc.text('FINALS', currentX, tableTop + 8, { width: colWidths[2], align: 'center' });
        
        currentX += colWidths[2];
        doc.text('FINAL GRADE', currentX, tableTop + 8, { width: colWidths[3], align: 'center' });
        
        currentX += colWidths[3];
        doc.text('REMARKS', currentX, tableTop + 8, { width: colWidths[4], align: 'center' });
        
        // Sample data
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
                doc.rect(40, currentY, infoBoxWidth, rowHeight).fill('#f9f9f9').stroke();
            } else {
                doc.rect(40, currentY, infoBoxWidth, rowHeight).fill('#ffffff').stroke();
            }
            
            // Calculate final grade
            const finalGrade = Math.round((parseInt(subject.midterm) + parseInt(subject.final)) / 2);
            const remarks = finalGrade >= 75 ? 'PASSED' : 'FAILED';
            
            // Fill cells
            doc.font('Times-Roman').fontSize(9).fillColor('black');
            currentX = 45;
            
            // Subject name - truncated if too long
            const subjectText = `${subject.code}: ${subject.name}`;
            const maxSubjectLength = 40;
            const displaySubject = subjectText.length > maxSubjectLength 
                ? subjectText.substring(0, maxSubjectLength) + '...' 
                : subjectText;
            
            doc.text(displaySubject, currentX, currentY + 8);
            
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
        doc.rect(40, currentY, infoBoxWidth, rowHeight).fill('#e6f0ff').stroke();
        
        // Calculate general average
        const totalGrades = subjects.reduce((sum, subject) => {
            return sum + Math.round((parseInt(subject.midterm) + parseInt(subject.final)) / 2);
        }, 0);
        const generalAverage = Math.round(totalGrades / subjects.length);
        const overallRemarks = generalAverage >= 75 ? 'PASSED' : 'FAILED';
        
        doc.font('Times-Bold').fontSize(10).fillColor('black');
        currentX = 45;
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
        const signatureSpacing = 40;
        
        // Calculate positions to center all three signatures
        const totalSignaturesWidth = (signatureWidth * 3) + (signatureSpacing * 2);
        const signaturesStartX = (doc.page.width - totalSignaturesWidth) / 2;
        
        // Class Adviser
        doc.moveTo(signaturesStartX, signaturesY + 15)
           .lineTo(signaturesStartX + signatureWidth, signaturesY + 15)
           .stroke();
        
        doc.font('Times-Bold').fontSize(10)
           .text('JUANA DELA CRUZ', signaturesStartX, signaturesY + 20, { width: signatureWidth, align: 'center' });
        
        doc.font('Times-Roman').fontSize(9)
           .text('Class Adviser', signaturesStartX, signaturesY + 32, { width: signatureWidth, align: 'center' });
        
        // School Registrar
        doc.moveTo(signaturesStartX + signatureWidth + signatureSpacing, signaturesY + 15)
           .lineTo(signaturesStartX + signatureWidth + signatureSpacing + signatureWidth, signaturesY + 15)
           .stroke();
        
        doc.font('Times-Bold').fontSize(10)
           .text('DARYL F. BALBINO', signaturesStartX + signatureWidth + signatureSpacing, signaturesY + 20, { width: signatureWidth, align: 'center' });
        
        doc.font('Times-Roman').fontSize(9)
           .text('School Registrar II', signaturesStartX + signatureWidth + signatureSpacing, signaturesY + 32, { width: signatureWidth, align: 'center' });
        
        // School Head
        doc.moveTo(signaturesStartX + (signatureWidth * 2) + (signatureSpacing * 2), signaturesY + 15)
           .lineTo(signaturesStartX + (signatureWidth * 2) + (signatureSpacing * 2) + signatureWidth, signaturesY + 15)
           .stroke();
        
        doc.font('Times-Bold').fontSize(10)
           .text('ENGR. ROCHELLE Z. VALDULLA', signaturesStartX + (signatureWidth * 2) + (signatureSpacing * 2), signaturesY + 20, { width: signatureWidth, align: 'center' });
        
        doc.font('Times-Roman').fontSize(9)
           .text('School Head', signaturesStartX + (signatureWidth * 2) + (signatureSpacing * 2), signaturesY + 32, { width: signatureWidth, align: 'center' });
        
        // Footer
        const footerY = doc.page.height - 40;
        doc.moveTo(40, footerY)
           .lineTo(40 + infoBoxWidth, footerY)
           .stroke();
        
        doc.font('Times-Roman').fontSize(8)
           .text('SF10 - Permanent Academic Record • Southville 8B Senior High School • CONFIDENTIAL', 
           40, footerY + 5, { width: infoBoxWidth, align: 'center' });
        
        doc.end();
    } catch (error) {
        console.error('Error generating Form 137:', error);
        res.status(500).json({ message: 'Error generating Form 137' });
    }
});

export default router;
