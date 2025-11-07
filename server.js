// server.js
import dotenv from "dotenv";
dotenv.config();


import express from "express";
import path from "path";
import cors from "cors";
import bodyParser from "body-parser";
import { fileURLToPath } from "url";

// Import route files
import dashboardRoutes from "./routes/dashboardRoutes.js";
import enrolleesRoutes from "./routes/enrolleesRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import announcementsRoutes from "./routes/announcementRoutes.js"; // ✅ newly added
import strandRoutes from "./routes/strandRoutes.js"; // ✅ newly added
import SecondSemester from "./routes/SecondSemesterRoutes.js";

// Configurations

const app = express();
const PORT = process.env.PORT || 8000;

// For handling __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware
app.use(cors());
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ✅ Serve uploaded files
const uploadsPath = path.join(__dirname, "../../Website/enrollment/backend/uploads");
app.use("/uploads", express.static(uploadsPath));
console.log("✅ Serving uploads from:", uploadsPath);

// ✅ Register API routes first
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/enrollees", enrolleesRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/announcements", announcementsRoutes); // ✅ added announcement route
app.use("/api/strands", strandRoutes); // ✅ added announcement route
app.use("/api/SecondSemester", SecondSemester); // ✅ added announcement route


// ✅ Serve frontend files last
app.use(express.static(path.join(__dirname, "../frontend")));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/login.html"));
});

// ✅ Start the server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
