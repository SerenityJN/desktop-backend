import express from 'express';
import db from "../models/db.js";
import { sendEnrollmentEmail } from "../mailer/emailService.js";

const router = express.Router();

// GET /api/documents/verification-status/:LRN
router.get('/verification-status/:LRN', async (req, res) => {
  try {
    const { LRN } = req.params;

    const [documents] = await db.execute(
      `SELECT 
        birth_cert, form137, good_moral, report_card, picture,
        transcript_records, honorable_dismissal
       FROM student_documents 
       WHERE LRN = ?`,
      [LRN]
    );

    if (documents.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No document record found for this student'
      });
    }

    const doc = documents[0];
    
    // Return verification status for all documents
    res.json({
      success: true,
      LRN: LRN,
      verificationStatus: {
        birth_cert: Boolean(doc.birth_cert),
        form137: Boolean(doc.form137),
        good_moral: Boolean(doc.good_moral),
        report_card: Boolean(doc.report_card),
        picture: Boolean(doc.picture),
        transcript_records: Boolean(doc.transcript_records),
        honorable_dismissal: Boolean(doc.honorable_dismissal)
      }
    });

  } catch (error) {
    console.error('Error fetching verification status:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching verification status'
    });
  }
});

// POST /api/documents/verify
router.post('/verify', async (req, res) => {
  try {
    const { LRN, documentType, verifiedBy } = req.body;

    // Validate required fields
    if (!LRN || !documentType) {
      return res.status(400).json({
        success: false,
        message: 'LRN and documentType are required'
      });
    }

    // Validate document type
    const validDocumentTypes = [
      'birth_cert', 'form137', 'good_moral', 'report_card', 'picture',
      'transcript_records', 'honorable_dismissal'
    ];

    if (!validDocumentTypes.includes(documentType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid document type'
      });
    }

    // First, check if student_documents record exists
    const [existingRecords] = await db.execute(
      'SELECT id FROM student_documents WHERE LRN = ?',
      [LRN]
    );

    if (existingRecords.length === 0) {
      // Create initial record if it doesn't exist
      await db.execute(
        `INSERT INTO student_documents (LRN, ${documentType}) VALUES (?, ?)`,
        [LRN, true]
      );
    } else {
      // Update existing record
      await db.execute(
        `UPDATE student_documents SET ${documentType} = ? WHERE LRN = ?`,
        [true, LRN]
      );
    }

    // Log the verification action (optional but recommended)
    try {
      await db.execute(
        `INSERT INTO document_verification_logs 
         (LRN, document_type, action, verified_by, verified_at) 
         VALUES (?, ?, 'verified', ?, NOW())`,
        [LRN, documentType, verifiedBy || 'system']
      );
    } catch (logError) {
      console.error('Failed to log verification:', logError);
      // Continue even if logging fails
    }

    res.json({
      success: true,
      message: `Document ${documentType} verified successfully`,
      LRN: LRN,
      documentType: documentType,
      verified: true
    });

  } catch (error) {
    console.error('Error verifying document:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while verifying document'
    });
  }
});

// POST /api/documents/unverify
router.post('/unverify', async (req, res) => {
  try {
    const { LRN, documentType } = req.body;

    // Validate required fields
    if (!LRN || !documentType) {
      return res.status(400).json({
        success: false,
        message: 'LRN and documentType are required'
      });
    }

    // Validate document type
    const validDocumentTypes = [
      'birth_cert', 'form137', 'good_moral', 'report_card', 'picture',
      'transcript_records', 'honorable_dismissal'
    ];

    if (!validDocumentTypes.includes(documentType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid document type'
      });
    }

    // Check if record exists
    const [existingRecords] = await db.execute(
      'SELECT id FROM student_documents WHERE LRN = ?',
      [LRN]
    );

    if (existingRecords.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No document record found for this student'
      });
    }

    // Update the document verification status to false
    await db.execute(
      `UPDATE student_documents SET ${documentType} = ? WHERE LRN = ?`,
      [false, LRN]
    );

    // Log the unverification action
    try {
      await db.execute(
        `INSERT INTO document_verification_logs 
         (LRN, document_type, action, verified_by, verified_at) 
         VALUES (?, ?, 'unverified', ?, NOW())`,
        [LRN, documentType, 'system']
      );
    } catch (logError) {
      console.error('Failed to log unverification:', logError);
      // Continue even if logging fails
    }

    res.json({
      success: true,
      message: `Document ${documentType} verification removed`,
      LRN: LRN,
      documentType: documentType,
      verified: false
    });

  } catch (error) {
    console.error('Error removing document verification:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while removing verification'
    });
  }
});

// GET /api/documents/student/:LRN - Get all documents for a student
router.get('/student/:LRN', async (req, res) => {
  try {
    const { LRN } = req.params;

    const [documents] = await db.execute(
      `SELECT * FROM student_documents WHERE LRN = ?`,
      [LRN]
    );

    if (documents.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No documents found for this student'
      });
    }

    res.json({
      success: true,
      documents: documents[0]
    });

  } catch (error) {
    console.error('Error fetching student documents:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching student documents'
    });
  }
});

router.post("/remind-missing", async (req, res) => {
  const { email, fullname, documentName } = req.body;

  if (!email || !documentName) {
    return res.status(400).json({ success: false, message: "Email and Document Name required." });
  }

  try {
    // Using your existing mailer service
    await sendEnrollmentEmail(
      email,
      `⚠️ Action Required: Missing ${documentName}`,
      `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h2 style="color: #e67e22;">Missing Document Notification</h2>
        <p>Dear <strong>${fullname}</strong>,</p>
        <p>During the review of your enrollment application at <strong>Southville 8B Senior High School</strong>, our registrar noticed that the following document is missing or was not clearly uploaded:</p>
        
        <div style="background: #fff3cd; padding: 15px; border-left: 5px solid #ffc107; margin: 20px 0; font-weight: bold;">
          Required Document: ${documentName}
        </div>

        <p>Please log in to the student portal or contact the registrar's office to submit this document as soon as possible to avoid delays in your enrollment process.</p>
        
        <p>Thank you,<br><strong>SV8BSHS Registrar Office</strong></p>
        <hr style="border:none; border-top:1px solid #eee;">
        <small style="color: #888;">This is an automated reminder. Please do not reply directly to this email.</small>
      </div>
      `
    );

    res.json({ success: true, message: "Reminder email sent." });
  } catch (error) {
    console.error("Mailer Error:", error);
    res.status(500).json({ success: false, message: "Error sending email reminder." });
  }
});

export default router;

