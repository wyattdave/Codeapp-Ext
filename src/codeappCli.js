const vscode = require('vscode');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let sCachedCliRoot = null;
let bDependenciesEnsured = false;

function getCodeAppCliRoot() {
  if (sCachedCliRoot) {
    return sCachedCliRoot;
  }

  /* Bundled CLI lives next to the extension's src/ folder. */
  let sCliRoot = path.resolve(__dirname, '..', 'codeapp-cli');
  sCachedCliRoot = sCliRoot;
  return sCachedCliRoot;
}

function getCodeAppCliEntry() {
  return path.join(getCodeAppCliRoot(), 'bin', 'codeapp.js');
}

function getCodeAppCliNodeModules() {
  return path.join(getCodeAppCliRoot(), 'node_modules');
}

function isCodeAppCliInstalled() {
  let sCliEntry = getCodeAppCliEntry();
  return fs.existsSync(sCliEntry) && fs.existsSync(getCodeAppCliNodeModules());
}

/* Build the shell-safe command string used to invoke the CLI from a terminal. */
function getCodeAppCliCommand() {
  let sCliEntry = getCodeAppCliEntry();
  return 'node "' + sCliEntry + '"';
}

function getWorkspaceRoot() {
  let aFolders = vscode.workspace.workspaceFolders;
  if (aFolders && aFolders.length > 0) {
    return aFolders[0].uri.fsPath;
  }
  return process.cwd();
}

function isCliOutputError(sOutput) {
  if (!sOutput) {
    return false;
  }

  let sNormalized = String(sOutput);
  return new RegExp('(^|\\n)Error:\\s', 'i').test(sNormalized);
}

function runCodeAppCommand(sCommand, oOptions = {}) {
  let sCliEntry = getCodeAppCliEntry();
  let sFullCommand = 'node "' + sCliEntry + '" ' + sCommand;
  let sCommandCwd = oOptions.cwd || getWorkspaceRoot();

  return new Promise((resolve, reject) => {
    let sStdout = '';
    let sStderr = '';
    let bSettled = false;
    let bCancelled = false;

    let oProcess = spawn(sFullCommand, [], {
      cwd: sCommandCwd,
      shell: true,
      env: process.env,
      windowsHide: true
    });

    let fnCancelProcess = () => {
      if (bSettled || bCancelled) {
        return;
      }
      bCancelled = true;
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(oProcess.pid), '/t', '/f'], { windowsHide: true });
        return;
      }
      oProcess.kill('SIGTERM');
    };

    if (oOptions.oCancellationState) {
      oOptions.oCancellationState.fnCancelActiveProcess = fnCancelProcess;
      if (oOptions.oCancellationState.bCancelled) {
        fnCancelProcess();
      }
    }

    oProcess.stdout.on('data', (oChunk) => {
      let sChunk = oChunk.toString();
      sStdout += sChunk;
      if (typeof oOptions.onStdout === 'function') {
        oOptions.onStdout(sChunk);
      }
    });

    oProcess.stderr.on('data', (oChunk) => {
      let sChunk = oChunk.toString();
      sStderr += sChunk;
      if (typeof oOptions.onStderr === 'function') {
        oOptions.onStderr(sChunk);
      }
    });

    oProcess.on('error', (oError) => {
      bSettled = true;
      if (oOptions.oCancellationState && oOptions.oCancellationState.fnCancelActiveProcess === fnCancelProcess) {
        oOptions.oCancellationState.fnCancelActiveProcess = null;
      }
      reject(oError.message);
    });

    oProcess.on('close', (iCode) => {
      bSettled = true;
      if (oOptions.oCancellationState && oOptions.oCancellationState.fnCancelActiveProcess === fnCancelProcess) {
        oOptions.oCancellationState.fnCancelActiveProcess = null;
      }
      if (bCancelled) {
        reject('Request cancelled.');
      } else if (iCode !== 0) {
        reject(sStderr || sStdout || 'codeapp command failed with exit code ' + iCode);
      } else if (isCliOutputError(sStdout) || isCliOutputError(sStderr)) {
        reject((sStderr || '') + (sStdout || ''));
      } else {
        resolve(sStdout);
      }
    });
  });
}

function installCodeAppCliDependencies() {
  let sCliRoot = getCodeAppCliRoot();
  return new Promise((resolve, reject) => {
    let oProcess = spawn('npm install', [], {
      cwd: sCliRoot,
      shell: true,
      env: process.env,
      windowsHide: true
    });

    let sStderr = '';
    oProcess.stderr.on('data', (oChunk) => {
      sStderr += oChunk.toString();
    });
    oProcess.on('error', (oError) => reject(oError));
    oProcess.on('close', (iCode) => {
      if (iCode === 0) {
        resolve();
      } else {
        reject(new Error(sStderr || 'npm install failed with exit code ' + iCode));
      }
    });
  });
}

async function ensureCodeAppCliReady() {
  if (bDependenciesEnsured) {
    return true;
  }

  let sCliEntry = getCodeAppCliEntry();
  if (!fs.existsSync(sCliEntry)) {
    vscode.window.showErrorMessage('codeapp-cli was not found at ' + sCliEntry + '. Reinstall the extension.');
    return false;
  }

  if (fs.existsSync(getCodeAppCliNodeModules())) {
    bDependenciesEnsured = true;
    return true;
  }

  try {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Installing codeapp-cli dependencies (first run)...', cancellable: false },
      async () => {
        await installCodeAppCliDependencies();
      }
    );
    bDependenciesEnsured = true;
    return true;
  } catch (oError) {
    let sMessage = oError && oError.message ? oError.message : String(oError);
    vscode.window.showErrorMessage('Failed to install codeapp-cli dependencies: ' + sMessage);
    return false;
  }
}

function checkAndInstallCodeAppCli() {
  /* Fire-and-forget background install on activation so the first user action is fast. */
  ensureCodeAppCliReady().catch(() => {});
}

module.exports = {
  checkAndInstallCodeAppCli,
  ensureCodeAppCliReady,
  runCodeAppCommand,
  getCodeAppCliCommand,
  getWorkspaceRoot,
  isCodeAppCliInstalled
};
