// utils/mailer.js
import nodemailer from "nodemailer";

export const sendEmail = async (to, subject, message) => {
  try {
    // Create transporter (use Gmail account)
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "nuarinjerry0@gmail.com", // your Gmail address
        pass: "jzwpasllvnureefu", // use App Password (not your Gmail password)
      },
    });

    // Send the email
    const mailOptions = {
      from: '"Enrollment System" <nuarinjerry0@gmail.com>',
      to,
      subject,
      html: message,
    };

    await transporter.sendMail(mailOptions);
    console.log(`📧 Email sent to ${to}`);
  } catch (err) {
    console.error("❌ Email Error:", err.message);
  }
};
