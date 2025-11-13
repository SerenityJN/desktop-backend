import express from "express";
import db from "../models/db.js";
const router = express.Router();

// Get all
router.get("/", async (req, res) => {
  const [rows] = await db.query("SELECT * FROM strands ORDER BY id DESC");
  res.json(rows);
});

// Add
router.post("/", async (req, res) => {
  const { strand_code, strand_name, description } = req.body;
  await db.query("INSERT INTO strands (strand_code, strand_name, description) VALUES (?, ?, ?)", [strand_code, strand_name, description]);
  res.json({ message: "Strand added" });
});

// Update
router.put("/:id", async (req, res) => {
  const { strand_code, strand_name, description } = req.body;
  await db.query("UPDATE strands SET strand_code=?, strand_name=?, description=? WHERE id=?", [strand_code, strand_name, description, req.params.id]);
  res.json({ message: "Strand updated" });
});

// Delete
router.delete("/:id", async (req, res) => {
  await db.query("DELETE FROM strands WHERE id=?", [req.params.id]);
  res.json({ message: "Strand deleted" });
});

export default router;
