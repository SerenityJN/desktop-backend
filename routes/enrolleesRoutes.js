import express from "express";
const router = express.Router();
import db from "../models/db.js"; // Make sure this points to your PostgreSQL connection
import bcrypt from "bcryptjs";
import { sendEnrollmentEmail } from "../mailer/emailService.js";

const BASE_URL = "http://localhost:8000/uploads/";

// ============================
// Middleware for validation
// ============================
const validateUpdateStatus = (req, res, next) => {
  const { LRN, status } = req.body;
  
  console.log("📥 Validating update-status request:", { LRN, status });
  
  if (!LRN) {
    return res.status(400).json({ 
      success: false,
      message: "❌ LRN is required",
      received: req.body 
    });
  }
  
  if (!status) {
    return res.status(400).json({ 
      success: false,
      message: "❌ Status is required",
      received: req.body 
    });
  }
  
  next();
};

// ============================
// 1️⃣ GET all "Under Review" students (for Evaluation page)
// ============================
router.get("/under-review", async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT *
      FROM student_details d
      LEFT JOIN student_documents doc ON d.lrn = doc.lrn
      WHERE d.enrollment_status IN ('Under Review', 'Temporary Enrolled')
      ORDER BY d.created_at DESC
    `);

    // ✅ Cloudinary version — no need to prepend BASE_URL
    const formatted = rows.map((s) => ({
      ...s,
      form137: s.form137 || null,
      good_moral: s.good_moral || null,
      birth_cert: s.birth_cert || null,
      report_card: s.report_card || null,
      transcript_records: s.transcript_records || null,
      honorable_dismissal: s.honorable_dismissal || null,
    }));

    res.json(formatted);
  } catch (err) {
    console.error("❌ DB error:", err);
    res.status(500).json({ error: "Database error", details: err.message });
  }
});

// ============================
// 2️⃣ GET all Documents (for Documents page)
// ============================
router.get("/documents", async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT 
        d.lrn,
        CONCAT(d.lastname, ', ', d.firstname) AS fullname,
        d.strand,
        d.student_type,
        d.enrollment_status,
        doc.form137,
        doc.picture,
        doc.good_moral,
        doc.birth_cert,
        doc.report_card,
        doc.transcript_records,
        doc.honorable_dismissal
      FROM student_details d
      LEFT JOIN student_documents doc ON d.lrn = doc.lrn
      ORDER BY d.created_at DESC
    `);

    const formatted = rows.map((row) => ({
      ...row,
      form137: row.form137 ? row.form137 : null,
      picture: row.picture ? row.picture : null,
      good_moral: row.good_moral ? row.good_moral : null,
      birth_cert: row.birth_cert ? row.birth_cert : null,
      report_card: row.report_card ? row.report_card : null,
    }));

    res.json(formatted);
  } catch (err) {
    console.error("❌ Documents fetch error:", err);
    res.status(500).json({ error: "Database error", details: err.message });
  }
});

// ============================
// 3️⃣ GET Enrolled Students
// ============================
router.get("/students", async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT 
        student_details.*,
        student_enrollments.semester,
        student_enrollments.grade_slip,
        student_documents.birth_cert,
        student_documents.form137,
        student_documents.good_moral,
        student_documents.report_card,
        student_documents.picture
      FROM student_details
      LEFT JOIN student_enrollments ON student_details.lrn = student_enrollments.lrn
      LEFT JOIN student_documents ON student_details.lrn = student_documents.lrn
      WHERE student_details.enrollment_status IN ('Enrolled', 'Temporary Enrolled')
      ORDER BY student_details.lastname, student_details.firstname
    `);
    
    // Ensure all document fields are included in the response
    const formatted = rows.map(r => ({
      ...r,
      birth_cert: r.birth_cert || null,
      form137: r.form137 || null,
      good_moral: r.good_moral || null,
      report_card: r.report_card || null,
      picture: r.picture || null,
      grade_slip: r.grade_slip || null
    }));

    res.json(formatted);
  } catch (err) {
    console.error("Error fetching enrolled students:", err);
    res.status(500).json({ error: "Failed to fetch enrolled students" });
  }
});

// ============================
// 4️⃣ GET Second Semester Students
// ============================
router.get("/secondsemester", async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT 
        student_details.*,
        student_enrollments.id AS enrollment_id,
        student_enrollments.school_year,
        student_enrollments.semester,
        student_enrollments.status AS sem_status,
        student_enrollments.grade_slip,
        student_enrollments.created_at
      FROM student_details
      INNER JOIN student_enrollments ON student_details.lrn = student_enrollments.lrn
      WHERE student_details.enrollment_status = 'Enrolled' 
        AND student_enrollments.semester = '1st' 
        AND student_enrollments.status = 'pending'
        AND student_enrollments.enrollment_type = 'Continuing'
      ORDER BY student_enrollments.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error("Error fetching enrolled students:", err);
    res.status(500).json({ error: "Failed to fetch enrolled students" });
  }
});

// ============================
// 5️⃣ Approve Student for Second Semester
// ============================
router.post("/students/approve", async (req, res) => {
  try {
    const { LRN } = req.body;
    
    if (!LRN) {
      return res.status(400).json({ error: "LRN is required" });
    }
    
    // Get current school year (you might want to make this dynamic)
    const currentSchoolYear = '2025-2026';
    
    // Get student details for password generation
    const { rows: studentData } = await db.query(
      'SELECT firstname, lastname FROM student_details WHERE lrn = $1',
      [LRN]
    );
    
    if (studentData.length === 0) {
      return res.status(404).json({ error: "Student not found" });
    }
    
    const student = studentData[0];
  
    const { rowCount } = await db.query(`
      UPDATE student_enrollments 
      SET semester = '2nd', 
          status = 'Enrolled',
          rejection_reason = NULL,
          updated_at = NOW(),
          enrollment_type = 'Regular'
      WHERE lrn = $1 AND school_year = $2 AND semester = '1st'
    `, [LRN, currentSchoolYear]);
    
    // Update student status to Enrolled
    await db.query(
      'UPDATE student_details SET enrollment_status = $1 WHERE lrn = $2',
      ['Enrolled', LRN]
    );
    
    res.json({ message: "Student approved successfully" });
  } catch (err) {
    console.error("Error approving student:", err);
    res.status(500).json({ error: "Failed to approve student" });
  }
});

// ============================
// 6️⃣ GET all "New Enrollees" (Pending)
// ============================
router.get("/", async (req, res) => {
  try {
    console.log('Fetching pending enrollees...');
    
    const { rows } = await db.query(`
      SELECT
        d.lrn,
        d.firstname,
        d.lastname,
        d.sex,
        d.age,
        d.strand,
        d.home_add,
        d.cpnumber,
        d.enrollment_status,
        d.student_type,
        doc.form137,
        doc.good_moral,
        doc.birth_cert,
        doc.report_card,
        doc.transcript_records,
        doc.honorable_dismissal
      FROM student_details d
      LEFT JOIN student_documents doc ON d.lrn = doc.lrn
      WHERE d.enrollment_status = 'Pending'
      ORDER BY d.created_at DESC
    `);

    console.log(`Found ${rows.length} pending enrollees`);

    const students = rows.map((r) => ({
      ...r,
      birth_cert: r.birth_cert ? BASE_URL + r.birth_cert : null,
      form137: r.form137 ? BASE_URL + r.form137 : null,
      good_moral: r.good_moral ? BASE_URL + r.good_moral : null,
      report_card: r.report_card ? BASE_URL + r.report_card : null,
      transcript_records: r.transcript_records ? BASE_URL + r.transcript_records : null,
      honorable_dismissal: r.honorable_dismissal ? BASE_URL + r.honorable_dismissal : null,
    }));

    res.json(students);
  } catch (err) {
    console.error("❌ Error in GET /enrollees:", err);
    console.error("Error details:", {
      message: err.message,
      stack: err.stack,
      code: err.code
    });
    res.status(500).json({ 
      error: "Database error", 
      details: err.message,
      code: err.code 
    });
  }
});

// ============================
// 7️⃣ Add new enrollee
// ============================
router.post("/add", async (req, res) => {
  const data = req.body;
  const client = await db.getClient(); // You'll need to implement this method for transactions

  // 1. Basic Validation
  if (!data.LRN || !data.lastname || !data.firstname || !data.strand || !data.email) {
    return res.status(400).json({ success: false, message: "❌ Missing required fields." });
  }

  try {
    // Start transaction
    await client.query('BEGIN');

    // 2. Check for Duplicates
    const { rows: exists } = await client.query(
      "SELECT 1 FROM student_details WHERE lrn = $1 OR email = $2", 
      [data.LRN, data.email]
    );

    if (exists.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: "LRN or Email is already registered." });
    }

    // 3. Prepare Data
    const guardianName = data.GuardianName || data.FathersName || data.MothersName || "N/A";
    const guardianContact = data.GuardianContact || data.FathersContact || data.MothersContact || "N/A";
    const homeAddress = data.home_add; 
    const studentType = data.student_type || "New Enrollee";
    const yearLevel = data.yearlevel || "Grade 11";

    // 4. Insert into STUDENT_DETAILS
    await client.query(
      `INSERT INTO student_details 
        (lrn, firstname, lastname, middlename, suffix, age, sex, status, nationality, birthdate,
         place_of_birth, religion, cpnumber, home_add, email, yearlevel, strand, 
         student_type, enrollment_status, created_at,
         "FathersName", "FathersContact", "MothersName", "MothersContact", "GuardianName", "GuardianContact")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW(), $20, $21, $22, $23, $24, $25)`,
      [
        data.LRN, data.firstname, data.lastname, data.middlename || null, data.suffix || null, 
        data.age, data.sex, "Single", "Filipino", data.birthdate,
        null, data.religion, data.cpnumber, homeAddress, data.email, yearLevel, data.strand,
        studentType, 'Pending',
        data.FathersName, data.FathersContact, data.MothersName, data.MothersContact, data.GuardianName, data.GuardianContact
      ]
    );

    // 5. Insert into STUDENT_DOCUMENTS
    await client.query(
      `INSERT INTO student_documents 
       (lrn, birth_cert, form137, good_moral, report_card, transcript_records, honorable_dismissal)
       VALUES ($1, NULL, NULL, NULL, NULL, NULL, NULL)`,
      [data.LRN]
    );

    // 6. Insert into GUARDIANS Table
    await client.query(
      `INSERT INTO guardians (lrn, name, contact) VALUES ($1, $2, $3)`,
      [data.LRN, guardianName, guardianContact]
    );

    // 7. Generate Reference & Insert into STUDENT_ACCOUNTS
    const reference = "SV8BSHS-" + String(data.LRN).slice(-6);

    await client.query(
      `INSERT INTO student_accounts (lrn, track_code) VALUES ($1, $2)`,
      [data.LRN, reference]
    );

    // 8. Insert into STUDENT_ENROLLMENTS
    const now = new Date(); 
    const currentYear = now.getFullYear();
    const school_year = (now.getMonth() >= 5) 
        ? `${currentYear}-${currentYear + 1}` 
        : `${currentYear - 1}-${currentYear}`;

    await client.query(
      `INSERT INTO student_enrollments 
      (lrn, school_year, semester, status)
      VALUES ($1, $2, $3, $4)`,
      [data.LRN, school_year, data.semester || "1st Semester", "Pending"]
    );

    // 9. COMMIT TRANSACTION
    await client.query('COMMIT');

    // 10. Send Email
    try {
      await sendEnrollmentEmail(
        data.email,
        "🎓 SV8BSHS Enrollment Confirmation",
        `
        <div style="font-family:'Segoe UI',Arial,sans-serif;line-height:1.6;color:#333;background-color:#f8fafc;padding:20px;">
          <div style="max-width:600px;background:#fff;margin:auto;border-radius:8px;box-shadow:0 4px 10px rgba(0,0,0,0.05);overflow:hidden;">
            <div style="background:#1e40af;color:#fff;text-align:center;padding:20px;">
              <h2 style="margin:0;">SV8BSHS Enrollment Confirmation</h2>
            </div>
            <div style="padding:25px;">
              <p>Dear <strong>${data.firstname} ${data.lastname}</strong>,</p>
              <p>Thank you for enrolling at <strong>Southville 8B Senior High School (SV8BSHS)</strong>!</p>
              <p>Your application has been successfully recorded by the Admin.</p>

              <p style="margin-top:20px;font-size:1.1em;">
                <strong>Reference Number:</strong> 
                <span style="display:inline-block;background:#f1f5f9;padding:8px 12px;border-radius:6px;margin-top:4px;">
                  ${reference}
                </span>
              </p>
              <p style="text-align:center;margin:30px 0;">
                <a href="https://expo.dev/artifacts/eas/mVJUc8dzeB4ZrEFVia7wu8.apk"
                  style="background-color:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:500;">
                  📱 Track Enrollment Status
                </a>
              </p>
              <p>Use this reference number to track your enrollment status.</p>

              <hr style="border:none;border-top:1px solid #e5e7eb;margin:30px 0;">
              <p style="font-size:0.9em;color:#666;">This is an automated message — please do not reply.</p>
              <p style="text-align:center;color:#aaa;font-size:0.8em;margin-top:20px;">
                © ${currentYear} Southville 8B Senior High School. All rights reserved.
              </p>
            </div>
          </div>
        </div>
        `
      );
    } catch (mailError) {
      console.error("⚠️ Email send failed:", mailError);
    }

    // 11. Success Response
    res.status(200).json({
      success: true,
      reference,
      message: `✅ Enrollee added successfully! Ref: ${reference}`,
    });

  } catch (err) {
    // Rollback if anything fails
    await client.query('ROLLBACK');
    
    console.error("❌ Enrollment Transaction Error:", err);
    
    // Check for duplicate key violation (PostgreSQL error code 23505)
    if (err.code === '23505') {
      res.status(400).json({
        success: false,
        message: "LRN or Email already exists.",
      });
    } else {
      res.status(500).json({
        success: false,
        message: "An internal server error occurred: " + err.message,
      });
    }
  } finally {
    client.release();
  }
});

// ============================
// 8️⃣ Delete Student
// ============================
router.post("/delete-student", async (req, res) => {
  try {
    const { LRN } = req.body;
    if (!LRN) return res.status(400).json({ message: "LRN is required" });

    const { rowCount } = await db.query('DELETE FROM student_details WHERE lrn = $1', [LRN]);

    if (rowCount === 0) {
      return res.status(404).json({ message: "Student not found" });
    }

    res.json({ message: "✅ Student deleted successfully" });
  } catch (err) {
    console.error("Delete Student Error:", err);
    res.status(500).json({ message: "Server error deleting student" });
  }
});

// ============================
// 9️⃣ Update enrollment_status (generic) - FIXED VERSION
// ============================
router.post("/update-status", validateUpdateStatus, async (req, res) => {
  const { LRN, status, reason, plainPassword } = req.body;

  // Enhanced logging for debugging
  console.log("📥 Processing update-status request:", {
    LRN: LRN,
    status: status,
    hasPassword: !!plainPassword,
    reasonProvided: !!reason
  });

  try {
    // Check if student exists first
    const { rows: studentCheck } = await db.query(
      'SELECT firstname, lastname, email FROM student_details WHERE lrn = $1',
      [LRN]
    );
    
    if (studentCheck.length === 0) {
      console.error(`❌ Student not found with LRN: ${LRN}`);
      return res.status(404).json({ 
        success: false,
        message: "❌ Student not found",
        lrn: LRN 
      });
    }

    const student = studentCheck[0];
    console.log(`✅ Found student: ${student.firstname} ${student.lastname} (${student.email})`);

    // ✅ Update student status + reason if needed
    if (status === "Rejected" || status === "Temporary Enrolled") {
      await db.query(
        'UPDATE student_details SET enrollment_status = $1, reason = $2 WHERE lrn = $3',
        [status, reason || null, LRN]
      );
      console.log(`✅ Updated status to ${status} with reason: ${reason || 'None'}`);
    } else {
      await db.query(
        'UPDATE student_details SET enrollment_status = $1, reason = NULL WHERE lrn = $2',
        [status, LRN]
      );
      console.log(`✅ Updated status to ${status}`);
    }

    // ✅ If enrolled → hash password + store in student_accounts
    if (status === "Enrolled" || status === "Temporary Enrolled") {
      if (!plainPassword) {
        console.error("❌ Plain password is required but not provided");
        return res.status(400).json({ 
          success: false,
          message: "❌ Plain password is required to complete enrollment." 
        });
      }

      const hashedPassword = await bcrypt.hash(plainPassword, 10);
      console.log("✅ Password hashed successfully");

      await db.query(
        'UPDATE student_accounts SET password = $1 WHERE lrn = $2',
        [hashedPassword, LRN]
      );
      console.log("✅ Password saved to database");
    }

    // Get reference number
    const { rows: accRows } = await db.query(
      'SELECT track_code FROM student_accounts WHERE lrn = $1',
      [LRN]
    );
    const reference = accRows.length ? accRows[0].track_code : "N/A";

    let subject = "";
    let message = "";

    // ================================
    // ✅ Enrollment Confirmed (Under Review)
    // ================================
    if (status === "Under Review") {
      subject = "🎓 SV8BSHS Enrollment Review in Progress";
      message = `
    <div style="font-family:'Segoe UI',Arial,sans-serif;line-height:1.6;color:#333;background-color:#f8fafc;padding:20px;">
      <div style="max-width:600px;background:#fff;margin:auto;border-radius:8px;box-shadow:0 4px 10px rgba(0,0,0,0.05);overflow:hidden;">
        <div style="background:#1e40af;color:#fff;text-align:center;padding:20px;">
          <h2 style="margin:0;">SV8BSHS Enrollment Status Update</h2>
        </div>
        <div style="padding:25px;">
          <p>Dear <strong>${student.firstname} ${student.lastname}</strong>,</p>

          <p>Your enrollment submission has been <strong>successfully confirmed</strong> and is now currently under review by our <strong>Admissions Office</strong>.</p>

          <p>You may check your enrollment progress anytime through our mobile app.</p>

          <p style="margin-top:20px;font-size:1.1em;">
            <strong>Tracking Code / Student ID:</strong> 
            <span style="display:inline-block;background:#f1f5f9;padding:8px 12px;border-radius:6px;margin-top:4px;">
              ${reference}
            </span>
          </p>

          <p style="margin-top:10px;">This code was also provided in your previous email.</p>

          <p style="text-align:center;margin:30px 0;">
            <a href="https://expo.dev/artifacts/eas/mVJUc8dzeB4ZrEFVia7wu8.apk"
              style="background-color:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:500;">
              📱 Track Enrollment Status
            </a>
          </p>

          <hr style="border:none;border-top:1px solid #e5e7eb;margin:30px 0;">
          <p style="font-size:0.9em;color:#666;">This is an automated message — please do not reply.</p>
          <p style="text-align:center;color:#aaa;font-size:0.8em;margin-top:20px;">
            © ${new Date().getFullYear()} Southville 8B Senior High School. All rights reserved.
          </p>
        </div>
      </div>
    </div>
    `;
    }

    // ================================
    // 🎉 Enrollment Approved (Enrolled)
    // ================================
    else if (status === "Enrolled") {
      if (!plainPassword) {
        return res.status(400).json({ 
          success: false,
          message: "❌ Plain text password is required for the enrollment email." 
        });
      }

      subject = "✅ SV8BSHS Enrollment Approved & Account Details";
      message = `
      <div style="font-family:'Segoe UI',Arial,sans-serif;line-height:1.6;color:#333;background-color:#f8fafc;padding:20px;">
        <div style="max-width:600px;background:#fff;margin:auto;border-radius:8px;box-shadow:0 4px 10px rgba(0,0,0,0.05);overflow:hidden;">
          <div style="background:#16a34a;color:#fff;text-align:center;padding:20px;">
            <h2 style="margin:0;">🎉 Enrollment Approved</h2>
          </div>
          <div style="padding:25px;">
            <p>Dear <strong>${student.firstname} ${student.lastname}</strong>,</p>
            <p>Congratulations! Your enrollment at <strong>Southville 8B Senior High School (SV8BSHS)</strong> has been <strong>officially approved</strong>.</p>
            <p style="margin-top:25px;"><strong>Please keep your login credentials in a safe place.</strong> You will use these to access the SVSHS Student Mobile App.</p>
            <div style="background:#f1f5f9;padding:15px;border-radius:6px;margin-top:10px;">
                <p style="margin:0 0 5px 0;"><strong>Student ID:</strong> ${reference}</p>
                <p style="margin:0;"><strong>Password:</strong> ${plainPassword}</p>
            </div>
            <p style="margin-top:25px;">You may now check your account and important announcements through the app.</p>
            <p style="text-align:center;margin:30px 0;">
              <a href="https://expo.dev/artifacts/eas/mVJUc8dzeB4ZrEFVia7wu8.apk"
                style="background-color:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:500;">
                📱 Open Student App
              </a>
            </p>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:30px 0;">
            <p style="font-size:0.9em;color:#666;">This is an automated message — please do not reply.</p>
            <p style="text-align:center;color:#aaa;font-size:0.8em;margin-top:20px;">
              © ${new Date().getFullYear()} Southville 8B Senior High School. All rights reserved.
            </p>
          </div>
        </div>
      </div>
      `;
    }

    // ================================
    // ⏳ Temporary Enrollment
    // ================================
    else if (status === "Temporary Enrolled") {
      if (!plainPassword) {
        return res.status(400).json({ 
          success: false,
          message: "❌ Plain text password is required for the enrollment email." 
        });
      }
      subject = "⏳ SV8BSHS - Temporary Enrollment Status";
      message = `
      <div style="font-family:'Segoe UI',Arial,sans-serif;line-height:1.6;color:#333;background-color:#f8fafc;padding:20px;">
        <div style="max-width:600px;background:#fff;margin:auto;border-radius:8px;box-shadow:0 4px 10px rgba(0,0,0,0.05);overflow:hidden;">
          <div style="background:#f59e0b;color:#fff;text-align:center;padding:20px;">
            <h2 style="margin:0;">⏳ Temporary Enrollment Granted</h2>
          </div>
          <div style="padding:25px;">
            <p>Dear <strong>${student.firstname} ${student.lastname}</strong>,</p>
            
            <p>Your enrollment at <strong>Southville 8B Senior High School</strong> has been granted <strong>temporary status</strong>.</p>

            <p><strong>Reason for Temporary Status:</strong></p>
            <div style="background:#fffbeb;border-left:4px solid #f59e0b;padding:12px;border-radius:6px;margin:15px 0;">
              <p style="margin:0;font-weight:500;">${reason || "Pending completion of requirements"}</p>
            </div>

            <p><strong>Your Login Credentials:</strong></p>
            <div style="background:#f1f5f9;padding:15px;border-radius:6px;margin-top:10px;">
                <p style="margin:0 0 5px 0;"><strong>Student ID:</strong> ${reference}</p>
                <p style="margin:0;"><strong>Password:</strong> ${plainPassword}</p>
            </div>

            <p><strong>What you need to do:</strong></p>
            <ul style="background:#f1f5f9;padding:15px 15px 15px 30px;border-radius:6px;">
              <li>Complete the pending requirements mentioned above</li>
              <li><strong>Upload missing documents through our mobile app</strong> (instructions below)</li>
              <li>Your enrollment will be finalized once all requirements are complete</li>
              <li>You may attend classes temporarily while completing requirements</li>
            </ul>

            <div style="background:#e8f5e8;border:1px solid #4caf50;border-radius:8px;padding:15px;margin:20px 0;">
              <h4 style="color:#2e7d32;margin-top:0;">📱 How to Upload Documents via Mobile App:</h4>
              <ol style="margin:0;padding-left:20px;">
                <li><strong>Download and install</strong> the SV8BSHS Student App</li>
                <li><strong>Login</strong> using your Student ID and Password above</li>
                <li>Go to <strong>"My Profile"</strong> or <strong>"Documents"</strong> section</li>
                <li>Tap <strong>"Upload Documents"</strong> button</li>
                <li>Select the required documents from your phone</li>
                <li>Submit and wait for verification</li>
              </ol>
            </div>

            <p style="text-align:center;margin:30px 0;">
              <a href="https://expo.dev/artifacts/eas/mVJUc8dzeB4ZrEFVia7wu8.apk"
                style="background-color:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:500;display:inline-block;">
                📱 Download Student App
              </a>
            </p>

            <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:6px;padding:12px;margin:15px 0;">
              <p style="margin:0;font-weight:500;color:#856404;">
                ⚠️ <strong>Important:</strong> This temporary status is valid for 30 days. 
                Please complete all requirements before the deadline to avoid enrollment cancellation.
              </p>
            </div>

            <p style="font-size:0.9em;color:#666;text-align:center;">
              Need help? Contact the Admissions Office at (02) 855-11982 or email 342567@deped.gov.ph
            </p>

            <hr style="border:none;border-top:1px solid #e5e7eb;margin:30px 0;">
            <p style="font-size:0.9em;color:#666;">This is an automated message — please do not reply.</p>
            <p style="text-align:center;color:#aaa;font-size:0.8em;margin-top:20px;">
              © ${new Date().getFullYear()} Southville 8B Senior High School. All rights reserved.
            </p>
          </div>
        </div>
      </div>
      `;
    }

    // ================================
    // ❌ Enrollment Rejected
    // ================================
    else if (status === "Rejected") {
      subject = "⚠️ SV8BSHS Enrollment Application Result";
      message = `
      <div style="font-family:'Segoe UI',Arial,sans-serif;line-height:1.6;color:#333;background-color:#fafafa;padding:20px;">
        <div style="max-width:600px;background:#fff;margin:auto;border-radius:8px;box-shadow:0 4px 10px rgba(0,0,0,0.05);overflow:hidden;">
          <div style="background:#b91c1c;color:#fff;text-align:center;padding:20px;">
            <h2 style="margin:0;">Enrollment Application Result</h2>
          </div>
          <div style="padding:25px;">
            <p>Dear <strong>${student.firstname} ${student.lastname}</strong>,</p>

            <p>Thank you for applying to <strong>Southville 8B Senior High School</strong>.</p>

            <p>After reviewing your submitted enrollment documents, we were unable to approve your application at this time.</p>

            <p><strong>Reason for Rejection:</strong></p>
            <p style="background:#fff3cd;border-left:4px solid #b91c1c;padding:12px;border-radius:6px;">
              ${reason || "No specific reason provided"}
            </p>

            <p>You are welcome to apply again in the next enrollment period once you are able to address the reason above.</p>

            <hr style="border:none;border-top:1px solid #e5e7eb;margin:30px 0;">
            <p style="font-size:0.9em;color:#666;">This is an automated message — please do not reply.</p>
            <p style="text-align:center;color:#aaa;font-size:0.8em;margin-top:20px;">
              © ${new Date().getFullYear()} Southville 8B Senior High School. All rights reserved.
            </p>
          </div>
        </div>
      </div>
      `;
    }

    // ✅ Send Email
    if (subject && message) {
      try {
        await sendEnrollmentEmail(student.email, subject, message);
        console.log(`📧 Status email sent successfully to ${student.email} (${status})`);
      } catch (mailError) {
        console.error("⚠️ Email send failed but status updated:", mailError);
        // Continue - don't fail the whole request if email fails
      }
    }

    // ✅ Final response
    res.json({ 
      success: true,
      message: `✅ Student ${LRN} updated to '${status}'. Email sent.` 
    });

  } catch (err) {
    console.error("❌ Error in update-status:", err);
    res.status(500).json({ 
      success: false,
      message: "❌ Server Error",
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

// ============================
// 🔟 Check account
// ============================
router.get("/check-account/:lrn", async (req, res) => {
  try {
    const { lrn } = req.params;
    
    if (!lrn) {
      return res.status(400).json({ error: "LRN is required" });
    }
    
    const { rows } = await db.query(
      'SELECT password FROM student_accounts WHERE lrn = $1',
      [lrn]
    );
    
    const hasPassword = rows.length > 0 && rows[0].password && rows[0].password.trim() !== '';
    
    res.json({ 
      hasPassword,
      accountExists: rows.length > 0
    });
  } catch (err) {
    console.error("Error checking account:", err);
    res.status(500).json({ error: "Failed to check account status" });
  }
});

// ============================
// Debug endpoint to test request body
// ============================
router.post("/debug", (req, res) => {
  console.log("🔍 DEBUG - Full request body:", req.body);
  console.log("🔍 DEBUG - Headers:", req.headers);
  
  res.json({
    receivedBody: req.body,
    message: "Debug endpoint - check server logs"
  });
});

export default router;
