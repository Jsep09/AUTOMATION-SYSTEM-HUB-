// เพิ่ม import ที่จำเป็นด้านบน
import { app, BrowserWindow, ipcMain } from "electron";
import { exec } from "child_process";
import * as fs from "fs";
import * as path from "path";

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
try {
  if (require("electron-squirrel-startup")) {
    app.quit();
  }
} catch (e) {
  console.log("Squirrel startup check skipped:", e);
}

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1300,
    height: 1000,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  // Open the DevTools.
  // mainWindow.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on("ready", createWindow);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// --- 1. Helper: Paths & Data Access ---
// --- 1. Helper: Paths & Data Access ---
const SCRIPTS_DIR = path.join(app.getAppPath(), "tests", "bot-scripts");
const METADATA_PATH = path.join(SCRIPTS_DIR, "metadata.json");
const ENVS_PATH = path.join(SCRIPTS_DIR, "envs.json");
const SESSION_META_PATH = path.join(
  app.getAppPath(),
  "playwright",
  ".auth",
  ".session-meta.json",
);

const ensureDir = () => {
  if (!fs.existsSync(SCRIPTS_DIR))
    fs.mkdirSync(SCRIPTS_DIR, { recursive: true });
};

const getSessionPath = (envId: string) => {
  // Store sessions in a dedicated folder
  const SESSION_DIR = path.join(app.getAppPath(), "playwright", ".auth");
  if (!fs.existsSync(SESSION_DIR))
    fs.mkdirSync(SESSION_DIR, { recursive: true });

  // If no envId provided (or legacy), use default user.json
  if (!envId) return path.join(SESSION_DIR, "user.json");

  return path.join(SESSION_DIR, `session_${envId}.json`);
};

const readJson = (filePath: string, defaultValue: any) => {
  if (!fs.existsSync(filePath)) return defaultValue;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (e) {
    return defaultValue;
  }
};

const writeJson = (filePath: string, data: any) => {
  ensureDir();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
};

// --- Session Expiration Helpers ---
const SESSION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

const getSessionMeta = (): { [envId: string]: number } => {
  if (!fs.existsSync(SESSION_META_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(SESSION_META_PATH, "utf-8"));
  } catch (e) {
    return {};
  }
};

const saveSessionMeta = (envId: string, timestamp: number) => {
  const meta = getSessionMeta();
  meta[envId] = timestamp;
  const dir = path.dirname(SESSION_META_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SESSION_META_PATH, JSON.stringify(meta, null, 2));
};

const isSessionExpired = (envId: string): boolean => {
  const meta = getSessionMeta();
  const loginTime = meta[envId];
  if (!loginTime) return true; // No login record = expired

  const now = Date.now();
  const elapsed = now - loginTime;
  return elapsed > SESSION_TIMEOUT_MS;
};

const deleteExpiredSession = (envId: string) => {
  const sessionPath = getSessionPath(envId);
  if (fs.existsSync(sessionPath)) {
    fs.unlinkSync(sessionPath);
  }

  // Remove from metadata
  const meta = getSessionMeta();
  delete meta[envId];
  fs.writeFileSync(SESSION_META_PATH, JSON.stringify(meta, null, 2));
};

// --- 2. IPC Handlers ---

// Run Playwright
ipcMain.handle(
  "run-playwright",
  async (event, { fileName, projectName, envId, headless }) => {
    return new Promise((resolve) => {
      // 1. Get Environment Variables for the specific Env ID
      const profiles = readJson(ENVS_PATH, []);
      const profile = profiles.find((p: any) => p.id === envId);

      // Default to empty if not found, or use the found profile's variables
      const envVars = profile ? profile.variables : {};

      console.log(
        `Using Environment Profile: ${profile ? profile.name : "None"} (${envId})`,
      );

      // Determine Session Path
      const sessionPath = getSessionPath(envId);
      console.log(`Session Path: ${sessionPath}`);

      // --- CHECK SESSION BEFORE RUNNING TEST ---
      const isSetup = projectName === "setup";

      if (!isSetup && !fs.existsSync(sessionPath)) {
        console.log("❌ Session file not found. Blocking execution.");
        return resolve({
          success: false,
          log: "MISSING_SESSION_ERROR", // Special code for Frontend to handle
        });
      }

      // Check if session is expired (5 minutes)
      if (!isSetup && isSessionExpired(envId)) {
        console.log("❌ Session expired (> 5 minutes). Deleting session.");
        deleteExpiredSession(envId);
        return resolve({
          success: false,
          log: "SESSION_EXPIRED_ERROR", // Special code for Frontend to handle
        });
      }
      // -----------------------------------------

      // 2. Construct command
      let commandLine = "";
      if (isSetup) {
        commandLine = `npx playwright test --project=setup`;
      } else {
        const normalizedPath = fileName
          ? `tests/bot-scripts/${fileName}`.replace(/\\/g, "/")
          : "";
        commandLine = `npx playwright test ${normalizedPath} --project=ba-tests --headed`;
      }

      // Add Headless flag if requested
      if (headless) {
         // Actually, my previous logic forced --headed.
         // Let's rewrite strictly:
         if (commandLine.includes("--headed")) {
            commandLine = commandLine.replace("--headed", "");
         }
      }

      // Get Start URL from metadata if fileName is provided
      let startUrl = "";
      if (fileName) {
        const metadata = readJson(METADATA_PATH, {});
        const scriptMeta = metadata[fileName];
        startUrl = scriptMeta?.startUrl || "";
        if (startUrl) {
          console.log(`Start URL: ${startUrl}`);
        }
      }

      // Inject STORAGE_STATE and START_URL so playwright.config.ts can use it
      const envWithSession = {
        ...process.env,
        ...envVars,
        STORAGE_STATE: sessionPath,
        START_URL: startUrl, // Pass custom start URL to Playwright
        HEADLESS_MODE: headless ? "true" : "false", // Control headless mode via env var
      };

      console.log(`Executing: ${commandLine}`);
      event.sender.send('playwright-log', `\n> ${commandLine}\n`); // Echo command

      // 3. EXECUTE with Streaming
      const child = exec(commandLine, { env: envWithSession, cwd: app.getAppPath() });

      let fullLog = "";

      // Stream stdout
      child.stdout?.on('data', (data) => {
        const text = data.toString();
        fullLog += text;
        event.sender.send('playwright-log', text);
      });

      // Stream stderr
      child.stderr?.on('data', (data) => {
        const text = data.toString();
        fullLog += text;
        event.sender.send('playwright-log', text);
      });

      // Handle Exit
      child.on('close', (code) => {
        // Save timestamp on successful login
        if (code === 0 && isSetup) {
           console.log("✅ Login successful. Saving session timestamp.");
           saveSessionMeta(envId, Date.now());
        }

        resolve({ success: code === 0, log: fullLog });
      });
      
      child.on('error', (err) => {
         const errText = `Failed to start process: ${err.message}`;
         fullLog += errText;
         event.sender.send('playwright-log', errText);
         resolve({ success: false, log: fullLog });
      });
    });
  },
);

// Check Login Status
ipcMain.handle("get-session-status", async (event, envId) => {
  const sessionPath = getSessionPath(envId);
  const sessionExists = fs.existsSync(sessionPath);

  if (!sessionExists) {
    return { isLoggedIn: false, expiresIn: 0, loginTime: null };
  }

  const meta = getSessionMeta();
  const loginTime = meta[envId];

  if (!loginTime) {
    return { isLoggedIn: false, expiresIn: 0, loginTime: null };
  }

  const now = Date.now();
  const elapsed = now - loginTime;
  const remaining = SESSION_TIMEOUT_MS - elapsed;

  return {
    isLoggedIn: remaining > 0,
    expiresIn: Math.max(0, remaining),
    loginTime: loginTime,
  };
});

// Logout (Delete Session)
ipcMain.handle("logout", async (event, envId) => {
  const sessionPath = getSessionPath(envId);
  if (fs.existsSync(sessionPath)) {
    fs.unlinkSync(sessionPath);
  }
  return { success: true };
});

// Read Script Content
ipcMain.handle("read-script", async (event, { fileName }) => {
  const filePath = path.join(SCRIPTS_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    return { success: false, content: "" };
  }
  const content = fs.readFileSync(filePath, "utf-8");
  return { success: true, content };
});

// Save Script & Metadata
ipcMain.handle(
  "save-script",
  async (event, { fileName, content, category, startUrl }) => {
    ensureDir();

    // 1. Write File
    const filePath = path.join(SCRIPTS_DIR, `${fileName}.spec.ts`);
    fs.writeFileSync(filePath, content);

    // 2. Update Metadata
    const metadata = readJson(METADATA_PATH, {});
    metadata[`${fileName}.spec.ts`] = {
      category,
      startUrl: startUrl || "", // Store start URL
    };
    writeJson(METADATA_PATH, metadata);

    return { success: true };
  },
);

// Delete Script
ipcMain.handle("delete-script", async (event, { fileName }) => {
  const filePath = path.join(SCRIPTS_DIR, fileName); // fileName likely includes .spec.ts or we append it.
  // IMPORTANT: The frontend sends the full filename from getScripts which includes extension.
  // But let's check: getScripts returns 'test_01.spec.ts'.

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  // Update Metadata
  const metadata = readJson(METADATA_PATH, {});
  if (metadata[fileName]) {
    delete metadata[fileName];
    writeJson(METADATA_PATH, metadata);
  }

  return { success: true };
});

// Get Scripts with Metadata
ipcMain.handle("get-scripts", async () => {
  if (!fs.existsSync(SCRIPTS_DIR)) return [];

  const files = fs
    .readdirSync(SCRIPTS_DIR)
    .filter((f) => f.endsWith(".spec.ts"));
  const metadata = readJson(METADATA_PATH, {});

  return files.map((file) => ({
    name: file,
    // category here now refers to the 'envId'
    category: metadata[file]?.category || "",
  }));
});

// --- New: Environment Management (Profiles) ---

ipcMain.handle("get-envs", async () => {
  const data = readJson(ENVS_PATH, []);

  // Migration Check: If data has old format (array of {key, url} instead of Profile)
  // We check if the first item has 'key' and NO 'variables'
  if (
    Array.isArray(data) &&
    data.length > 0 &&
    "key" in data[0] &&
    !("variables" in data[0])
  ) {
    console.log("Migrating legacy envs.json to new Profile format...");

    // Convert old list to a "Legacy Profile"
    const legacyVariables: { [key: string]: string } = {};
    data.forEach((item: any) => {
      if (item.key && item.url) {
        legacyVariables[item.key] = item.url;
      }
    });

    const newProfile = {
      id: "env_legacy",
      name: "Legacy Migration",
      variables: legacyVariables,
    };

    // Save new format
    writeJson(ENVS_PATH, [newProfile]);
    return [newProfile];
  }

  return data;
});

ipcMain.handle("save-envs", async (event, envs) => {
  writeJson(ENVS_PATH, envs);
  return { success: true };
});

// --- Magic Recorder ---
ipcMain.handle("record-script", async (event, { envId, url }) => {
  return new Promise((resolve) => {
    // 1. Determine Session
    const sessionPath = getSessionPath(envId);
    const hasSession = fs.existsSync(sessionPath);

    // 2. Prepare Temp Output File
    const tempFile = path.join(app.getAppPath(), `temp_record_${Date.now()}.ts`);

    // 3. Construct Command
    let command = `npx playwright codegen -o "${tempFile}"`;
    
    if (hasSession) {
      console.log(`Recorder: Loading session from ${sessionPath}`);
      command += ` --load-storage="${sessionPath}"`;
    }

    if (url) {
      command += ` "${url}"`;
    }

    console.log(`Recorder Executing: ${command}`);

    // 4. Run Codegen
    exec(command, { cwd: app.getAppPath(), env: process.env }, (error, stdout, stderr) => {
      if (error) {
        console.error("Recorder Error:", error);
        // Don't return yet, sometimes codegen exits with code but still produces output? 
        // Actually playwright codegen usually exits cleanly.
        // If error code is present, it might be command not found.
      }

      // 5. On Close: Read the file
      if (fs.existsSync(tempFile)) {
        try {
          const content = fs.readFileSync(tempFile, 'utf-8');
          fs.unlinkSync(tempFile); // Cleanup
          resolve({ success: true, content });
        } catch (readError: any) {
          resolve({ success: false, content: '', error: `Failed to read recording: ${readError.message}` });
        }
      } else {
        // User closed without generating file or error
        // Check if there was an exec error
        if (error) {
           resolve({ success: false, content: '', error: `Process Error: ${error.message} \n ${stderr}` });
        } else {
           resolve({ success: false, content: '', error: 'No recording generated (or closed instantly).' });
        }
      }
    });
  });
});
