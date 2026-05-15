const vscode = require('vscode');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let sCachedCliRoot = null;

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

function isCodeAppCliInstalled() {
  return fs.existsSync(getCodeAppCliEntry());
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
  return [
    new RegExp('(^|\n)Error:\\s', 'i'),
    new RegExp('(^|\n)Error during CLI execution:\\s', 'i'),
    new RegExp('(^|\n)HTTP error status:\\s*[0-9]+', 'i')
  ].some((oPattern) => oPattern.test(sNormalized));
}

function runShellCommand(sFullCommand, oOptions = {}) {
  let sCommandCwd = oOptions.cwd || getWorkspaceRoot();
  return new Promise((resolve, reject) => {
    let sStdout = '';
    let sStderr = '';
    let sCombinedOutput = '';
    let bSettled = false;
    let bCancelled = false;

    let oProcess = spawn(sFullCommand, [], {
      cwd: sCommandCwd,
      shell: true,
      env: Object.assign({}, process.env, oOptions.env || {}),
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
      sCombinedOutput += sChunk;
      if (typeof oOptions.onStdout === 'function') {
        oOptions.onStdout(sChunk);
      }
    });

    oProcess.stderr.on('data', (oChunk) => {
      let sChunk = oChunk.toString();
      sStderr += sChunk;
      sCombinedOutput += sChunk;
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
        reject(sCombinedOutput || sStderr || sStdout);
      } else {
        resolve(oOptions.bReturnCombinedOutput ? sCombinedOutput : sStdout);
      }
    });
  });
}

function runCodeAppCommand(sCommand, oOptions = {}) {
  let sCliEntry = getCodeAppCliEntry();
  let sFullCommand = 'node "' + sCliEntry + '" ' + sCommand;
  return runShellCommand(sFullCommand, oOptions);
}

async function ensureCodeAppCliReady() {
  let sCliEntry = getCodeAppCliEntry();
  if (!fs.existsSync(sCliEntry)) {
    vscode.window.showErrorMessage('codeapp-cli was not found at ' + sCliEntry + '. Reinstall the extension.');
    return false;
  }

  return true;
}

function checkAndInstallCodeAppCli() {
  /* Lightweight wrapper only. Nothing to install. */
}

module.exports = {
  checkAndInstallCodeAppCli,
  ensureCodeAppCliReady,
  runShellCommand,
  runCodeAppCommand,
  getCodeAppCliCommand,
  getWorkspaceRoot,
  isCodeAppCliInstalled
};
