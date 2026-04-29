const vscode = require('vscode');
const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let sCachedPacPath = null;

function getBundledPacCandidates() {
  let aCandidates = [];
  let sAppData = process.env.APPDATA || '';

  if (sAppData) {
    aCandidates.push(path.join(sAppData, 'Code', 'User', 'globalStorage', 'microsoft-isvexptools.powerplatform-vscode', 'pac', 'tools', 'pac.exe'));
  }

  let oPPExtension = vscode.extensions.getExtension('microsoft-IsvExpTools.powerplatform-vscode') ||
    vscode.extensions.getExtension('microsoft-isvexptools.powerplatform-vscode');

  if (oPPExtension) {
    aCandidates.push(path.join(oPPExtension.extensionPath, 'pac', 'tools', 'pac.exe'));
  }

  return aCandidates;
}

function isPacOutputError(sOutput) {
  if (!sOutput) {
    return false;
  }

  let sNormalized = String(sOutput);
  return new RegExp('(^|\n)Error:\s', 'i').test(sNormalized) ||
    new RegExp('Not a valid command', 'i').test(sNormalized);
}

/* Resolve the pac executable path, preferring the Power Platform VS Code extension bundled CLI */
function resolvePacPath() {
  if (sCachedPacPath) {
    return sCachedPacPath;
  }

  let aCandidates = getBundledPacCandidates();
  for (let iIndex = 0; iIndex < aCandidates.length; iIndex++) {
    let sBundledPac = aCandidates[iIndex];
    if (fs.existsSync(sBundledPac)) {
      sCachedPacPath = '"' + sBundledPac + '"';
      return sCachedPacPath;
    }
  }

  /* Fallback: use pac from PATH */
  sCachedPacPath = 'pac';
  return sCachedPacPath;
}

/* Get the pac command string for use in terminal sendText calls */
function getPacCommand() {
  return resolvePacPath();
}

function checkAndInstallPac() {
  let sPac = resolvePacPath();
  exec(sPac + ' help', (oError) => {
    if (oError) {
      vscode.window.showWarningMessage(
        'Power Platform CLI (pac) not found. Install the Power Platform Tools extension or install the CLI manually.',
        'Install CLI',
        'Cancel'
      ).then((sChoice) => {
        if (sChoice === 'Install CLI') {
          installPac();
        }
      });
    }
  });
}

function installPac() {
  let oTerminal = vscode.window.createTerminal('PAC CLI Install');
  oTerminal.show();
  oTerminal.sendText('dotnet tool install --global Microsoft.PowerApps.CLI.Tool');
  vscode.window.showInformationMessage('Installing Power Platform CLI... Check the terminal for progress.');
}

function updatePac() {
  let oTerminal = vscode.window.createTerminal('PAC CLI Update');
  oTerminal.show();
  oTerminal.sendText('dotnet tool update --global Microsoft.PowerApps.CLI.Tool');
  vscode.window.showInformationMessage('Updating Power Platform CLI... Check the terminal for progress.');
}

function getPacVersion() {
  let sPac = resolvePacPath();
  return new Promise((resolve) => {
    exec(sPac + ' help', (oError, sStdout) => {
      if (oError) {
        resolve(null);
        return;
      }
      let oMatch = sStdout.match(new RegExp('Version:\\s*(\\d+)\\.(\\d+)\\.(\\d+)'));
      if (oMatch) {
        resolve({
          iMajor: parseInt(oMatch[1], 10),
          iMinor: parseInt(oMatch[2], 10),
          iPatch: parseInt(oMatch[3], 10),
          sRaw: oMatch[0]
        });
      } else {
        resolve(null);
      }
    });
  });
}

function isPacVersionSufficient(oVersion, iMinMajor, iMinMinor) {
  if (!oVersion) {
    return false;
  }
  if (oVersion.iMajor > iMinMajor) {
    return true;
  }
  if (oVersion.iMajor === iMinMajor && oVersion.iMinor >= iMinMinor) {
    return true;
  }
  return false;
}

function runPacCommand(sCommand, oOptions = {}) {
  let sPac = resolvePacPath();
  return new Promise((resolve, reject) => {
    let sStdout = '';
    let sStderr = '';
    let bSettled = false;
    let bCancelled = false;
    let oProcess = spawn(sPac + ' ' + sCommand, [], {
      cwd: getWorkspaceRoot(),
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
        reject(sStderr || sStdout || 'PAC command failed with exit code ' + iCode);
      } else if (isPacOutputError(sStdout) || isPacOutputError(sStderr)) {
        reject((sStderr || '') + (sStdout || ''));
      } else {
        resolve(sStdout);
      }
    });
  });
}

function getWorkspaceRoot() {
  let aFolders = vscode.workspace.workspaceFolders;
  if (aFolders && aFolders.length > 0) {
    return aFolders[0].uri.fsPath;
  }
  return process.cwd();
}

module.exports = { checkAndInstallPac, runPacCommand, getWorkspaceRoot, getPacVersion, isPacVersionSufficient, updatePac, getPacCommand };
