import { app, BrowserWindow } from "electron";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let mainWindow;
let serverProcess;

function startServer() {
  return new Promise((resolve, reject) => {
    // Run your backend server
    serverProcess = spawn("node", ["backend/server.js"], {
      cwd: __dirname, // Ensures the path works correctly
      shell: true,
    });

    serverProcess.stdout.on("data", (data) => {
      console.log(`Server: ${data}`);
      if (data.toString().includes("Server running at")) resolve();
    });

    serverProcess.stderr.on("data", (data) => console.error(`Server Error: ${data}`));
    serverProcess.on("close", (code) => console.log(`Server exited with code ${code}`));
  });
}

async function createWindow() {
  await startServer();

  mainWindow = new BrowserWindow({
    width: 1500,
    height: 1000,
    fullscreen: true,
    frame: true,           // Keep frame but fullscreen
    titleBarStyle: 'hidden', // Hide title bar but keep window controls
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // You can also use `path.join` if you plan to load a local file later
  mainWindow.loadFile(path.join(__dirname, 'build', 'index.html'));
  mainWindow.webContents.openDevTools();
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (serverProcess) serverProcess.kill();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

