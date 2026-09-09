'use strict';

const { app, BrowserWindow, dialog, shell } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');

// Avoid GPU process crashes on some Windows machines (exit_code 0xC0000409).
app.disableHardwareAcceleration();

const LOG_FILE = path.join(app.getPath('temp'), 'rie-electron.log');
function log(msg) {
  try {
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`);
  } catch (_) { /* ignore */ }
}

const ROOT = path.resolve(__dirname, '..');
const SPLASH_URL = path.join(__dirname, 'splash.html');
const NEXT_URL = 'http://127.0.0.1:3000';
const START_TIMEOUT_MS = 60000;
const POLL_INTERVAL_MS = 500;

const isDev = !app.isPackaged;
// npm start runs package.json "start" without the app being packaged.
const isDevServerMode = process.env.ELECTRON_DEV === '1';

// Where the Next.js standalone server lives. In dev it is the repo's built
// `dashboard/.next/standalone`; when packaged it lands in `resources/dashboard`
// (see electron-builder extraResources).
function resolveServerPaths() {
  if (isDev) {
    const dashboard = path.join(ROOT, 'dashboard');
    return {
      dashboardDir: dashboard,
      standaloneDir: path.join(dashboard, '.next', 'standalone'),
      serverFile: path.join(dashboard, '.next', 'standalone', 'server.js'),
    };
  }
  const dashboard = path.join(process.resourcesPath, 'dashboard');
  return {
    dashboardDir: dashboard,
    standaloneDir: dashboard,
    serverFile: path.join(dashboard, 'server.js'),
  };
}

let splashWindow = null;
let mainWindow = null;
let apiChild = null;
let nextChild = null;
let quitting = false;

function isPortReady(port, host, pathName) {
  return new Promise((resolve) => {
    const req = http.get(
      { host: host || '127.0.0.1', port, path: pathName || '/', timeout: 2000 },
      (res) => {
        res.resume();
        if (res.statusCode < 500) resolve(true);
        else resolve(false);
      }
    );
    req.on('error', (e) => {
      log('probe ' + host + ':' + port + pathName + ' error ' + e.code);
      resolve(false);
    });
    req.on('timeout', () => {
      log('probe ' + host + ':' + port + pathName + ' TIMEOUT');
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForServers(timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const apiReady = await isPortReady(8000, '127.0.0.1', '/health');
    const nextReady = await isPortReady(3000, '127.0.0.1', '/');
    if (apiReady && nextReady) {
      return true;
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return false;
}

async function waitForApi(timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isPortReady(8000, '127.0.0.1', '/health')) {
      return true;
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return false;
}

function spawnHidden(command, args, options) {
  // On Windows, .bat/.cmd files cannot be spawned directly with child_process.spawn.
  // Route them through cmd.exe /c so `conda`/`npm` work.
  let file = command;
  let cmdArgs = args;
  if (process.platform === 'win32' && /\.(bat|cmd)$/i.test(command)) {
    file = 'cmd.exe';
    cmdArgs = ['/c', command].concat(args);
  }
  const opts = Object.assign({}, options, {
    windowsHide: true,
    stdio: 'ignore',
    detached: true,
  });
  log('spawn: ' + file + ' ' + JSON.stringify(cmdArgs));
  const child = spawn(file, cmdArgs, opts);
  child.on('error', (err) => {
    log('spawn error for ' + command + ': ' + err.message);
    if (!quitting) {
      console.error('[electron] failed to spawn:', command, err.message);
    }
  });
  child.on('exit', (code, signal) => {
    log('child exited: ' + command + ' code=' + code + ' signal=' + signal);
  });
  return child;
}

function startApiServer() {
  // Avoid spawning a duplicate when an instance is already serving :8000.
  if (apiChild) return apiChild;
  return isPortReady(8000, '127.0.0.1', '/health').then((up) => {
    if (up) {
      log('FastAPI already running on :8000 - not spawning');
      return null;
    }
    log('starting FastAPI via conda');
    const args = ['run', '-n', 'DM_ENV', 'uvicorn', 'api.main:app', '--port', '8000', '--no-access-log'];
    apiChild = spawnHidden('conda', args, { cwd: ROOT });
    return apiChild;
  });
}

function startNextServer() {
  const node = process.env.ELECTRON_NODE || 'node';
  const { standaloneDir, serverFile } = resolveServerPaths();
  nextChild = spawnHidden(node, [serverFile], {
    cwd: standaloneDir,
    env: Object.assign({}, process.env, { PORT: '3000', HOSTNAME: '127.0.0.1' }),
  });
  return nextChild;
}

function killChild(child) {
  if (!child || !child.pid) return;
  log('killChild pid=' + child.pid);
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    } else {
      child.kill('SIGTERM');
    }
  } catch (_) {
    /* ignore */
  }
}

function killServers() {
  killChild(apiChild);
  killChild(nextChild);
  apiChild = null;
  nextChild = null;
}

function showErrorAndQuit() {
  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.destroy();
  dialog
    .showMessageBox({
      type: 'error',
      title: 'RIE Intelligence',
      message: 'Impossible de démarrer le système.',
      detail: 'Vérifiez que les ports 3000 et 8000 sont libres.',
      buttons: ['OK'],
    })
    .then(() => {
      killServers();
      app.quit();
    });
}

function createSplash() {
  splashWindow = new BrowserWindow({
    width: 520,
    height: 360,
    frame: false,
    resizable: false,
    show: true,
    backgroundColor: '#003C28',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  splashWindow.loadFile(SPLASH_URL);
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'RIE Intelligence — BNP Paribas El Djazaïr',
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#003C28',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.maximize();

  let loadTries = 0;
  const loadDashboard = () => {
    loadTries += 1;
    log('loadURL /dashboard attempt ' + loadTries);
    mainWindow.loadURL(NEXT_URL + '/dashboard');
  };
  loadDashboard();

  // Next.js dev compiles /dashboard on first request (can take 20-40s).
  // Force the branded window visible shortly after load starts so the app
  // never looks frozen behind an invisible window.
  const forceShowTimer = setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      log('force-show main window');
      mainWindow.show();
    }
  }, 15000);

  mainWindow.webContents.on('ready-to-show', () => {
    clearTimeout(forceShowTimer);
    mainWindow.show();
  });

  mainWindow.webContents.on('did-finish-load', () => {
    log('dashboard did-finish-load');
  });

  mainWindow.webContents.on('did-fail-load', (event, code, desc, url) => {
    // Next.js may still be warming up; retry a few times.
    if (loadTries < 10 && /ERR_CONNECTION_REFUSED|ERR_SOCKET|ERR_CONNECTION/.test(desc)) {
      log('load failed (' + desc + '), retrying');
      setTimeout(loadDashboard, 1500);
    } else if (url && url.indexOf(NEXT_URL) === 0) {
      log('load failed final: ' + desc);
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const nextOrigin = NEXT_URL;
    if (url.indexOf(nextOrigin) === 0) return;
    if (/^https?:/i.test(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (!quitting) app.quit();
  });
}

async function boot() {
  const devMode = isDev || isDevServerMode;
  log('boot() starting, devMode=' + devMode);

  createSplash();

  if (!devMode) {
    log('prod mode: starting Next.js + FastAPI');
    startNextServer();
    await startApiServer();
    const ok = await waitForServers(START_TIMEOUT_MS);
    log('waitForServers -> ' + ok);
    if (!ok) return showErrorAndQuit();
  } else {
    // Dev mode: FastAPI + Next.js are started by start-dev.ps1 (or the user).
    // Electron ONLY waits for them; it must not spawn duplicates (port conflict).
    log('dev mode: waiting for FastAPI (started externally)');
    const ok = await waitForApi(START_TIMEOUT_MS);
    log('waitForApi -> ' + ok);
    if (!ok) return showErrorAndQuit();
  }

  log('creating main window');
  createMainWindow();

  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.destroy();
    splashWindow = null;
  }
}

app.on('window-all-closed', () => {
  log('window-all-closed -> app.quit()');
  app.quit();
});

app.on('before-quit', () => {
  log('before-quit: killing servers');
  quitting = true;
  killServers();
});

app.on('will-quit', () => {
  log('will-quit: killing servers (fallback)');
  killServers();
});

app.whenReady().then(boot);
