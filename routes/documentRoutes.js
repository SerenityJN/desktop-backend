import express from "express";
import pool from "../models/db.js";
import { sendEnrollmentEmail } from "../mailer/emailService.js";

const router = express.Router();

/* =============================
   GET VERIFICATION STATUS
============================= */
router.get("/verification-status/:LRN", async (req, res) => {
  try {
    const { LRN } = req.params;

    const { rows } = await pool.query(
      `SELECT 
        birth_cert, form137, good_moral, report_card, picture,
        transcript_records, honorable_dismissal
       FROM student_documents 
       WHERE LRN = $1`,
      [LRN]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "No document record found for this student",
      });
    }

    const doc = rows[0];

    res.json({
      success: true,
      LRN,
      verificationStatus: {
        birth_cert: Boolean(doc.birth_cert),
        form137: Boolean(doc.form137),
        good_moral: Boolean(doc.good_moral),
        report_card: Boolean(doc.report_card),
        picture: Boolean(doc.picture),
        transcript_records: Boolean(doc.transcript_records),
        honorable_dismissal: Boolean(doc.honorable_dismissal),
      },
    });
  } catch (error) {
    console.error("Error fetching verification status:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching verification status",
    });
  }
});

/* =============================
   VERIFY DOCUMENT
============================= */
router.post("/verify", async (req, res) => {
  try {
    const { LRN, documentType, verifiedBy } = req.body;

    if (!LRN || !documentType) {
      return res.status(400).json({
        success: false,
        message: "LRN and documentType are required",
      });
    }

    const validDocumentTypes = [
      "birth_cert",
      "form137",
      "good_moral",
      "report_card",
      "picture",
      "transcript_records",
      "honorable_dismissal",
    ];

    if (!validDocumentTypes.includes(documentType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid document type",
      });
    }

    const { rows } = await pool.query(
      "SELECT id FROM student_documents WHERE LRN = $1",
      [LRN]
    );

    if (!rows.length) {
      await pool.query(
        `INSERT INTO student_documents (LRN, ${documentType})
         VALUES ($1, $2)`,
        [LRN, true]
      );
    } else {
      await pool.query(
        `UPDATE student_documents
         SET ${documentType} = $1
         WHERE LRN = $2`,
        [true, LRN]
      );
    }

    // Log action
    try {
      await pool.query(
        `INSERT INTO document_verification_logs
         (LRN, document_type, action, verified_by, verified_at)
         VALUES ($1, $2, 'verified', $3, NOW())`,
        [LRN, documentType, verifiedBy || "system"]
      );
    } catch (logError) {
      console.error("Failed to log verification:", logError);
    }

    res.json({
      success: true,
      message: `Document ${documentType} verified successfully`,
      LRN,
      documentType,
      verified: true,
    });
  } catch (error) {
    console.error("Error verifying document:", error);
    res.status(500).json({
      success: false,
      message: "Server error while verifying document",
    });
  }
});

/* =============================
   UNVERIFY DOCUMENT
============================= */
router.post("/unverify", async (req, res) => {
  try {
    const { LRN, documentType } = req.body;

    if (!LRN || !documentType) {
      return res.status(400).json({
        success: false,
        message: "LRN and documentType are required",
      });
    }

    const validDocumentTypes = [
      "birth_cert",
      "form137",
      "good_moral",
      "report_card",
      "picture",
      "transcript_records",
      "honorable_dismissal",
    ];

    if (!validDocumentTypes.includes(documentType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid document type",
      });
    }

    const { rows } = await pool.query(
      "SELECT id FROM student_documents WHERE LRN = $1",
      [LRN]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "No document record found for this student",
      });
    }

    await pool.query(
      `UPDATE student_documents
       SET ${documentType} = $1
       WHERE LRN = $2`,
      [false, LRN]
    );

    try {
      await pool.query(
        `INSERT INTO document_verification_logs
         (LRN, document_type, action, verified_by, verified_at)
         VALUES ($1, $2, 'unverified', $3, NOW())`,
        [LRN, documentType, "system"]
      );
    } catch (logError) {
      console.error("Failed to log unverification:", logError);
    }

    res.json({
      success: true,
      message: `Document ${documentType} verification removed`,
      LRN,
      documentType,
      verified: false,
    });
  } catch (error) {
    console.error("Error removing document verification:", error);
    res.status(500).json({
      success: false,
      message: "Server error while removing verification",
    });
  }
});

/* =============================
   GET ALL STUDENT DOCUMENTS
============================= */
router.get("/student/:LRN", async (req, res) => {
  try {
    const { LRN } = req.params;

    const { rows } = await pool.query(
      "SELECT * FROM student_documents WHERE LRN = $1",
      [LRN]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "No documents found for this student",
      });
    }

    res.json({
      success: true,
      documents: rows[0],
    });
  } catch (error) {
    console.error("Error fetching student documents:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching student documents",
    });
  }
});

/* =============================
   SEND REMINDER EMAIL
============================= */
router.post("/remind-missing", async (req, res) => {
  const { email, fullname, documentName } = req.body;

  if (!email || !documentName) {
    return res.status(400).json({
      success: false,
      message: "Email and Document Name required.",
    });
  }

  try {
    await sendEnrollmentEmail(
      email,
      `⚠️ Action Required: Missing ${documentName}`,
      `
      <div style="font-family: Arial;">
        <h2>Missing Document Notification</h2>
        <p>Dear <strong>${fullname}</strong>,</p>
        <p>The following document is missing:</p>
        <strong>${documentName}</strong>
        <p>Please submit it as soon as possible.</p>
        <p>SV8BSHS Registrar Office</p>
      </div>
      `
    );

    res.json({ success: true, message: "Reminder email sent." });
  } catch (error) {
    console.error("Mailer Error:", error);
    res.status(500).json({
      success: false,
      message: "Error sending email reminder.",
    });
  }
});

export default router;
