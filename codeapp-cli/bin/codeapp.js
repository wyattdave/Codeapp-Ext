#!/usr/bin/env node
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const S_POWER_APPS_PACKAGE = '@microsoft/power-apps-cli';
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

function getKnownExecutableLocations(sCommandName) {
  if (process.platform !== 'win32' || sCommandName !== 'pac') {
    return [];
  }

  let aLocations = [];
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
  let sOverrideName = 'CODEAPP_' + sCommandName.toUpperCase() + '_PATH';
  let sOverridePath = process.env[sOverrideName];
  if (sOverridePath && fs.existsSync(sOverridePath)) {
    return sOverridePath;
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
    '  add-data-source   Run pac code add-data-source with extension-friendly flags\n' +
    '  push              Run pac code push\n' +
    '  list-codeapps     Run pac code list\n' +
    '  logout            Run pac auth clear\n' +
    '  list-flows        Run npx --package @microsoft/power-apps-cli power-apps list-flows --non-interactive\n' +
    '  add-flow          Run npx --package @microsoft/power-apps-cli power-apps add-flow --non-interactive\n'
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
  if (aInputArgs.indexOf('--help') !== -1 || aInputArgs.indexOf('-h') !== -1) {
    return ['help'];
  }

  return aInputArgs;
}

function getCommandSpec() {
  switch (sCommand) {
    case 'add-data-source':
      return {
        sExecutableName: 'pac',
        sExecutable: resolveExecutable('pac'),
        aExecutableArgs: ['code', 'add-data-source'].concat(mapArgs(normalizeHelpArgs(aRest), {
          '--api-id': '--apiId',
          '--connection-id': '--connectionId',
          '--resource-name': '--table',
          '--connection-ref': '--connectionRef',
          '--solution-id': '--solutionId'
        }))
      };
    case 'push':
      return {
        sExecutableName: 'pac',
        sExecutable: resolveExecutable('pac'),
        aExecutableArgs: ['code', 'push'].concat(mapArgs(normalizeHelpArgs(aRest), {
          '--solution-id': '--solutionName'
        }))
      };
    case 'list-codeapps':
      return {
        sExecutableName: 'pac',
        sExecutable: resolveExecutable('pac'),
        aExecutableArgs: ['code', 'list'].concat(normalizeHelpArgs(aRest))
      };
    case 'logout':
      return {
        sExecutableName: 'pac',
        sExecutable: resolveExecutable('pac'),
        aExecutableArgs: ['auth', 'clear'].concat(normalizeHelpArgs(aRest))
      };
    case 'list-flows':
      return {
        sExecutableName: 'npx',
        sExecutable: resolveExecutable('npx'),
        aExecutableArgs: ['--yes', '--package', S_POWER_APPS_PACKAGE, 'power-apps', 'list-flows'].concat(ensureFlag(normalizeHelpArgs(aRest), '--non-interactive'))
      };
    case 'add-flow':
      return {
        sExecutableName: 'npx',
        sExecutable: resolveExecutable('npx'),
        aExecutableArgs: ['--yes', '--package', S_POWER_APPS_PACKAGE, 'power-apps', 'add-flow'].concat(ensureFlag(normalizeHelpArgs(aRest), '--non-interactive'))
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
