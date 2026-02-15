import express from "express";
import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "../config/cloudinary.js";
import db from "../models/db.js";
import { verifyAdmin } from "../middleware/auth.js"; // ✅ ADD THIS

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
   🟢 CREATE ANNOUNCEMENT (PROTECTED)
============================= */
router.post("/", verifyAdmin, upload.single("image"), async (req, res) => {
  try {
    const {
      title,
      short_description,
      message,
      category = "General",
      status = "active",
      publish_date,
      expire_date,
      is_featured = false,
    } = req.body;

    const image = req.file ? req.file.path : null;

    if (!title || !message) {
      return res.status(400).json({
        success: false,
        message: "Title and message are required.",
      });
    }

    const [result] = await db.query(
      `INSERT INTO announcements 
        (title, short_description, message, category, image, status, publish_date, expire_date, is_featured)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title,
        short_description || null,
        message,
        category,
        image,
        status,
        publish_date || new Date(),
        expire_date || null,
        is_featured ? 1 : 0,
      ]
    );

    res.json({
      success: true,
      message: "Announcement created successfully.",
      data: { id: result.insertId },
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
       LIMIT 10`
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

    if (!rows.length) {
      return res.status(404).json({ message: "Announcement not found." });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error("❌ Error fetching announcement:", err);
    res.status(500).json({ message: "Server error." });
  }
});

/* =============================
   🟠 UPDATE ANNOUNCEMENT (PROTECTED + SAFE UPDATE)
============================= */
router.put("/:id", verifyAdmin, upload.single("image"), async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await db.query(
      "SELECT * FROM announcements WHERE id = ?",
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Announcement not found." });
    }

    const existing = rows[0];
    let image = existing.image;

    // If new image uploaded, delete old one
    if (req.file) {
      if (image) {
        const match = image.match(/announcements\/([^/.]+)/);
        if (match) {
          await cloudinary.uploader.destroy(`announcements/${match[1]}`);
        }
      }
      image = req.file.path;
    }

    const updatedData = {
      title: req.body.title ?? existing.title,
      short_description:
        req.body.short_description ?? existing.short_description,
      message: req.body.message ?? existing.message,
      category: req.body.category ?? existing.category,
      status: req.body.status ?? existing.status,
      publish_date: req.body.publish_date ?? existing.publish_date,
      expire_date: req.body.expire_date ?? existing.expire_date,
      is_featured:
        req.body.is_featured !== undefined
          ? req.body.is_featured
            ? 1
            : 0
          : existing.is_featured,
      image,
    };

    await db.query(
      `UPDATE announcements 
       SET title = ?, short_description = ?, message = ?, category = ?, 
           image = ?, status = ?, publish_date = ?, expire_date = ?, 
           is_featured = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        updatedData.title,
        updatedData.short_description,
        updatedData.message,
        updatedData.category,
        updatedData.image,
        updatedData.status,
        updatedData.publish_date,
        updatedData.expire_date,
        updatedData.is_featured,
        id,
      ]
    );

    res.json({
      success: true,
      message: "Announcement updated successfully.",
    });
  } catch (err) {
    console.error("❌ Error updating announcement:", err);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

/* =============================
   🔴 DELETE ANNOUNCEMENT (PROTECTED)
============================= */
router.delete("/:id", verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await db.query(
      "SELECT image FROM announcements WHERE id = ?",
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Announcement not found." });
    }

    const image = rows[0].image;

    await db.query("DELETE FROM announcements WHERE id = ?", [id]);

    if (image) {
      const match = image.match(/announcements\/([^/.]+)/);
      if (match) {
        await cloudinary.uploader.destroy(`announcements/${match[1]}`);
      }
    }

    res.json({
      success: true,
      message: "Announcement deleted successfully.",
    });
  } catch (err) {
    console.error("❌ Error deleting announcement:", err);
    res.status(500).json({ message: "Server error." });
  }
});

export default router;
