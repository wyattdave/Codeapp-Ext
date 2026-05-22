const vscode = require('vscode');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const S_CODEAPP_JS_CLI_PACKAGE = 'codeapp-js-cli';
const S_POWER_APPS_PACKAGE = '@microsoft/power-apps-cli';
const S_CAP_COMMAND = 'cap';

let sCachedCliRoot = null;
let sCachedCliEntry = null;
let oCachedCapCore = null;
let bTerminalSelectorPatched = false;
let oTerminalSelectorState = {
  fnCaptureItems: null
};

function getExtensionRoot() {
  return path.resolve(__dirname, '..');
}

function resolvePackageRequest(sRequest) {
  return require.resolve(sRequest, { paths: [getExtensionRoot()] });
}

function getPackageRoot(sPackageName) {
  try {
    let sPackageJsonPath = resolvePackageRequest(sPackageName + '/package.json');
    return path.dirname(sPackageJsonPath);
  } catch (oError) {
    let sResolvedEntry = resolvePackageRequest(sPackageName);
    let sCurrentPath = path.dirname(sResolvedEntry);

    while (sCurrentPath && sCurrentPath !== path.dirname(sCurrentPath)) {
      if (fs.existsSync(path.join(sCurrentPath, 'package.json'))) {
        return sCurrentPath;
      }

      sCurrentPath = path.dirname(sCurrentPath);
    }

    throw oError;
  }
}

function resolvePackageFile(sPackageName, sRelativePath) {
  return path.join(getPackageRoot(sPackageName), sRelativePath);
}

function getPackageBinEntryPath(sPackageRoot, sCommandName) {
  if (!sPackageRoot) {
    return '';
  }

  let sPackageJsonPath = path.join(sPackageRoot, 'package.json');
  if (!fs.existsSync(sPackageJsonPath)) {
    return '';
  }

  try {
    let oPackageJson = JSON.parse(fs.readFileSync(sPackageJsonPath, 'utf8'));
    let vBinField = oPackageJson && oPackageJson.bin;
    let sRelativeBinPath = '';

    if (typeof vBinField === 'string') {
      sRelativeBinPath = vBinField;
    } else if (vBinField && typeof vBinField === 'object') {
      sRelativeBinPath = vBinField[sCommandName] || '';
    }

    if (!sRelativeBinPath) {
      return '';
    }

    let sResolvedBinPath = path.resolve(sPackageRoot, sRelativeBinPath);
    return fs.existsSync(sResolvedBinPath) ? sResolvedBinPath : '';
  } catch (oError) {
    return '';
  }
}

function getCodeAppCliRoot() {
  if (sCachedCliRoot) {
    return sCachedCliRoot;
  }

  sCachedCliRoot = getPackageRoot(S_CODEAPP_JS_CLI_PACKAGE);
  return sCachedCliRoot;
}

function getCodeAppCliEntry() {
  if (sCachedCliEntry) {
    return sCachedCliEntry;
  }

  let sCliRoot = getCodeAppCliRoot();
  sCachedCliEntry = getPackageBinEntryPath(sCliRoot, S_CAP_COMMAND) || path.join(sCliRoot, 'bin', 'cap.js');
  return sCachedCliEntry;
}

function isCodeAppCliInstalled() {
  try {
    return fs.existsSync(getCodeAppCliEntry());
  } catch (oError) {
    return false;
  }
}

function getCodeAppCliCommand() {
  let sCliEntry = getCodeAppCliEntry();
  return 'node "' + sCliEntry + '"';
}

function getPowerAppsCliAuthProviderPath() {
  return resolvePackageFile(S_POWER_APPS_PACKAGE, path.join('dist', 'Authentication', 'NodeMsalAuthenticationProvider.js'));
}

function ensurePowerAppsCliAuthFallbackPatched() {
  let sAuthProviderPath = getPowerAppsCliAuthProviderPath();
  let sContent = fs.readFileSync(sAuthProviderPath, 'utf8');
  if (sContent.indexOf('createExtensionFileBackedMsalCachePlugin') !== -1) {
    return;
  }

  let sImports = "import { InteractionRequiredAuthError, PublicClientApplication } from '@azure/msal-node';\n";
  let sPatchedImports = "import fs from 'node:fs/promises';\n" +
    "import path from 'node:path';\n" +
    sImports;
  let sHelper = "function isExtensionNativeAuthError(error) {\n" +
    "    const details = `${error?.code || ''} ${error?.message || ''} ${error?.stack || ''}`.toLowerCase();\n" +
    "    return details.includes('keytar') || details.includes('msal-node-extensions') || details.includes('native build') || details.includes('build/release') || error?.code === 'MODULE_NOT_FOUND' || error?.code === 'ERR_DLOPEN_FAILED';\n" +
    "}\n" +
    "function createExtensionFileBackedMsalCachePlugin(cachePath) {\n" +
    "    return {\n" +
    "        beforeCacheAccess: async (cacheContext) => {\n" +
    "            try {\n" +
    "                const cacheContents = await fs.readFile(cachePath, 'utf8');\n" +
    "                try {\n" +
    "                    cacheContext.tokenCache.deserialize(cacheContents);\n" +
    "                }\n" +
    "                catch {\n" +
    "                    await fs.rm(cachePath, { force: true });\n" +
    "                }\n" +
    "            }\n" +
    "            catch (error) {\n" +
    "                if (error?.code !== 'ENOENT') {\n" +
    "                    throw error;\n" +
    "                }\n" +
    "            }\n" +
    "        },\n" +
    "        afterCacheAccess: async (cacheContext) => {\n" +
    "            if (!cacheContext.cacheHasChanged) {\n" +
    "                return;\n" +
    "            }\n" +
    "            await fs.mkdir(path.dirname(cachePath), { recursive: true });\n" +
    "            await fs.writeFile(cachePath, cacheContext.tokenCache.serialize(), 'utf8');\n" +
    "        },\n" +
    "    };\n" +
    "}\n";
  let sOriginalInit = "    async initAsync(region) {\n" +
    "        this._region = region;\n" +
    "        const { DataProtectionScope, PersistenceCachePlugin, PersistenceCreator } = await import('@azure/msal-node-extensions');\n" +
    "        const persistenceConfiguration = {\n" +
    "            cachePath: AUTH_CACHE_DIRECTORY + '/msal_cache.json',\n" +
    "            dataProtectionScope: DataProtectionScope.CurrentUser,\n" +
    "            serviceName: 'power-apps',\n" +
    "            accountName: 'power-apps',\n" +
    "            usePlaintextFileOnLinux: false,\n" +
    "        };\n" +
    "        const persistence = await PersistenceCreator.createPersistence(persistenceConfiguration);\n" +
    "        const authConfig = {\n" +
    "            auth: {\n" +
    "                authority: getAuthority(this._region, this._tenantId),\n" +
    "                clientId: '9cee029c-6210-4654-90bb-17e6e9d36617',\n" +
    "            },\n" +
    "            cache: {\n" +
    "                cachePlugin: new PersistenceCachePlugin(persistence),\n" +
    "            },\n" +
    "        };\n" +
    "        this._msalClient = new PublicClientApplication(authConfig);\n" +
    "    }";
  let sPatchedInit = "    async initAsync(region) {\n" +
    "        this._region = region;\n" +
    "        const cachePath = AUTH_CACHE_DIRECTORY + '/msal_cache.json';\n" +
    "        let cachePlugin;\n" +
    "        try {\n" +
    "            const { DataProtectionScope, PersistenceCachePlugin, PersistenceCreator } = await import('@azure/msal-node-extensions');\n" +
    "            const persistence = await PersistenceCreator.createPersistence({\n" +
    "                cachePath,\n" +
    "                dataProtectionScope: DataProtectionScope.CurrentUser,\n" +
    "                serviceName: 'power-apps',\n" +
    "                accountName: 'power-apps',\n" +
    "                usePlaintextFileOnLinux: false,\n" +
    "            });\n" +
    "            cachePlugin = new PersistenceCachePlugin(persistence);\n" +
    "        }\n" +
    "        catch (error) {\n" +
    "            if (!isExtensionNativeAuthError(error)) {\n" +
    "                throw error;\n" +
    "            }\n" +
    "            cachePlugin = createExtensionFileBackedMsalCachePlugin(cachePath);\n" +
    "        }\n" +
    "        const authConfig = {\n" +
    "            auth: {\n" +
    "                authority: getAuthority(this._region, this._tenantId),\n" +
    "                clientId: '9cee029c-6210-4654-90bb-17e6e9d36617',\n" +
    "            },\n" +
    "            cache: { cachePlugin },\n" +
    "        };\n" +
    "        this._msalClient = new PublicClientApplication(authConfig);\n" +
    "    }";

  let sUpdatedContent = sContent.replace(sImports, sPatchedImports).replace('export class NodeMsalAuthenticationProvider {', sHelper + 'export class NodeMsalAuthenticationProvider {').replace(sOriginalInit, sPatchedInit);
  if (sUpdatedContent === sContent) {
    throw new Error('Unable to patch Power Apps CLI authentication fallback.');
  }

  fs.writeFileSync(sAuthProviderPath, sUpdatedContent, 'utf8');
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

function parseShellLikeArgs(sCommand) {
  let aArgs = [];
  let sCurrent = '';
  let sQuote = '';
  let bEscaped = false;
  let sSource = String(sCommand || '');

  for (let iIndex = 0; iIndex < sSource.length; iIndex++) {
    let sChar = sSource.charAt(iIndex);

    if (bEscaped) {
      sCurrent += sChar;
      bEscaped = false;
      continue;
    }

    if (sChar === '\\') {
      bEscaped = true;
      continue;
    }

    if (sQuote) {
      if (sChar === sQuote) {
        sQuote = '';
      } else {
        sCurrent += sChar;
      }
      continue;
    }

    if (sChar === '"' || sChar === "'") {
      sQuote = sChar;
      continue;
    }

    if (new RegExp('\\s').test(sChar)) {
      if (sCurrent) {
        aArgs.push(sCurrent);
        sCurrent = '';
      }
      continue;
    }

    sCurrent += sChar;
  }

  if (bEscaped) {
    sCurrent += '\\';
  }

  if (sCurrent) {
    aArgs.push(sCurrent);
  }

  return aArgs;
}

function hasArg(aArgs, sFlag) {
  return aArgs.indexOf(sFlag) !== -1;
}

function ensureArg(aArgs, sFlag) {
  if (hasArg(aArgs, sFlag)) {
    return aArgs;
  }

  return aArgs.concat(sFlag);
}

function getFlagValue(aArgs, sFlag) {
  for (let iIndex = 0; iIndex < aArgs.length; iIndex++) {
    let sArg = aArgs[iIndex];
    if (sArg === sFlag) {
      return aArgs[iIndex + 1] || '';
    }

    if (sArg.indexOf(sFlag + '=') === 0) {
      return sArg.substring(sFlag.length + 1);
    }
  }

  return '';
}

function formatConsoleArguments(aArgs) {
  return aArgs.map((vValue) => {
    if (typeof vValue === 'string') {
      return vValue;
    }

    try {
      return JSON.stringify(vValue);
    } catch (oError) {
      return String(vValue);
    }
  }).join(' ') + '\n';
}

function getArgumentValue(aArgs, aFlags) {
  for (let iIndex = 0; iIndex < aArgs.length; iIndex++) {
    let sArg = aArgs[iIndex];
    if (aFlags.indexOf(sArg) >= 0) {
      return aArgs[iIndex + 1] || '';
    }

    let sMatchingFlag = aFlags.find((sFlag) => sArg.indexOf(sFlag + '=') === 0);
    if (sMatchingFlag) {
      return sArg.substring(sMatchingFlag.length + 1);
    }
  }

  return '';
}

function getPowerConfigCandidates(sCwd) {
  return [
    path.join(sCwd, 'power.config.json'),
    path.join(sCwd, 'setup', 'power.config.json')
  ];
}

function resolvePowerConfigPath(sCwd) {
  let aCandidates = getPowerConfigCandidates(sCwd);
  return aCandidates.find((sCandidatePath) => fs.existsSync(sCandidatePath)) || aCandidates[0];
}

function buildFileConfig(sCwd) {
  return {
    powerConfigPath: resolvePowerConfigPath(sCwd),
    schemaPath: path.join(sCwd, '.power', 'schemas'),
    codeGenPath: path.join(sCwd, 'src')
  };
}

function writeCommandOutput(sOutput, oOptions = {}) {
  if (typeof oOptions.onStdout === 'function') {
    oOptions.onStdout(sOutput);
  }

  return oOptions.bReturnCombinedOutput ? sOutput : sOutput;
}

function getSubprocessEnv(oOptions = {}) {
  let oEnv = Object.assign({}, process.env, oOptions.env || {});
  oEnv.ELECTRON_RUN_AS_NODE = '1';
  return oEnv;
}

function getErrorOutput(oError) {
  if (!oError) {
    return '';
  }

  let aParts = [];
  if (oError.stderr) {
    aParts.push(String(oError.stderr));
  }
  if (oError.stdout) {
    aParts.push(String(oError.stdout));
  }
  if (oError.message) {
    aParts.push(String(oError.message));
  }

  return aParts.join('\n').trim();
}

function getEnvironmentIdCandidateValue(vValue) {
  let sValue = String(vValue || '').trim();
  let oDefaultMatch = new RegExp('Default-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', 'i').exec(sValue);
  if (oDefaultMatch) {
    return oDefaultMatch[0];
  }

  let oGuidMatch = new RegExp('[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', 'i').exec(sValue);
  return oGuidMatch ? oGuidMatch[0] : sValue;
}

function getCapEnvironmentId(oEnvironment) {
  let aCandidates = [
    oEnvironment && oEnvironment.name,
    oEnvironment && oEnvironment.environmentId,
    oEnvironment && oEnvironment.id,
    oEnvironment && oEnvironment.raw && oEnvironment.raw.name,
    oEnvironment && oEnvironment.raw && oEnvironment.raw.id
  ].map(getEnvironmentIdCandidateValue).filter((sCandidate) => Boolean(sCandidate));
  let sDefaultCandidate = aCandidates.find((sCandidate) => new RegExp('^Default-', 'i').test(sCandidate));
  return sDefaultCandidate || aCandidates[0] || '';
}

function isDefaultCapEnvironment(oEnvironment, sEnvironmentId) {
  return new RegExp('^Default-', 'i').test(sEnvironmentId) ||
    Boolean(oEnvironment && oEnvironment.IsDefault) ||
    Boolean(oEnvironment && oEnvironment.isDefault) ||
    Boolean(oEnvironment && oEnvironment.raw && oEnvironment.raw.IsDefault) ||
    Boolean(oEnvironment && oEnvironment.raw && oEnvironment.raw.isDefault) ||
    Boolean(oEnvironment && oEnvironment.raw && oEnvironment.raw.properties && oEnvironment.raw.properties.isDefault);
}

function toPacEnvironmentRecord(oEnvironment) {
  let sEnvironmentId = getCapEnvironmentId(oEnvironment);
  let sDisplayName = String(oEnvironment && (oEnvironment.displayName || oEnvironment.friendlyName || oEnvironment.name) || sEnvironmentId).trim();
  let sEnvironmentUrl = String(oEnvironment && (oEnvironment.dynamicsUrl || oEnvironment.instanceApiUrl || oEnvironment.environmentUrl) || '').trim();
  let bIsDefault = isDefaultCapEnvironment(oEnvironment, sEnvironmentId);

  return {
    FriendlyName: sDisplayName,
    UniqueName: sEnvironmentId,
    EnvironmentUrl: sEnvironmentUrl,
    EnvironmentId: sEnvironmentId,
    Id: sEnvironmentId,
    EnvironmentIdentifier: {
      Id: sEnvironmentId,
      IsDefault: bIsDefault
    }
  };
}

function patchTerminalSelectorForCapCore() {
  if (bTerminalSelectorPatched) {
    return;
  }

  let sTerminalUiPath = path.join(getCodeAppCliRoot(), 'lib', 'terminal-ui.js');
  let oTerminalUi = require(sTerminalUiPath);
  let fnOriginalChooseFromList = oTerminalUi.chooseFromList;

  oTerminalUi.chooseFromList = async function(...aArgs) {
    if (typeof oTerminalSelectorState.fnCaptureItems === 'function') {
      oTerminalSelectorState.fnCaptureItems(aArgs[0]);
      return null;
    }

    return await fnOriginalChooseFromList.apply(this, aArgs);
  };

  bTerminalSelectorPatched = true;
}

function getCapCore() {
  if (oCachedCapCore) {
    return oCachedCapCore;
  }

  patchTerminalSelectorForCapCore();
  oCachedCapCore = require(resolvePackageRequest(S_CODEAPP_JS_CLI_PACKAGE));
  return oCachedCapCore;
}

async function withMutedConsole(fnAction) {
  let fnOriginalLog = console.log;
  let fnOriginalInfo = console.info;
  let fnOriginalWarn = console.warn;
  let fnOriginalError = console.error;

  console.log = () => {};
  console.info = () => {};
  console.warn = () => {};
  console.error = () => {};

  try {
    return await fnAction();
  } finally {
    console.log = fnOriginalLog;
    console.info = fnOriginalInfo;
    console.warn = fnOriginalWarn;
    console.error = fnOriginalError;
  }
}

async function withNonInteractiveTerminal(fnAction) {
  let oStdinDescriptor = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
  let oStdoutDescriptor = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');

  try {
    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: false });
    Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: false });
  } catch (oError) {
  }

  try {
    return await fnAction();
  } finally {
    try {
      if (oStdinDescriptor) {
        Object.defineProperty(process.stdin, 'isTTY', oStdinDescriptor);
      } else {
        delete process.stdin.isTTY;
      }
      if (oStdoutDescriptor) {
        Object.defineProperty(process.stdout, 'isTTY', oStdoutDescriptor);
      } else {
        delete process.stdout.isTTY;
      }
    } catch (oError) {
    }
  }
}

async function captureConsoleOutput(fnAction, oOptions = {}) {
  let sStdout = '';
  let sStderr = '';
  let sCombinedOutput = '';
  let fnOriginalLog = console.log;
  let fnOriginalInfo = console.info;
  let fnOriginalWarn = console.warn;
  let fnOriginalError = console.error;
  let fnOriginalStdoutWrite = process.stdout.write;
  let fnOriginalStderrWrite = process.stderr.write;

  let fnWriteChunk = (sStream, vChunk, vEncoding, fnCallback) => {
    let sChunk = Buffer.isBuffer(vChunk) ? vChunk.toString(typeof vEncoding === 'string' ? vEncoding : undefined) : String(vChunk || '');
    if (sStream === 'stdout') {
      sStdout += sChunk;
      if (typeof oOptions.onStdout === 'function') {
        oOptions.onStdout(sChunk);
      }
    } else {
      sStderr += sChunk;
      if (typeof oOptions.onStderr === 'function') {
        oOptions.onStderr(sChunk);
      }
    }

    sCombinedOutput += sChunk;
    if (typeof vEncoding === 'function') {
      vEncoding();
    } else if (typeof fnCallback === 'function') {
      fnCallback();
    }
    return true;
  };

  let fnWriteStdout = (...aArgs) => {
    let sChunk = formatConsoleArguments(aArgs);
    sStdout += sChunk;
    sCombinedOutput += sChunk;
    if (typeof oOptions.onStdout === 'function') {
      oOptions.onStdout(sChunk);
    }
  };

  let fnWriteStderr = (...aArgs) => {
    let sChunk = formatConsoleArguments(aArgs);
    sStderr += sChunk;
    sCombinedOutput += sChunk;
    if (typeof oOptions.onStderr === 'function') {
      oOptions.onStderr(sChunk);
    }
  };

  console.log = fnWriteStdout;
  console.info = fnWriteStdout;
  console.warn = fnWriteStderr;
  console.error = fnWriteStderr;
  process.stdout.write = function(vChunk, vEncoding, fnCallback) {
    return fnWriteChunk('stdout', vChunk, vEncoding, fnCallback);
  };
  process.stderr.write = function(vChunk, vEncoding, fnCallback) {
    return fnWriteChunk('stderr', vChunk, vEncoding, fnCallback);
  };

  try {
    await fnAction();
    if (isCliOutputError(sStdout) || isCliOutputError(sStderr)) {
      throw sCombinedOutput || sStderr || sStdout;
    }
    return oOptions.bReturnCombinedOutput ? sCombinedOutput : sStdout;
  } catch (oError) {
    let sCapturedOutput = sCombinedOutput || sStderr || sStdout || '';
    let sErrorOutput = getErrorOutput(oError) || String(oError);
    let sMessage = sCapturedOutput;
    if (sErrorOutput && sCapturedOutput.indexOf(sErrorOutput) === -1) {
      sMessage = (sMessage ? sMessage.trim() + '\n' : '') + sErrorOutput;
    }
    throw sMessage;
  } finally {
    console.log = fnOriginalLog;
    console.info = fnOriginalInfo;
    console.warn = fnOriginalWarn;
    console.error = fnOriginalError;
    process.stdout.write = fnOriginalStdoutWrite;
    process.stderr.write = fnOriginalStderrWrite;
  }
}

function emitProcessOutput(sChunk, sStream, oOptions, oState) {
  if (sStream === 'stdout') {
    oState.sStdout += sChunk;
    if (typeof oOptions.onStdout === 'function') {
      oOptions.onStdout(sChunk);
    }
  } else {
    oState.sStderr += sChunk;
    if (typeof oOptions.onStderr === 'function') {
      oOptions.onStderr(sChunk);
    }
  }

  oState.sCombinedOutput += sChunk;
}

function runProcessCommand(sCommand, aArgs = [], oOptions = {}) {
  let sCommandCwd = oOptions.cwd || getWorkspaceRoot();
  return new Promise((resolve, reject) => {
    let oState = {
      sStdout: '',
      sStderr: '',
      sCombinedOutput: ''
    };
    let bSettled = false;
    let bCancelled = false;

    let oProcess = spawn(sCommand, aArgs, {
      cwd: sCommandCwd,
      shell: false,
      env: getSubprocessEnv(oOptions),
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
      emitProcessOutput(oChunk.toString(), 'stdout', oOptions, oState);
    });

    oProcess.stderr.on('data', (oChunk) => {
      emitProcessOutput(oChunk.toString(), 'stderr', oOptions, oState);
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
        reject(oState.sStderr || oState.sStdout || 'codeapp-js-cli command failed with exit code ' + iCode);
      } else if (isCliOutputError(oState.sStdout) || isCliOutputError(oState.sStderr)) {
        reject(oState.sCombinedOutput || oState.sStderr || oState.sStdout);
      } else {
        resolve(oOptions.bReturnCombinedOutput ? oState.sCombinedOutput : oState.sStdout);
      }
    });
  });
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
      env: getSubprocessEnv(oOptions),
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
        reject(sStderr || sStdout || 'codeapp-js-cli command failed with exit code ' + iCode);
      } else if (isCliOutputError(sStdout) || isCliOutputError(sStderr)) {
        reject(sCombinedOutput || sStderr || sStdout);
      } else {
        resolve(oOptions.bReturnCombinedOutput ? sCombinedOutput : sStdout);
      }
    });
  });
}

async function runCapAuthCommand(aArgs, oOptions = {}) {
  let oCapCore = getCapCore();
  let aAuthArgs = aArgs[0] === 'auth' ? aArgs.slice(1) : aArgs.slice();
  let bLogout = aAuthArgs.indexOf('logout') !== -1 || aAuthArgs.indexOf('clear') !== -1 || aAuthArgs.indexOf('--logout') !== -1;
  let bChange = aAuthArgs.indexOf('--change') !== -1;

  if (aAuthArgs[0] === 'create' || aAuthArgs[0] === 'who') {
    aAuthArgs = aAuthArgs.slice(1);
  }

  aAuthArgs = aAuthArgs.filter((sArg) => sArg !== '--json' && sArg !== '--logout' && sArg !== '--change');
  if (bLogout) {
    aAuthArgs = ['logout'];
  }

  return await captureConsoleOutput(async () => {
    await oCapCore.capAuth(aAuthArgs, {
      cwd: oOptions.cwd || getWorkspaceRoot(),
      namedArgs: {
        logout: bLogout,
        change: bChange
      }
    });
  }, oOptions);
}

async function runCapEnvironmentListCommand(oOptions = {}) {
  let oCapCore = getCapCore();
  let aCapturedEnvironments = [];

  await withMutedConsole(async () => {
    oTerminalSelectorState.fnCaptureItems = (aItems) => {
      aCapturedEnvironments = Array.isArray(aItems) ? aItems : [];
    };

    try {
      await oCapCore.capEnvironment('', { cwd: oOptions.cwd || getWorkspaceRoot(), namedArgs: {} });
    } finally {
      oTerminalSelectorState.fnCaptureItems = null;
    }
  });

  let sOutput = JSON.stringify(aCapturedEnvironments.map(toPacEnvironmentRecord), null, 2) + '\n';
  if (typeof oOptions.onStdout === 'function') {
    oOptions.onStdout(sOutput);
  }
  return sOutput;
}

async function runCapEnvironmentSelectCommand(aArgs, oOptions = {}) {
  let oCapCore = getCapCore();
  let sEnvironmentId = getFlagValue(aArgs, '--environment');

  if (!sEnvironmentId) {
    throw 'Environment id is required.';
  }

  return await captureConsoleOutput(async () => {
    await oCapCore.capEnvironment(sEnvironmentId, { cwd: oOptions.cwd || getWorkspaceRoot(), namedArgs: {} });
  }, oOptions);
}

function getCapParsedInput(aArgs, oSchema = {}) {
  let oCapCore = getCapCore();
  if (typeof oCapCore.parseCommandInput === 'function') {
    return oCapCore.parseCommandInput(aArgs, oSchema);
  }

  return {
    target: aArgs.find((sArg) => sArg && !sArg.startsWith('-')) || '',
    passthroughArgs: aArgs.slice(),
    namedArgs: {}
  };
}

async function runCapDataverseCommand(aArgs, oOptions = {}) {
  let oCapCore = getCapCore();
  let sPrimaryCommand = String(aArgs[0] || '').toLowerCase();
  let sTableName = '';
  let oNamedArgs = {};

  if (sPrimaryCommand === 'add-data-source') {
    sTableName = getArgumentValue(aArgs, ['--resource-name', '--table-name', '--table']);
    let sEnvironment = getArgumentValue(aArgs, ['--org-url', '--environment', '-env']);
    if (sEnvironment) {
      oNamedArgs.environment = sEnvironment;
    }
  } else {
    let oParsed = getCapParsedInput(aArgs.slice(1), {
      valueFlags: ['--environment', '-env']
    });
    sTableName = oParsed.target;
    oNamedArgs = oParsed.namedArgs || {};
  }

  if (!sTableName) {
    throw 'A Dataverse table logical name is required.';
  }

  return await captureConsoleOutput(async () => {
    await withNonInteractiveTerminal(async () => {
      await oCapCore.capDataverse(sTableName, {
        cwd: oOptions.cwd || getWorkspaceRoot(),
        namedArgs: oNamedArgs
      });
    });
  }, oOptions);
}

function normalizeFlowRecordForOutput(oFlow) {
  if (!oFlow || typeof oFlow !== 'object') {
    return oFlow;
  }

  return Object.assign({}, oFlow, {
    flowId: oFlow.flowId || oFlow.workflowId || oFlow.id || oFlow.name || '',
    displayName: oFlow.displayName || oFlow.name || oFlow.friendlyName || oFlow.workflowId || ''
  });
}

async function runCapFlowListCommand(oOptions = {}) {
  ensurePowerAppsCliAuthFallbackPatched();
  let oCapCore = getCapCore();
  let aCapturedFlows = [];

  await withMutedConsole(async () => {
    oTerminalSelectorState.fnCaptureItems = (aItems) => {
      aCapturedFlows = Array.isArray(aItems) ? aItems : [];
    };

    try {
      await withNonInteractiveTerminal(async () => {
        await oCapCore.capFlow('', {
          cwd: oOptions.cwd || getWorkspaceRoot(),
          env: getSubprocessEnv(oOptions),
          passthroughArgs: ['--non-interactive', '--json']
        });
      });
    } finally {
      oTerminalSelectorState.fnCaptureItems = null;
    }
  });

  let sOutput = JSON.stringify(aCapturedFlows.map(normalizeFlowRecordForOutput), null, 2) + '\n';
  return writeCommandOutput(sOutput, oOptions);
}

async function runCapFlowCommand(aArgs, oOptions = {}) {
  ensurePowerAppsCliAuthFallbackPatched();
  let oCapCore = getCapCore();
  let sPrimaryCommand = String(aArgs[0] || '').toLowerCase();

  if (sPrimaryCommand === 'list-flows') {
    return await runCapFlowListCommand(oOptions);
  }

  let sFlowId = '';
  let aPassthroughArgs = [];
  if (sPrimaryCommand === 'add-flow') {
    sFlowId = getArgumentValue(aArgs, ['--flow-id', '--flow', '-f']);
    for (let iIndex = 1; iIndex < aArgs.length; iIndex++) {
      let sArg = aArgs[iIndex];
      if (['--flow-id', '--flow', '-f'].indexOf(sArg) !== -1) {
        iIndex += 1;
      } else {
        aPassthroughArgs.push(sArg);
      }
    }
  } else {
    let oParsed = getCapParsedInput(aArgs.slice(1), {
      valueFlags: ['--cloud', '--environment-id', '-e', '--search', '-s'],
      booleanFlags: ['--non-interactive', '--json', '--no-color']
    });
    sFlowId = oParsed.target;
    aPassthroughArgs = oParsed.passthroughArgs || [];
  }

  if (!sFlowId) {
    return await runCapFlowListCommand(oOptions);
  }

  return await captureConsoleOutput(async () => {
    await withNonInteractiveTerminal(async () => {
      await oCapCore.capFlow(sFlowId, {
        cwd: oOptions.cwd || getWorkspaceRoot(),
        env: getSubprocessEnv(oOptions),
        passthroughArgs: ensureArg(aPassthroughArgs, '--non-interactive')
      });
    });
  }, oOptions);
}

async function runCapDeployCommand(aArgs, oOptions = {}) {
  ensurePowerAppsCliAuthFallbackPatched();
  let oCapCore = getCapCore();
  let aDeployArgs = aArgs[0] === 'deploy' || aArgs[0] === 'push' ? aArgs.slice(1) : aArgs.slice();
  let oParsed = getCapParsedInput(aDeployArgs, {
    valueFlags: ['--cloud', '--environment-id', '-e', '--solution-id', '-s'],
    booleanFlags: ['--debugger', '--non-interactive', '--json', '--no-color']
  });
  let aPassthroughArgs = ensureArg((oParsed.passthroughArgs || []).filter((sArg) => sArg !== '--debugger'), '--non-interactive');

  return await captureConsoleOutput(async () => {
    await withNonInteractiveTerminal(async () => {
      let oDeployResult = await oCapCore.capDeploy({
        cwd: oOptions.cwd || getWorkspaceRoot(),
        env: getSubprocessEnv(oOptions),
        debugger: Boolean(oParsed.namedArgs && oParsed.namedArgs.debugger),
        passthroughArgs: aPassthroughArgs
      });
      if (oDeployResult) {
        console.log('CAP deploy result: ' + JSON.stringify(oDeployResult));
      }
    });
  }, oOptions);
}

async function runCapDebuggerCommand(oOptions = {}) {
  let oCapCore = getCapCore();

  if (typeof oCapCore.appendDebuggerBootstrap !== 'function') {
    throw 'Debugger enable is not available in codeapp-js-cli.';
  }

  return await captureConsoleOutput(async () => {
    let sIndexPath = await oCapCore.appendDebuggerBootstrap(oOptions.cwd || getWorkspaceRoot());
    console.log('Debugger bootstrap enabled in ' + sIndexPath);
  }, oOptions);
}

async function runPacCompatibilityCommand(aArgs, oOptions = {}) {
  let sGroup = String(aArgs[0] || '').toLowerCase();
  let sAction = String(aArgs[1] || '').toLowerCase();

  if (sGroup === 'auth') {
    return await runCapAuthCommand(aArgs, oOptions);
  }

  if (sGroup === 'env' && sAction === 'list') {
    return await runCapEnvironmentListCommand(oOptions);
  }

  if (sGroup === 'env' && sAction === 'select') {
    return await runCapEnvironmentSelectCommand(aArgs, oOptions);
  }

  throw 'Unsupported PAC compatibility command: ' + aArgs.join(' ');
}

async function runCodeAppCommand(sCommand, oOptions = {}) {
  let sCliEntry = getCodeAppCliEntry();
  let aArgs = parseShellLikeArgs(sCommand);
  let sPrimaryCommand = String(aArgs[0] || '').toLowerCase();

  if (sPrimaryCommand === 'pac') {
    return await runPacCompatibilityCommand(aArgs.slice(1), oOptions);
  }

  if (sPrimaryCommand === 'logout') {
    return await runCapAuthCommand(['auth', 'logout'], oOptions);
  }

  if (sPrimaryCommand === 'auth') {
    return await runCapAuthCommand(aArgs, oOptions);
  }

  if (sPrimaryCommand === 'environment') {
    if (aArgs.indexOf('--info') !== -1) {
      return await captureConsoleOutput(async () => {
        await getCapCore().capEnvironment('', { cwd: oOptions.cwd || getWorkspaceRoot(), namedArgs: { info: true } });
      }, oOptions);
    }

    if (aArgs.length > 1) {
      return await captureConsoleOutput(async () => {
        await getCapCore().capEnvironment(aArgs[1], { cwd: oOptions.cwd || getWorkspaceRoot(), namedArgs: {} });
      }, oOptions);
    }

    return await runCapEnvironmentListCommand(oOptions);
  }

  if (sPrimaryCommand === 'dataverse' || sPrimaryCommand === 'add-data-source') {
    return await runCapDataverseCommand(aArgs, oOptions);
  }

  if (sPrimaryCommand === 'flow' || sPrimaryCommand === 'list-flows' || sPrimaryCommand === 'add-flow') {
    return await runCapFlowCommand(aArgs, oOptions);
  }

  if (sPrimaryCommand === 'deploy' || sPrimaryCommand === 'push') {
    return await runCapDeployCommand(aArgs, oOptions);
  }

  if (sPrimaryCommand === 'debugger') {
    return await runCapDebuggerCommand(oOptions);
  }

  return await runProcessCommand(process.execPath, [sCliEntry].concat(aArgs), oOptions);
}

async function ensureCodeAppCliReady() {
  if (!isCodeAppCliInstalled()) {
    let sCliEntry = '';
    try {
      sCliEntry = getCodeAppCliEntry();
    } catch (oError) {
      sCliEntry = S_CODEAPP_JS_CLI_PACKAGE;
    }

    vscode.window.showErrorMessage('codeapp-js-cli was not found at ' + sCliEntry + '. Reinstall the extension.');
    return false;
  }

  return true;
}

function checkAndInstallCodeAppCli() {
  /* codeapp-js-cli is packaged as an extension dependency. */
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
