const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

let mainWindow;
let pythonProcess;
let backendPort = 0;

function findFreePort() {
  return new Promise((resolve) => {
    const server = http.createServer();
    server.listen(0, () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

async function startPythonBackend() {
  backendPort = await findFreePort();
  const backendPath = path.join(__dirname, '..', 'backend', 'server.py');

  if (!fs.existsSync(backendPath)) {
    console.warn('Python backend not found at', backendPath);
    return;
  }

  // Prefer the project venv interpreter so the backend always has its deps,
  // regardless of the launching shell's PATH. Fall back to system python3.
  const venvPython = path.join(__dirname, '..', '.venv', 'bin', 'python');
  const pythonCmd = fs.existsSync(venvPython) ? venvPython : 'python3';

  pythonProcess = spawn(pythonCmd, [backendPath, '--port', String(backendPort)], {
    cwd: path.join(__dirname, '..', 'backend'),
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  pythonProcess.stdout.on('data', (data) => {
    console.log(`[backend] ${data}`);
  });

  pythonProcess.stderr.on('data', (data) => {
    console.error(`[backend] ${data}`);
  });

  pythonProcess.on('close', (code) => {
    console.log(`[backend] exited with code ${code}`);
    pythonProcess = null;
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'loidnet',
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.setMenuBarVisibility(false);

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(async () => {
  await startPythonBackend();
  createWindow();
});

app.on('window-all-closed', () => {
  if (pythonProcess) {
    pythonProcess.kill();
  }
  app.quit();
});

app.on('before-quit', () => {
  if (pythonProcess) {
    pythonProcess.kill();
  }
});

ipcMain.handle('get-backend-port', () => backendPort);

ipcMain.handle('save-project', async (event, projectData) => {
  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    filters: [{ name: 'loidnet Project', extensions: ['loid'] }],
  });
  if (filePath) {
    fs.writeFileSync(filePath, JSON.stringify(projectData, null, 2));
    return filePath;
  }
  return null;
});

ipcMain.handle('open-project', async () => {
  const { filePaths } = await dialog.showOpenDialog(mainWindow, {
    filters: [{ name: 'loidnet Project', extensions: ['loid'] }],
    properties: ['openFile'],
  });
  if (filePaths.length > 0) {
    const data = fs.readFileSync(filePaths[0], 'utf-8');
    return JSON.parse(data);
  }
  return null;
});

ipcMain.handle('export-wav', async (event, wavBuffer) => {
  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    filters: [{ name: 'WAV Audio', extensions: ['wav'] }],
  });
  if (filePath) {
    fs.writeFileSync(filePath, Buffer.from(wavBuffer));
    return filePath;
  }
  return null;
});
