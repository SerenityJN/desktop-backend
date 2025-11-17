// server.js
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import path from "path";
import cors from "cors";
import bodyParser from "body-parser";
import { fileURLToPath } from "url";

import dashboardRoutes from "./routes/dashboardRoutes.js";
import enrolleesRoutes from "./routes/enrolleesRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import announcementsRoutes from "./routes/announcementRoutes.js"; // ✅ newly added
import strandRoutes from "./routes/strandRoutes.js"; // ✅ newly added
import SecondSemester from "./routes/SecondSemesterRoutes.js";
import FirstSemester from "./routes/FirstSemesterRoutes.js"
import documentRoutes from "./routes/documentRoutes.js"
import exportRoutes from './routes/exportRoutes.js';

const app = express();
const PORT = process.env.PORT || 8000;


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


app.use(cors());
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));


const uploadsPath = path.join(__dirname, "../../Website/enrollment/backend/uploads");
app.use("/uploads", express.static(uploadsPath));
console.log("✅ Serving uploads from:", uploadsPath);


app.use("/api/dashboard", dashboardRoutes);
app.use("/api/enrollees", enrolleesRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/announcements", announcementsRoutes); 
app.use("/api/strands", strandRoutes); 
app.use("/api/SecondSemester", SecondSemester);
app.use("/api/FirstSemester", FirstSemester)
app.use('/api/documents', documentRoutes);
app.use('/api/export', exportRoutes);

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});

