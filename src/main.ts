// เพิ่ม import ที่จำเป็นด้านบน
import { app, BrowserWindow, ipcMain } from 'electron';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  // Open the DevTools.
  // mainWindow.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// --- 1. Helper: Paths & Data Access ---
// --- 1. Helper: Paths & Data Access ---
const SCRIPTS_DIR = path.join(app.getAppPath(), 'tests', 'bot-scripts');
const METADATA_PATH = path.join(SCRIPTS_DIR, 'metadata.json');
const ENVS_PATH = path.join(SCRIPTS_DIR, 'envs.json');

const ensureDir = () => {
  if (!fs.existsSync(SCRIPTS_DIR)) fs.mkdirSync(SCRIPTS_DIR, { recursive: true });
};

const getSessionPath = (envId: string) => {
  // Store sessions in a dedicated folder
  const SESSION_DIR = path.join(app.getAppPath(), 'playwright', '.auth');
  if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
  
  // If no envId provided (or legacy), use default user.json
  if (!envId) return path.join(SESSION_DIR, 'user.json');
  
  return path.join(SESSION_DIR, `session_${envId}.json`);
};

const readJson = (filePath: string, defaultValue: any) => {
  if (!fs.existsSync(filePath)) return defaultValue;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    return defaultValue;
  }
};

const writeJson = (filePath: string, data: any) => {
  ensureDir();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
};

// --- 2. IPC Handlers ---

// Run Playwright
ipcMain.handle('run-playwright', async (event, { fileName, projectName, envId }) => {
  return new Promise((resolve) => {
    // 1. Get Environment Variables for the specific Env ID
    const profiles = readJson(ENVS_PATH, []);
    const profile = profiles.find((p: any) => p.id === envId);
    
    // Default to empty if not found, or use the found profile's variables
    const envVars = profile ? profile.variables : {};

    console.log(`Using Environment Profile: ${profile ? profile.name : 'None'} (${envId})`);

    // Determine Session Path
    const sessionPath = getSessionPath(envId);
    console.log(`Session Path: ${sessionPath}`);

    // --- CHECK SESSION BEFORE RUNNING TEST ---
    const isSetup = projectName === 'setup';
    
    if (!isSetup && !fs.existsSync(sessionPath)) {
      console.log('❌ Session file not found. Blocking execution.');
      return resolve({ 
        success: false, 
        log: "MISSING_SESSION_ERROR" // Special code for Frontend to handle
      });
    }
    // -----------------------------------------

    // 2. Construct command
    let command;
    const projectFlag = projectName ? `--project=${projectName}` : '--project=ba-tests';
    
    if (fileName) {
        // Run specific script
        const scriptPath = path.join('tests', 'bot-scripts', fileName); 
        command = `npx playwright test "${scriptPath}" ${projectFlag}`;
    } else {
        // Run all (or setup)
        command = `npx playwright test ${projectFlag}`;
    }
    
    console.log(`Executing: ${command}`);

    // Inject STORAGE_STATE so playwright.config.ts can use it
    const envWithSession = { 
        ...process.env, 
        ...envVars,
        STORAGE_STATE: sessionPath 
    };

    exec(command, { 
      env: envWithSession, // Inject Profile variables + Session Path
      cwd: app.getAppPath() 
    }, (error, stdout, stderr) => {
      resolve({ success: !error, log: stdout || stderr });
    });
  });
});

// Check Login Status
ipcMain.handle('get-session-status', async (event, envId) => {
  const sessionPath = getSessionPath(envId);
  return { isLoggedIn: fs.existsSync(sessionPath) };
});

// Logout (Delete Session)
ipcMain.handle('logout', async (event, envId) => {
  const sessionPath = getSessionPath(envId);
  if (fs.existsSync(sessionPath)) {
    fs.unlinkSync(sessionPath);
  }
  return { success: true };
});

// Read Script Content
ipcMain.handle('read-script', async (event, { fileName }) => {
  const filePath = path.join(SCRIPTS_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    return { success: false, content: '' };
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  return { success: true, content };
});

// Save Script & Metadata
ipcMain.handle('save-script', async (event, { fileName, content, category }) => {
  ensureDir();
  
  // 1. Write File
  const filePath = path.join(SCRIPTS_DIR, `${fileName}.spec.ts`);
  fs.writeFileSync(filePath, content);

  // 2. Update Metadata
  const metadata = readJson(METADATA_PATH, {});
  metadata[`${fileName}.spec.ts`] = { category };
  writeJson(METADATA_PATH, metadata);

  return { success: true };
});

// Delete Script
ipcMain.handle('delete-script', async (event, { fileName }) => {
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
ipcMain.handle('get-scripts', async () => {
  if (!fs.existsSync(SCRIPTS_DIR)) return [];
  
  const files = fs.readdirSync(SCRIPTS_DIR).filter(f => f.endsWith('.spec.ts'));
  const metadata = readJson(METADATA_PATH, {});

  return files.map(file => ({
    name: file,
    // category here now refers to the 'envId'
    category: metadata[file]?.category || '' 
  }));
});

// --- New: Environment Management (Profiles) ---

ipcMain.handle('get-envs', async () => {
  const data = readJson(ENVS_PATH, []);
  
  // Migration Check: If data has old format (array of {key, url} instead of Profile)
  // We check if the first item has 'key' and NO 'variables'
  if (Array.isArray(data) && data.length > 0 && 'key' in data[0] && !('variables' in data[0])) {
    console.log("Migrating legacy envs.json to new Profile format...");
    
    // Convert old list to a "Legacy Profile"
    const legacyVariables: { [key: string]: string } = {};
    data.forEach((item: any) => {
      if (item.key && item.url) {
        legacyVariables[item.key] = item.url;
      }
    });

    const newProfile = {
      id: 'env_legacy',
      name: 'Legacy Migration',
      variables: legacyVariables
    };
    
    // Save new format
    writeJson(ENVS_PATH, [newProfile]);
    return [newProfile];
  }

  return data;
});

ipcMain.handle('save-envs', async (event, envs) => {
  writeJson(ENVS_PATH, envs);
  return { success: true };
});