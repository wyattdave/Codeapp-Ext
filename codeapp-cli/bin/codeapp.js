#!/usr/bin/env node
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const S_POWER_APPS_PACKAGE = '@microsoft/power-apps-cli';
const S_POWER_APPS_COMMAND = 'power-apps';
const aArgs = process.argv.slice(2);
const sCommand = aArgs[0] || '';
const aRest = aArgs.slice(1);

function needsShellWrapper(sExecutablePath) {
  if (process.platform !== 'win32') {
    return false;
  }

  let sExtension = path.extname(String(sExecutablePath || '')).toLowerCase();
  return sExtension === '.cmd' || sExtension === '.bat';
}

function quoteForWindowsShell(sValue) {
  let sArgument = String(sValue || '');
  if (!/[\s"&()^<>|]/.test(sArgument)) {
    return sArgument;
  }

  return '"' + sArgument.replace(/"/g, '""') + '"';
}

function buildSpawnSpec(oSpec) {
  if (!needsShellWrapper(oSpec.sExecutable)) {
    return {
      sCommand: oSpec.sExecutable,
      aArgs: oSpec.aExecutableArgs,
      bWindowsVerbatimArguments: false
    };
  }

  let sComSpec = process.env.ComSpec || 'cmd.exe';
  let aCommandParts = [quoteForWindowsShell(oSpec.sExecutable)].concat(
    oSpec.aExecutableArgs.map((sArgument) => quoteForWindowsShell(sArgument))
  );

  return {
    sCommand: sComSpec,
    aArgs: ['/d', '/s', '/c', '"' + aCommandParts.join(' ') + '"'],
    bWindowsVerbatimArguments: true
  };
}

function getExecutableExtensions() {
  if (process.platform !== 'win32') {
    return [''];
  }

  let sPathExtensions = process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM';
  return sPathExtensions
    .split(';')
    .map((sExtension) => sExtension.trim())
    .filter((sExtension) => sExtension)
    .map((sExtension) => sExtension.toLowerCase());
}

function getExecutableCandidates(sCommandName) {
  if (process.platform !== 'win32') {
    return [sCommandName];
  }

  let sExtension = path.extname(sCommandName);
  if (sExtension) {
    return [sCommandName];
  }

  return getExecutableExtensions().map((sExecutableExtension) => sCommandName + sExecutableExtension);
}

function findExecutableInDirectory(sDirectoryPath, sCommandName) {
  if (!sDirectoryPath) {
    return null;
  }

  let aCandidates = getExecutableCandidates(sCommandName);
  for (let iIndex = 0; iIndex < aCandidates.length; iIndex++) {
    let sCandidatePath = path.join(sDirectoryPath, aCandidates[iIndex]);
    if (fs.existsSync(sCandidatePath)) {
      return sCandidatePath;
    }
  }

  return null;
}

function findExecutableOnPath(sCommandName) {
  let sPathValue = process.env.PATH || '';
  if (!sPathValue) {
    return null;
  }

  let aPathEntries = sPathValue.split(path.delimiter).filter((sEntry) => sEntry);
  for (let iIndex = 0; iIndex < aPathEntries.length; iIndex++) {
    let sResolvedPath = findExecutableInDirectory(aPathEntries[iIndex], sCommandName);
    if (sResolvedPath) {
      return sResolvedPath;
    }
  }

  return null;
}

function getLocalNodeModulesBinDirectories() {
  return [
    path.join(process.cwd(), 'node_modules', '.bin'),
    path.resolve(__dirname, '..', '..', 'node_modules', '.bin')
  ].filter((sDirectoryPath, iIndex, aDirectories) => {
    return aDirectories.indexOf(sDirectoryPath) === iIndex && fs.existsSync(sDirectoryPath);
  });
}

function findExecutableInLocalNodeModules(sCommandName) {
  let aDirectories = getLocalNodeModulesBinDirectories();
  for (let iIndex = 0; iIndex < aDirectories.length; iIndex++) {
    let sResolvedPath = findExecutableInDirectory(aDirectories[iIndex], sCommandName);
    if (sResolvedPath) {
      return sResolvedPath;
    }
  }

  return null;
}

function getKnownExecutableLocations(sCommandName) {
  let aLocations = [];

  if (sCommandName === S_POWER_APPS_COMMAND) {
    let sLocalExecutable = findExecutableInLocalNodeModules(sCommandName);
    if (sLocalExecutable) {
      aLocations.push(sLocalExecutable);
    }
  }

  if (process.platform !== 'win32' || sCommandName !== 'pac') {
    return aLocations;
  }

  if (process.env.LOCALAPPDATA) {
    aLocations.push(path.join(process.env.LOCALAPPDATA, 'Microsoft', 'PowerAppsCLI', 'pac.cmd'));
  }
  if (process.env.APPDATA) {
    aLocations.push(path.join(process.env.APPDATA, 'Code', 'User', 'globalStorage', 'microsoft-isvexptools.powerplatform-vscode', 'pac', 'tools', 'pac.exe'));
    aLocations.push(path.join(process.env.APPDATA, 'Code - Insiders', 'User', 'globalStorage', 'microsoft-isvexptools.powerplatform-vscode', 'pac', 'tools', 'pac.exe'));
  }

  return aLocations.filter((sCandidatePath) => fs.existsSync(sCandidatePath));
}

function resolveExecutable(sCommandName) {
  let sOverrideName = 'CODEAPP_' + sCommandName.toUpperCase().replace(/[^A-Z0-9]/g, '_') + '_PATH';
  let sOverridePath = process.env[sOverrideName];
  if (sOverridePath && fs.existsSync(sOverridePath)) {
    return sOverridePath;
  }

  let sLocalExecutable = findExecutableInLocalNodeModules(sCommandName);
  if (sLocalExecutable) {
    return sLocalExecutable;
  }

  let sPathExecutable = findExecutableOnPath(sCommandName);
  if (sPathExecutable) {
    return sPathExecutable;
  }

  let aKnownLocations = getKnownExecutableLocations(sCommandName);
  if (aKnownLocations.length > 0) {
    return aKnownLocations[0];
  }

  return sCommandName;
}

function getMissingExecutableMessage(sExecutableName) {
  if (sExecutableName === 'pac') {
    return 'Could not find pac. Install Microsoft Power Platform CLI, ensure it is available to VS Code, or set CODEAPP_PAC_PATH.';
  }
  if (sExecutableName === S_POWER_APPS_COMMAND) {
    return 'Could not find power-apps. Install @microsoft/power-apps-cli in the workspace, ensure node_modules/.bin is available, or set CODEAPP_POWER_APPS_PATH.';
  }
  if (sExecutableName === 'npx') {
    return 'Could not find npx. Install Node.js and ensure npx is available to VS Code.';
  }

  return 'Could not find ' + sExecutableName + '.';
}

function printHelp() {
  process.stdout.write(
    'Usage: codeapp <command> [options]\n\n' +
    'Lightweight wrapper used by the VS Code extension.\n\n' +
    'Commands:\n' +
    '  add-data-source   Run power-apps add-data-source with extension-friendly flags\n' +
    '  push              Run power-apps push\n' +
    '  list-codeapps     Run power-apps list-codeapps\n' +
    '  logout            Run pac auth clear\n' +
    '  list-flows        Run power-apps list-flows --non-interactive\n' +
    '  add-flow          Run power-apps add-flow --non-interactive\n'
  );
}

function mapArgs(aInputArgs, oMap) {
  let aMappedArgs = [];

  for (let iIndex = 0; iIndex < aInputArgs.length; iIndex++) {
    let sArg = aInputArgs[iIndex];
    aMappedArgs.push(oMap[sArg] || sArg);
  }

  return aMappedArgs;
}

function ensureFlag(aInputArgs, sFlag) {
  if (aInputArgs.indexOf(sFlag) === -1) {
    return aInputArgs.concat(sFlag);
  }

  return aInputArgs;
}

function normalizeHelpArgs(aInputArgs) {
  return aInputArgs;
}

function getCommandSpec() {
  switch (sCommand) {
    case 'add-data-source':
      return {
        sExecutableName: S_POWER_APPS_COMMAND,
        sExecutable: resolveExecutable(S_POWER_APPS_COMMAND),
        aExecutableArgs: ['add-data-source'].concat(mapArgs(normalizeHelpArgs(aRest), {
          '--resource-name': '--resource-name',
          '--solution-id': '--solution-id',
          '--connection-id': '--connection-id',
          '--connection-ref': '--connection-ref',
          '--api-id': '--api-id'
        }))
      };
    case 'push':
      return {
        sExecutableName: S_POWER_APPS_COMMAND,
        sExecutable: resolveExecutable(S_POWER_APPS_COMMAND),
        aExecutableArgs: ['push'].concat(mapArgs(normalizeHelpArgs(aRest), {
          '--solution-id': '--solution-id'
        }))
      };
    case 'list-codeapps':
      return {
        sExecutableName: S_POWER_APPS_COMMAND,
        sExecutable: resolveExecutable(S_POWER_APPS_COMMAND),
        aExecutableArgs: ['list-codeapps'].concat(normalizeHelpArgs(aRest))
      };
    case 'logout':
      return {
        sExecutableName: 'pac',
        sExecutable: resolveExecutable('pac'),
        aExecutableArgs: ['auth', 'clear'].concat(normalizeHelpArgs(aRest))
      };
    case 'list-flows':
      return {
        sExecutableName: S_POWER_APPS_COMMAND,
        sExecutable: resolveExecutable(S_POWER_APPS_COMMAND),
        aExecutableArgs: ['list-flows'].concat(ensureFlag(normalizeHelpArgs(aRest), '--non-interactive'))
      };
    case 'add-flow':
      return {
        sExecutableName: S_POWER_APPS_COMMAND,
        sExecutable: resolveExecutable(S_POWER_APPS_COMMAND),
        aExecutableArgs: ['add-flow'].concat(ensureFlag(normalizeHelpArgs(aRest), '--non-interactive'))
      };
    case '':
    case '--help':
    case '-h':
      printHelp();
      process.exit(0);
    default:
      process.stderr.write('Unknown codeapp command: ' + sCommand + '\n');
      printHelp();
      process.exit(1);
  }
}

function forwardToProcess() {
  let oSpec = getCommandSpec();
  let oSpawnSpec = buildSpawnSpec(oSpec);
  let oChild = spawn(oSpawnSpec.sCommand, oSpawnSpec.aArgs, {
    cwd: process.cwd(),
    env: process.env,
    windowsHide: true,
    shell: false,
    windowsVerbatimArguments: oSpawnSpec.bWindowsVerbatimArguments
  });

  oChild.stdout.on('data', (oChunk) => {
    process.stdout.write(oChunk);
  });

  oChild.stderr.on('data', (oChunk) => {
    process.stderr.write(oChunk);
  });

  oChild.on('error', (oError) => {
    let sMessage = oError && oError.code === 'ENOENT'
      ? getMissingExecutableMessage(oSpec.sExecutableName || oSpec.sExecutable)
      : (oError && oError.message ? oError.message : String(oError));
    process.stderr.write(sMessage + '\n');
    process.exit(1);
  });

  oChild.on('close', (iCode) => {
    process.exit(iCode || 0);
  });
}

forwardToProcess();
