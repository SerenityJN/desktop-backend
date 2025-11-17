import express from "express";
const router = express.Router();
import db from "../models/db.js";
import bcrypt from "bcryptjs";
import { sendEnrollmentEmail } from "../mailer/emailService.js";

const BASE_URL = "http://localhost:8000/uploads/";

// ============================
// 1️⃣ GET all "Under Review" students (for Evaluation page)
// ============================
router.get("/under-review", async (req, res) => {
  try {
    const [students] = await db.query(`
      SELECT *
      FROM student_details d
      LEFT JOIN student_documents doc ON d.LRN = doc.LRN
      WHERE d.enrollment_status IN ('Under Review', 'Temporary Enrolled')
      ORDER BY d.created_at DESC
    `);

    // ✅ Cloudinary version — no need to prepend BASE_URL
    const formatted = students.map((s) => ({
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
    const [docs] = await db.query(`
      SELECT 
        d.LRN,
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
      LEFT JOIN student_documents doc ON d.LRN = doc.LRN
      ORDER BY d.created_at DESC
    `);

    const formatted = docs.map((row) => ({
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

// Add this to your existing enrolleesRoutes.js
router.get("/students", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        sd.*,
        se.semester
      FROM student_details sd
      LEFT JOIN student_enrollments se ON sd.LRN = se.LRN
      WHERE sd.enrollment_status IN ('Enrolled', 'Temporary Enrolled')
      ORDER BY sd.lastname, sd.firstname
    `);
    res.json(rows);
  } catch (err) {
    console.error("Error fetching enrolled students:", err);
    res.status(500).json({ error: "Failed to fetch enrolled students" });
  }
});

router.get("/secondsemester", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        sd.*,
        se.semester
      FROM student_details sd
      LEFT JOIN student_enrollments se ON sd.LRN = se.LRN
      WHERE sd.enrollment_status = 'Enrolled' 
        AND se.semester = '1st'
      ORDER BY sd.lastname, sd.firstname
    `);
    res.json(rows);
  } catch (err) {
    console.error("Error fetching enrolled students:", err);
    res.status(500).json({ error: "Failed to fetch enrolled students" });
  }
});

router.post("/students/approve", async (req, res) => {
  try {
    const { LRN } = req.body;
    
    if (!LRN) {
      return res.status(400).json({ error: "LRN is required" });
    }
    
    // Get current school year dynamically
    const currentYear = new Date().getFullYear();
    const currentSchoolYear = `${currentYear}-${currentYear + 1}`;
    
    // Get student details
    const [studentData] = await db.query(
      'SELECT firstname, lastname FROM student_details WHERE LRN = ?',
      [LRN]
    );
    
    if (studentData.length === 0) {
      return res.status(404).json({ error: "Student not found" });
    }
    
    const student = studentData[0];
  
    // Update enrollment record
    const [result] = await db.query(`
      UPDATE student_enrollments 
      SET semester = '2nd', 
          status = 'Enrolled',
          rejection_reason = NULL,
          enrollment_type = 'Regular',
          updated_at = NOW()
      WHERE LRN = ? AND school_year = ?
    `, [LRN, currentSchoolYear]);
    
    if (result.affectedRows === 0) {
      // If no enrollment record exists, create one
      await db.query(`
        INSERT INTO student_enrollments (LRN, school_year, semester, status, enrollment_type, created_at)
        VALUES (?, ?, ?, ?, ?, NOW())
      `, [LRN, currentSchoolYear, '2nd', 'Enrolled', 'Regular']);
    }
    
    // Update student status
    await db.query(
      'UPDATE student_details SET enrollment_status = ? WHERE LRN = ?',
      ['Enrolled', LRN]
    );
    
    // Generate password
    const lastName = student.lastname.trim();
    const lastFourOfLRN = LRN.slice(-4);
    const plainTextPassword = `SV8B-${lastName}${lastFourOfLRN}`;
    
    res.json({
      success: true,
      message: `Student approved for 2nd semester`,
      password: plainTextPassword
    });
    
  } catch (err) {
    console.error("Error approving student:", err);
    res.status(500).json({ error: "Failed to approve student" });
  }
});



// ============================
// 3️⃣ GET all "New Enrollees"
// ============================
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        d.LRN,
        d.firstname,
        d.lastname,
        d.sex,
        d.age,
        d.strand,
        d.home_add,
        d.cpnumber,
        d.enrollment_status,
        d.student_type,   -- ✅ ADD THIS LINE
        doc.form137,
        doc.good_moral,
        doc.birth_cert,
        doc.report_card,
        doc.transcript_records,
        doc.honorable_dismissal
      FROM student_details d
      LEFT JOIN student_documents doc ON d.LRN = doc.LRN
      WHERE d.enrollment_status = 'Pending'
      ORDER BY d.created_at DESC
    `);

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
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// ============================
// 4️⃣ Add new enrollee
// ============================
router.post("/add", async (req, res) => {
  const data = req.body;
  try {
    const sql = `
      INSERT INTO student_details (
        LRN, firstname, middlename, lastname, suffix, age, sex, status, nationality, 
        birthdate, place_of_birth, religion, cpnumber, home_add, email, yearlevel, 
        strand, student_type, enrollment_status, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `;

    const params = [
      data.LRN,
      data.firstname,
      data.middlename,
      data.lastname,
      data.suffix,
      data.age,
      data.sex,
      data.status,
      data.nationality,
      data.birthdate,
      data.place_of_birth,
      data.religion,
      data.cpnumber,
      data.home_add,
      data.email,
      data.yearlevel,
      data.strand,
      data.student_type,
      data.enrollment_status,
    ];

    await db.query(sql, params);
    res.send("✅ Enrollee added successfully!");
  } catch (err) {
    console.error(err);
    res.status(500).send("❌ Error adding enrollee");
  }
});

router.post("/delete-student", async (req, res) => {
  try {
    const { LRN } = req.body;
    if (!LRN) return res.status(400).json({ message: "LRN is required" });

    const result = await db.query("DELETE FROM student_details WHERE LRN = ?", [LRN]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Student not found" });
    }

    res.json({ message: "✅ Student deleted successfully" });
  } catch (err) {
    console.error("Delete Student Error:", err);
    res.status(500).json({ message: "Server error deleting student" });
  }
});


// ============================
// 5️⃣ Update enrollment_status (generic)
// ============================
router.post("/update-status", async (req, res) => {
  const { LRN, status, reason, plainPassword } = req.body;

  if (!LRN || !status) {
    return res.status(400).json({ message: "❌ Missing LRN or status" });
  }

  try {
    // ✅ Update student status + reason if needed (for Rejected OR Temporary Enrolled)
    if (status === "Rejected" || status === "Temporary Enrolled") {
      await db.query(
        "UPDATE student_details SET enrollment_status = ?, reason = ? WHERE LRN = ?",
        [status, reason || null, LRN]
      );
    } else {
      await db.query(
        "UPDATE student_details SET enrollment_status = ?, reason = NULL WHERE LRN = ?",
        [status, LRN]
      );
    }

    // ✅ If enrolled → hash password + store in student_accounts
    if (status === "Enrolled" || status === "Temporary Enrolled") {
      if (!plainPassword) {
        return res.status(400).json({ message: "❌ Plain password is required to complete enrollment." });
      }

      const hashedPassword = await bcrypt.hash(plainPassword, 10);

      await db.query(
        "UPDATE student_accounts SET password = ? WHERE LRN = ?",
        [hashedPassword, LRN]
      );
    }

    const [rows] = await db.query(
      "SELECT firstname, lastname, email FROM student_details WHERE LRN = ?",
      [LRN]
    );
    
    const student = rows[0];
    if (!student) {
      return res.status(404).json({ message: "❌ Student not found for email." });
    }

    const { firstname, lastname, email } = student;


    const [accRows] = await db.query(
      "SELECT track_code FROM student_accounts WHERE LRN = ?",
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
          <h2 style="margin:0;">SVSHS Enrollment Status Update</h2>
        </div>
        <div style="padding:25px;">
          <p>Dear <strong>${firstname} ${lastname}</strong>,</p>

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
            <a href="https://expo.dev/artifacts/eas/n6nwRz1nQCeuyu2KBe2xUH.apk"
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
        return res.status(400).json({ message: "❌ Plain text password is required for the enrollment email." });
      }

      subject = "✅ SV8BSHS Enrollment Approved & Account Details";
      message = `
      <div style="font-family:'Segoe UI',Arial,sans-serif;line-height:1.6;color:#333;background-color:#f8fafc;padding:20px;">
        <div style="max-width:600px;background:#fff;margin:auto;border-radius:8px;box-shadow:0 4px 10px rgba(0,0,0,0.05);overflow:hidden;">
          <div style="background:#16a34a;color:#fff;text-align:center;padding:20px;">
            <h2 style="margin:0;">🎉 Enrollment Approved</h2>
          </div>
          <div style="padding:25px;">
            <p>Dear <strong>${firstname} ${lastname}</strong>,</p>
            <p>Congratulations! Your enrollment at <strong>Southville 8B Senior High School (SV8BSHS)</strong> has been <strong>officially approved</strong>.</p>
            <p style="margin-top:25px;"><strong>Please keep your login credentials in a safe place.</strong> You will use these to access the SVSHS Student Mobile App.</p>
            <div style="background:#f1f5f9;padding:15px;border-radius:6px;margin-top:10px;">
                <p style="margin:0 0 5px 0;"><strong>Student ID:</strong> ${reference}</p>
                <p style="margin:0;"><strong>Password:</strong> ${plainPassword}</p>
            </div>
            <p style="margin-top:25px;">You may now check your class schedule and important announcements through the app.</p>
            <p style="text-align:center;margin:30px 0;">
              <a href="https://expo.dev/artifacts/eas/n6nwRz1nQCeuyu2KBe2xUH.apk"
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
        return res.status(400).json({ message: "❌ Plain text password is required for the enrollment email." });
      }
      subject = "⏳ SV8BSHS - Temporary Enrollment Status";
      message = `
      <div style="font-family:'Segoe UI',Arial,sans-serif;line-height:1.6;color:#333;background-color:#f8fafc;padding:20px;">
        <div style="max-width:600px;background:#fff;margin:auto;border-radius:8px;box-shadow:0 4px 10px rgba(0,0,0,0.05);overflow:hidden;">
          <div style="background:#f59e0b;color:#fff;text-align:center;padding:20px;">
            <h2 style="margin:0;">⏳ Temporary Enrollment Granted</h2>
          </div>
          <div style="padding:25px;">
            <p>Dear <strong>${firstname} ${lastname}</strong>,</p>
            
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
              <a href="https://expo.dev/artifacts/eas/n6nwRz1nQCeuyu2KBe2xUH.apk"
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
            <p>Dear <strong>${firstname} ${lastname}</strong>,</p>

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
    await sendEnrollmentEmail(email, subject, message);
    console.log(`📧 Status email sent → ${email} (${status})`);

    // ✅ Final response
    res.json({ message: `✅ Student ${LRN} updated to '${status}'. Email sent.` });

  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).json({ message: "❌ Server Error" });
  }
});



// Add this to your enrolleesRoutes.js
router.get("/check-account/:lrn", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT password FROM student_accounts WHERE LRN = ?",
      [req.params.lrn]
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



export default router;


