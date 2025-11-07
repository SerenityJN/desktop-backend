import express from "express";
import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "../config/cloudinary.js";
import db from "../models/db.js";

const router = express.Router();

/* =============================
   📦 Multer + Cloudinary Setup
============================= */
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "announcements",
    allowed_formats: ["jpg", "png", "jpeg", "webp"],
    transformation: [{ quality: "auto", fetch_format: "auto" }],
  },
});

const upload = multer({ storage });

/* =============================
   🟢 CREATE ANNOUNCEMENT
============================= */
router.post("/", upload.single("image"), async (req, res) => {
  try {
    const {
      title,
      short_description,
      message,
      category = "General",
      status = "active",
      publish_date,
      expire_date,
    } = req.body;

    const image = req.file ? req.file.path : null;

    if (!title || !message) {
      return res
        .status(400)
        .json({ success: false, message: "Title and message are required." });
    }

    const [result] = await db.query(
      `INSERT INTO announcements 
        (title, short_description, message, category, image, status, publish_date, expire_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title,
        short_description || null,
        message,
        category,
        image,
        status,
        publish_date || new Date(),
        expire_date || null,
      ]
    );

    res.json({
      success: true,
      message: "Announcement created successfully.",
      data: {
        id: result.insertId,
        title,
        short_description,
        message,
        category,
        image,
        status,
      },
    });
  } catch (err) {
    console.error("❌ Error creating announcement:", err);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

/* =============================
   🔵 GET ALL ANNOUNCEMENTS
============================= */
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM announcements ORDER BY publish_date DESC"
    );
    res.json(rows);
  } catch (err) {
    console.error("❌ Error fetching announcements:", err);
    res.status(500).json({ message: "Server error." });
  }
});

/* =============================
   🟣 GET ACTIVE / LATEST ANNOUNCEMENTS
============================= */
router.get("/latest", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT * FROM announcements 
       WHERE status = 'active' 
       ORDER BY publish_date DESC 
       LIMIT 3`
    );
    res.json(rows);
  } catch (err) {
    console.error("❌ Error fetching latest announcements:", err);
    res.status(500).json({ message: "Server error." });
  }
});

/* =============================
   🟡 GET SINGLE ANNOUNCEMENT
============================= */
router.get("/:id", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM announcements WHERE id = ?",
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Announcement not found." });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error("❌ Error fetching announcement:", err);
    res.status(500).json({ message: "Server error." });
  }
});

/* =============================
   🟠 UPDATE ANNOUNCEMENT
============================= */
router.put("/:id", upload.single("image"), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      short_description,
      message,
      category,
      status,
      publish_date,
      expire_date,
    } = req.body;

    // Fetch existing record
    const [existing] = await db.query(
      "SELECT image FROM announcements WHERE id = ?",
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ message: "Announcement not found." });
    }

    let image = existing[0].image;

    // If new image uploaded, replace old one
    if (req.file) {
      if (image) {
        const match = image.match(/announcements\/([^/.]+)/);
        if (match) {
          const publicId = `announcements/${match[1]}`;
          await cloudinary.uploader.destroy(publicId);
        }
      }
      image = req.file.path;
    }

    await db.query(
      `UPDATE announcements 
       SET title = ?, short_description = ?, message = ?, category = ?, 
           image = ?, status = ?, publish_date = ?, expire_date = ?, 
           updated_at = NOW()
       WHERE id = ?`,
      [
        title,
        short_description,
        message,
        category,
        image,
        status,
        publish_date,
        expire_date,
        id,
      ]
    );

    res.json({ success: true, message: "Announcement updated successfully." });
  } catch (err) {
    console.error("❌ Error updating announcement:", err);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

/* =============================
   🔴 DELETE ANNOUNCEMENT
============================= */
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await db.query(
      "SELECT image FROM announcements WHERE id = ?",
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Announcement not found." });
    }

    const image = rows[0].image;

    await db.query("DELETE FROM announcements WHERE id = ?", [id]);

    // Delete from Cloudinary
    if (image) {
      const match = image.match(/announcements\/([^/.]+)/);
      if (match) {
        const publicId = `announcements/${match[1]}`;
        await cloudinary.uploader.destroy(publicId);
        console.log(`🧹 Deleted image from Cloudinary: ${publicId}`);
      }
    }

    res.json({ success: true, message: "Announcement deleted successfully." });
  } catch (err) {
    console.error("❌ Error deleting announcement:", err);
    res.status(500).json({ message: "Server error." });
  }
});

export default router;
