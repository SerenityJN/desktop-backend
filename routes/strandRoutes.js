import express from "express";
import db from "../models/db.js";
const router = express.Router();

// Get all
router.get("/", async (req, res) => {
  try {
    const { rows } = await db.query("SELECT * FROM strands ORDER BY id DESC");
    res.json(rows);
  } catch (error) {
    console.error("Error fetching strands:", error);
    res.status(500).json({ message: "Failed to fetch strands" });
  }
});

// Add
router.post("/", async (req, res) => {
  try {
    const { strand_code, strand_name, description } = req.body;
    
    // Validate required fields
    if (!strand_code || !strand_name) {
      return res.status(400).json({ message: "Strand code and name are required" });
    }

    await db.query(
      "INSERT INTO strands (strand_code, strand_name, description) VALUES ($1, $2, $3)",
      [strand_code, strand_name, description]
    );
    
    res.json({ message: "Strand added successfully" });
  } catch (error) {
    console.error("Error adding strand:", error);
    
    // Check for duplicate key violation (PostgreSQL error code 23505)
    if (error.code === '23505') {
      res.status(400).json({ message: "Strand code already exists" });
    } else {
      res.status(500).json({ message: "Failed to add strand" });
    }
  }
});

// Update
router.put("/:id", async (req, res) => {
  try {
    const { strand_code, strand_name, description } = req.body;
    const { id } = req.params;
    
    // Validate required fields
    if (!strand_code || !strand_name) {
      return res.status(400).json({ message: "Strand code and name are required" });
    }

    const { rowCount } = await db.query(
      "UPDATE strands SET strand_code = $1, strand_name = $2, description = $3 WHERE id = $4",
      [strand_code, strand_name, description, id]
    );

    if (rowCount === 0) {
      return res.status(404).json({ message: "Strand not found" });
    }

    res.json({ message: "Strand updated successfully" });
  } catch (error) {
    console.error("Error updating strand:", error);
    
    // Check for duplicate key violation
    if (error.code === '23505') {
      res.status(400).json({ message: "Strand code already exists" });
    } else {
      res.status(500).json({ message: "Failed to update strand" });
    }
  }
});

// Delete
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    const { rowCount } = await db.query("DELETE FROM strands WHERE id = $1", [id]);

    if (rowCount === 0) {
      return res.status(404).json({ message: "Strand not found" });
    }

    res.json({ message: "Strand deleted successfully" });
  } catch (error) {
    console.error("Error deleting strand:", error);
    
    // Check for foreign key constraint violation (PostgreSQL error code 23503)
    if (error.code === '23503') {
      res.status(400).json({ message: "Cannot delete strand because it is being used by other records" });
    } else {
      res.status(500).json({ message: "Failed to delete strand" });
    }
  }
});

export default router;
