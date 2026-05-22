const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { runCodeAppCommand, runShellCommand, ensureCodeAppCliReady, getCodeAppCliCommand, getWorkspaceRoot } = require('./codeappCli');

let oConnectionSyncOutput = null;
let oCommandOutputs = {};
const S_ENVIRONMENT_STORAGE_KEY = 'selectedEnvironmentId';
const S_ENVIRONMENT_PLACEHOLDER = '<ENVIRONMENT ID>';
const S_AGENT_DIRECTORY_RELATIVE_PATH = 'agent';
const S_DEBUGGER_SNIPPET = "import { enableDebugger } from './codeapp.js';\nenableDebugger();\n";
const S_CODEAPP_COMMAND = 'codeapp-js-cli';

function getConnectionSyncOutput() {
  if (!oConnectionSyncOutput) {
    oConnectionSyncOutput = vscode.window.createOutputChannel('Code App Plus: Connection Sync');
  }
  return oConnectionSyncOutput;
}

function appendConnectionSyncLog(sMessage) {
  let oOutput = getConnectionSyncOutput();
  oOutput.appendLine(sMessage);
}

function appendConnectionSyncChunk(sChunk) {
  let oOutput = getConnectionSyncOutput();
  oOutput.append(sChunk);
}

function getCommandOutput(sTitle) {
  let sResolvedTitle = sTitle || 'Command';
  if (!oCommandOutputs[sResolvedTitle]) {
    oCommandOutputs[sResolvedTitle] = vscode.window.createOutputChannel('Code App Plus: ' + sResolvedTitle);
  }

  return oCommandOutputs[sResolvedTitle];
}

function simplifyCliErrorMessage(sMessage) {
  let sNormalizedMessage = String(sMessage || '')
    .replace(new RegExp('\r', 'g'), '')
    .trim();

  sNormalizedMessage = sNormalizedMessage
    .replace(new RegExp('^Error during CLI execution:\\s*', 'i'), '')
    .replace(new RegExp('^Error:\\s*', 'i'), '');

  let oCodeMatch = new RegExp('"code":"([^"]+)"', 'i').exec(sNormalizedMessage);
  let oDetailMatch = new RegExp('"message":"([^"]+)"', 'i').exec(sNormalizedMessage);

  if (oCodeMatch && oDetailMatch) {
    return oCodeMatch[1] + ': ' + oDetailMatch[1];
  }

  return sNormalizedMessage;
}

function normalizeErrorMessage(oError) {
  if (!oError) {
    return 'Unknown error';
  }

  if (typeof oError === 'string') {
    return simplifyCliErrorMessage(oError);
  }

  if (oError.message) {
    return simplifyCliErrorMessage(oError.message);
  }

  try {
    return JSON.stringify(oError);
  } catch (oSerializationError) {
    return String(oError);
  }
}

function createCommandReporter(oPanel, sTitle, sInitialStatus, oOptions = {}) {
  let sLastStatus = sInitialStatus || 'Working...';
  let oOutput = getCommandOutput(sTitle);
  let bShowOnStart = oOptions.bShowOnStart === true;
  let bShowOnError = oOptions.bShowOnError === true;

  return {
    start() {
      if (bShowOnStart) {
        oOutput.show(true);
      }
    },
    status(sText) {
      sLastStatus = sText;
    },
    log(sMessage) {
      oOutput.appendLine(sMessage);
    },
    raw(sChunk) {
      oOutput.append(sChunk);
    },
    show() {
      oOutput.show(true);
    },
    finish(sState, sText) {
      sLastStatus = sText || sLastStatus;
      oOutput.appendLine('[' + sState + '] ' + sLastStatus);
      if (sState === 'error' && bShowOnError) {
        oOutput.show(true);
      }
    },
    hasPanel() {
      return false;
    }
  };
}

async function runLoggedCodeAppCommand(sCommand, oReporter, oRunOptions = {}) {
  oReporter.log('> codeapp-js-cli ' + sCommand);
  return await runCodeAppCommand(sCommand, {
    cwd: oRunOptions.cwd,
    env: oRunOptions.env,
    bReturnCombinedOutput: oRunOptions.bReturnCombinedOutput === true,
    onStdout: (sChunk) => {
      oReporter.raw(sChunk);
    },
    onStderr: (sChunk) => {
      oReporter.raw(sChunk);
    }
  });
}

async function runLoggedShellCommand(sCommand, oReporter, oRunOptions = {}) {
  oReporter.log('> ' + sCommand);
  return await runShellCommand(sCommand, {
    cwd: oRunOptions.cwd,
    env: oRunOptions.env,
    onStdout: (sChunk) => {
      oReporter.raw(sChunk);
    },
    onStderr: (sChunk) => {
      oReporter.raw(sChunk);
    }
  });
}

async function runLoggedPacCommand(sCommand, oReporter, oRunOptions = {}) {
  return await runLoggedCodeAppCommand('pac ' + sCommand, oReporter, oRunOptions);
}

async function runLoggedPowerAppsCommand(sCommand, oReporter, oRunOptions = {}) {
  let sEnvironmentId = getConfiguredEnvironmentId();
  let oEnv = Object.assign({}, oRunOptions.env || {});
  let sResolvedCommand = sCommand;

  if (sResolvedCommand.indexOf('--non-interactive') === -1) {
    sResolvedCommand += ' --non-interactive';
  }

  if (sEnvironmentId && !oEnv.ENVIRONMENT_ID) {
    oEnv.ENVIRONMENT_ID = getPacSelectableEnvironmentId(sEnvironmentId);
  }

  oReporter.log('> ' + S_CODEAPP_COMMAND + ' ' + sResolvedCommand);
  return await runCodeAppCommand(sResolvedCommand, {
    cwd: oRunOptions.cwd,
    env: oEnv,
    bReturnCombinedOutput: oRunOptions.bReturnCombinedOutput === true,
    onStdout: (sChunk) => {
      oReporter.raw(sChunk);
    },
    onStderr: (sChunk) => {
      oReporter.raw(sChunk);
    }
  });
}

function getPowerConfigPath() {
  let sRoot = getWorkspaceRoot();
  if (!sRoot) {
    return '';
  }
  return path.join(sRoot, 'power.config.json');
}

function getPowerConfig() {
  let sConfigPath = getPowerConfigPath();
  if (!sConfigPath || !fs.existsSync(sConfigPath)) {
    throw new Error('power.config.json was not found in the workspace root.');
  }

  let sContent = fs.readFileSync(sConfigPath, 'utf8');
  return {
    sConfigPath: sConfigPath,
    oConfig: JSON.parse(sContent)
  };
}

function getConfiguredEnvironmentId() {
  try {
    let { oConfig } = getPowerConfig();
    let sEnvironmentId = normalizeEnvironmentId(oConfig && oConfig.environmentId ? oConfig.environmentId : '');
    return sEnvironmentId && sEnvironmentId.indexOf('<') === -1 ? sEnvironmentId : '';
  } catch (oError) {
    return '';
  }
}

function getConfiguredAppId() {
  try {
    let { oConfig } = getPowerConfig();
    let sAppId = String(oConfig && oConfig.appId ? oConfig.appId : '').trim();
    return new RegExp('^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'i').test(sAppId) ? sAppId : '';
  } catch (oError) {
    return '';
  }
}

function getBuildEntryPointPath(sConfigPath, oConfig) {
  if (!sConfigPath) {
    return '';
  }

  let sConfigDirectory = path.dirname(sConfigPath);
  let sBuildPath = oConfig && oConfig.buildPath ? String(oConfig.buildPath).trim() : '';
  let sBuildEntryPoint = oConfig && oConfig.buildEntryPoint ? String(oConfig.buildEntryPoint).trim() : '';

  if (!sBuildEntryPoint) {
    sBuildEntryPoint = 'index.html';
  }

  if (sBuildPath) {
    return path.resolve(sConfigDirectory, sBuildPath, sBuildEntryPoint);
  }

  return path.resolve(sConfigDirectory, sBuildEntryPoint);
}

function escapeHtmlText(sValue) {
  return String(sValue || '')
    .replace(new RegExp('&', 'g'), '&amp;')
    .replace(new RegExp('<', 'g'), '&lt;')
    .replace(new RegExp('>', 'g'), '&gt;');
}

function updateBuildEntryPointTitle(sConfigPath, oConfig) {
  let sBuildEntryPointPath = getBuildEntryPointPath(sConfigPath, oConfig);
  if (!sBuildEntryPointPath || !fs.existsSync(sBuildEntryPointPath)) {
    return false;
  }

  let sAppDisplayName = oConfig && oConfig.appDisplayName ? String(oConfig.appDisplayName).trim() : '';
  if (!sAppDisplayName) {
    return false;
  }

  let sContent = fs.readFileSync(sBuildEntryPointPath, 'utf8');
  let sUpdatedContent = sContent.replace(
    new RegExp('<title>[\\s\\S]*?<\\/title>', 'i'),
    '<title>' + escapeHtmlText(sAppDisplayName) + '</title>'
  );

  if (sUpdatedContent === sContent) {
    return false;
  }

  fs.writeFileSync(sBuildEntryPointPath, sUpdatedContent, 'utf8');
  return true;
}

function getDebuggerIndexPath() {
  let sRoot = getWorkspaceRoot();
  if (!sRoot) {
    return '';
  }

  let sConfigPath = getPowerConfigPath();
  if (sConfigPath && fs.existsSync(sConfigPath)) {
    let { sConfigPath: sResolvedConfigPath, oConfig } = getPowerConfig();
    let sConfigDirectory = path.dirname(sResolvedConfigPath);
    let sBuildPath = oConfig && oConfig.buildPath ? String(oConfig.buildPath).trim() : '';
    let sBuildEntryPoint = oConfig && oConfig.buildEntryPoint ? String(oConfig.buildEntryPoint).trim() : '';
    let sBuildDirectory = sBuildPath ? path.resolve(sConfigDirectory, sBuildPath) : path.dirname(getBuildEntryPointPath(sResolvedConfigPath, oConfig));
    let sIndexPath = path.join(sBuildDirectory, 'index.js');

    if (fs.existsSync(sIndexPath)) {
      return sIndexPath;
    }

    if (sBuildEntryPoint) {
      let sBuildEntryPointPath = getBuildEntryPointPath(sResolvedConfigPath, oConfig);
      let sSiblingIndexPath = path.join(path.dirname(sBuildEntryPointPath), 'index.js');
      if (fs.existsSync(sSiblingIndexPath)) {
        return sSiblingIndexPath;
      }
    }
  }

  let aFallbackPaths = [
    path.join(sRoot, 'dist', 'index.js'),
    path.join(sRoot, 'index.js')
  ];

  for (let iIndex = 0; iIndex < aFallbackPaths.length; iIndex++) {
    if (fs.existsSync(aFallbackPaths[iIndex])) {
      return aFallbackPaths[iIndex];
    }
  }

  return '';
}

function isDebuggerEnabledContent(sContent) {
  if (!sContent) {
    return false;
  }

  return sContent.indexOf("import { enableDebugger } from './codeapp.js';") !== -1 &&
    sContent.indexOf('enableDebugger();') !== -1;
}

function readDebuggerState() {
  let sIndexPath = getDebuggerIndexPath();
  if (!sIndexPath || !fs.existsSync(sIndexPath)) {
    return {
      bEnabled: false,
      sIndexPath: sIndexPath,
      bExists: false
    };
  }

  let sContent = fs.readFileSync(sIndexPath, 'utf8');
  return {
    bEnabled: isDebuggerEnabledContent(sContent),
    sIndexPath: sIndexPath,
    bExists: true
  };
}

function enableDebuggerInContent(sContent) {
  if (isDebuggerEnabledContent(sContent)) {
    return sContent;
  }

  let sNormalizedContent = String(sContent || '');
  return S_DEBUGGER_SNIPPET + '\n' + sNormalizedContent;
}

function disableDebuggerInContent(sContent) {
  let sNormalizedContent = String(sContent || '');
  let oDebuggerBlockRegex = new RegExp("^import \\{ enableDebugger \\} from './codeapp\\.js';\\r?\\nenableDebugger\\(\\);\\r?\\n(?:\\r?\\n)?", '');
  return sNormalizedContent.replace(oDebuggerBlockRegex, '');
}

async function toggleDebugger() {
  let oReporter = createCommandReporter(null, 'Debugger', 'Toggling debugger...');

  try {
    let oState = readDebuggerState();
    if (!oState.bExists || !oState.sIndexPath) {
      throw new Error('index.js was not found in the current app build path.');
    }

    let sContent = fs.readFileSync(oState.sIndexPath, 'utf8');
    let bEnable = !oState.bEnabled;
    if (bEnable) {
      oReporter.start();
      oReporter.status('Running CAP debugger...');
      await runLoggedCodeAppCommand('debugger', oReporter);
    } else {
      let sUpdatedContent = disableDebuggerInContent(sContent);
      if (sUpdatedContent !== sContent) {
        oReporter.start();
        oReporter.status('Disabling debugger...');
        fs.writeFileSync(oState.sIndexPath, sUpdatedContent, 'utf8');
      }
    }

    let sMessage = bEnable ? 'Debugger enabled in ' + toWorkspaceRelativePath(oState.sIndexPath) + '.' : 'Debugger disabled in ' + toWorkspaceRelativePath(oState.sIndexPath) + '.';
    oReporter.finish('done', sMessage);

    if (!oReporter.hasPanel()) {
      vscode.window.showInformationMessage(sMessage);
    }
  } catch (oError) {
    let sMessage = 'Debugger toggle failed: ' + normalizeErrorMessage(oError);
    oReporter.log(sMessage);
    oReporter.finish('error', sMessage);
    if (!oReporter.hasPanel()) {
      vscode.window.showErrorMessage(sMessage);
    }
  }
}

function getStoredEnvironmentId(oContext) {
  if (!oContext || !oContext.globalState) {
    return '';
  }

  let sEnvironmentId = oContext.globalState.get(S_ENVIRONMENT_STORAGE_KEY, '');
  if (!sEnvironmentId || sEnvironmentId.indexOf('<') !== -1) {
    return '';
  }

  return normalizeEnvironmentId(sEnvironmentId);
}

async function storeEnvironmentId(oContext, sEnvironmentId) {
  if (!oContext || !oContext.globalState) {
    return false;
  }

  let sNormalizedEnvironmentId = normalizeEnvironmentId(sEnvironmentId);
  await oContext.globalState.update(S_ENVIRONMENT_STORAGE_KEY, sNormalizedEnvironmentId);
  return true;
}

function getSetupConfigInitialValues(oContext, sConfigPath) {
  let oInitialValues = {
    sAppDisplayName: '',
    sDescription: '',
    sLogoPath: '',
    sEnvironmentId: S_ENVIRONMENT_PLACEHOLDER
  };

  if (sConfigPath && fs.existsSync(sConfigPath)) {
    let sExistingContent = fs.readFileSync(sConfigPath, 'utf8');
    let oConfig = JSON.parse(sExistingContent);
    oInitialValues.sAppDisplayName = oConfig.appDisplayName || '';
    oInitialValues.sDescription = oConfig.description || '';
    oInitialValues.sLogoPath = oConfig.logoPath || '';
    oInitialValues.sEnvironmentId = oConfig.environmentId || S_ENVIRONMENT_PLACEHOLDER;
  }

  let sStoredEnvironmentId = getStoredEnvironmentId(oContext);
  if (sStoredEnvironmentId) {
    oInitialValues.sEnvironmentId = sStoredEnvironmentId;
  } else if (!oInitialValues.sEnvironmentId || oInitialValues.sEnvironmentId.indexOf('<') !== -1) {
    oInitialValues.sEnvironmentId = S_ENVIRONMENT_PLACEHOLDER;
  } else {
    oInitialValues.sEnvironmentId = normalizeEnvironmentId(oInitialValues.sEnvironmentId);
  }

  return oInitialValues;
}

function getApiNameFromReference(oReference) {
  if (!oReference || !oReference.id) {
    return '';
  }

  let aParts = oReference.id.split('/').filter((sPart) => sPart);
  if (aParts.length === 0) {
    return '';
  }

  return aParts[aParts.length - 1];
}

function getDefaultDataSourceName(sApiName) {
  if (!sApiName) {
    return '';
  }

  return sApiName.replace(new RegExp('^shared_', 'i'), '');
}

function isGuidLikeKey(sKey) {
  if (!sKey) {
    return false;
  }

  return new RegExp('^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', 'i').test(sKey);
}

function normalizeConnectionReferences(sConfigPath, aReferenceEntries) {
  if (!sConfigPath || !fs.existsSync(sConfigPath)) {
    return false;
  }

  let sContent = fs.readFileSync(sConfigPath, 'utf8');
  let oConfig = JSON.parse(sContent);
  let oConnectionReferences = oConfig.connectionReferences || {};
  let bChanged = false;

  aReferenceEntries.forEach(([sReferenceName, oOriginalReference]) => {
    let sApiName = getApiNameFromReference(oOriginalReference);
    let sDefaultDataSourceName = getDefaultDataSourceName(sApiName);
    let oNamedReference = oConnectionReferences[sReferenceName] || null;
    let aMatchingEntries = Object.entries(oConnectionReferences).filter(([sKey, oReference]) => {
      return sKey !== sReferenceName && oReference && oReference.id === oOriginalReference.id;
    });

    if (!oNamedReference && aMatchingEntries.length === 0) {
      return;
    }

    let oGeneratedReference = aMatchingEntries.length > 0 ? aMatchingEntries[0][1] : null;
    let oMergedReference = Object.assign({}, oOriginalReference, oNamedReference || {}, oGeneratedReference || {});

    if (sDefaultDataSourceName) {
      oMergedReference.dataSources = Array.isArray(oGeneratedReference?.dataSources) && oGeneratedReference.dataSources.length > 0
        ? oGeneratedReference.dataSources
        : [sDefaultDataSourceName];
    }

    if (!oConnectionReferences[sReferenceName] || JSON.stringify(oConnectionReferences[sReferenceName]) !== JSON.stringify(oMergedReference)) {
      oConnectionReferences[sReferenceName] = oMergedReference;
      bChanged = true;
    }

    aMatchingEntries.forEach(([sKey]) => {
      if (isGuidLikeKey(sKey)) {
        delete oConnectionReferences[sKey];
        bChanged = true;
      }
    });
  });

  if (bChanged) {
    oConfig.connectionReferences = oConnectionReferences;
    fs.writeFileSync(sConfigPath, JSON.stringify(oConfig, null, 2) + '\n', 'utf8');
  }

  return bChanged;
}

function normalizeEnvironmentId(sEnvironmentId) {
  if (!sEnvironmentId) {
    return '';
  }

  return String(sEnvironmentId).trim();
}

function buildStoredEnvironmentId(sEnvironmentId, bIsDefault) {
  let sNormalizedEnvironmentId = normalizeEnvironmentId(sEnvironmentId);
  if (!sNormalizedEnvironmentId) {
    return '';
  }

  if (bIsDefault && sNormalizedEnvironmentId.toLowerCase().indexOf('default-') !== 0) {
    return 'Default-' + sNormalizedEnvironmentId;
  }

  return sNormalizedEnvironmentId;
}

function getPacSelectableEnvironmentId(sEnvironmentId) {
  return normalizeEnvironmentId(sEnvironmentId).replace(new RegExp('^Default-', 'i'), '');
}

function getComparableEnvironmentId(sEnvironmentId) {
  return normalizeEnvironmentId(sEnvironmentId).replace(new RegExp('^Default-', 'i'), '').toLowerCase();
}

function areEnvironmentIdsEquivalent(sLeftEnvironmentId, sRightEnvironmentId) {
  let sLeftComparableEnvironmentId = getComparableEnvironmentId(sLeftEnvironmentId);
  let sRightComparableEnvironmentId = getComparableEnvironmentId(sRightEnvironmentId);

  if (!sLeftComparableEnvironmentId || !sRightComparableEnvironmentId) {
    return false;
  }

  return sLeftComparableEnvironmentId === sRightComparableEnvironmentId;
}

function parseWhoOutputJson(sOutput) {
  if (!sOutput) {
    return null;
  }

  try {
    let oParsed = JSON.parse(sOutput);
    if (!oParsed || Array.isArray(oParsed)) {
      return null;
    }

    return oParsed;
  } catch (oError) {
    return null;
  }
}

function getEnvironmentIdFromWhoOutput(sOutput) {
  let oParsed = parseWhoOutputJson(sOutput);
  if (oParsed && oParsed.EnvironmentId) {
    return normalizeEnvironmentId(oParsed.EnvironmentId);
  }

  let oMatch = new RegExp('(?:Org URL|Dynamics URL):\s*(https://\S+)', 'i').exec(sOutput || '');
  return oMatch ? normalizeEnvironmentId(oMatch[1]) : '';
}

function getEnvironmentUrlFromWhoOutput(sOutput) {
  let oParsed = parseWhoOutputJson(sOutput);
  if (oParsed && (oParsed.OrgUrl || oParsed.EnvironmentUrl)) {
    return normalizeEnvironmentUrl(oParsed.OrgUrl || oParsed.EnvironmentUrl);
  }

  let oMatch = new RegExp('Org URL:\\s*(https://\\S+)', 'i').exec(sOutput || '');
  return oMatch ? oMatch[1] : '';
}

function normalizeEnvironmentUrl(sUrl) {
  if (!sUrl) {
    return '';
  }

  return sUrl.trim().replace(new RegExp('/+$'), '').toLowerCase();
}

function applyActiveEnvironmentState(aEnvironments, sWhoOutput) {
  let sActiveEnvironmentId = getEnvironmentIdFromWhoOutput(sWhoOutput);
  let sActiveEnvironmentUrl = normalizeEnvironmentUrl(getEnvironmentUrlFromWhoOutput(sWhoOutput));

  return aEnvironments.map((oEnvironment) => {
    let sEnvironmentId = normalizeEnvironmentId(oEnvironment.sId);
    let sEnvironmentUrl = normalizeEnvironmentUrl(oEnvironment.sUrl);
    let bActive = false;

    if (areEnvironmentIdsEquivalent(sEnvironmentId, sActiveEnvironmentId)) {
      bActive = true;
    } else if (sActiveEnvironmentUrl && sEnvironmentUrl === sActiveEnvironmentUrl) {
      bActive = true;
    }

    return Object.assign({}, oEnvironment, { bActive: bActive });
  });
}

function dedupeEnvironments(aEnvironments) {
  let oSeen = new Set();

  return (aEnvironments || []).filter((oEnvironment) => {
    let sKey = getComparableEnvironmentId(oEnvironment && oEnvironment.sId ? oEnvironment.sId : '') || normalizeEnvironmentUrl(oEnvironment && oEnvironment.sUrl ? oEnvironment.sUrl : '');
    if (!sKey || oSeen.has(sKey)) {
      return false;
    }

    oSeen.add(sKey);
    return true;
  });
}

function parseEnvironmentListJsonOutput(sOutput, sWhoOutput) {
  if (!sOutput) {
    return [];
  }

  try {
    let aParsed = JSON.parse(sOutput);
    if (!Array.isArray(aParsed)) {
      return [];
    }

    let aEnvironments = aParsed
      .map((oEnvironment) => {
        let oEnvironmentIdentifier = oEnvironment && oEnvironment.EnvironmentIdentifier ? oEnvironment.EnvironmentIdentifier : {};
        let bIsDefault = Boolean(oEnvironmentIdentifier.IsDefault) || Number(oEnvironmentIdentifier.Type) === 2 || Boolean(oEnvironment && oEnvironment.IsDefault);
        let sEnvironmentId = buildStoredEnvironmentId(
          oEnvironmentIdentifier.Id || oEnvironment?.EnvironmentId || oEnvironment?.Id || oEnvironment?.name || oEnvironment?.environmentId || '',
          bIsDefault
        );
        if (!sEnvironmentId) {
          return null;
        }

        return {
          sName: oEnvironment.FriendlyName || oEnvironment.UniqueName || oEnvironment.displayName || oEnvironment.name || sEnvironmentId,
          sId: sEnvironmentId,
          sUrl: oEnvironment.EnvironmentUrl || oEnvironment.dynamicsUrl || oEnvironment.instanceApiUrl || '',
          bActive: false
        };
      })
      .filter((oEnvironment) => Boolean(oEnvironment));

    return dedupeEnvironments(applyActiveEnvironmentState(aEnvironments, sWhoOutput));
  } catch (oError) {
    return [];
  }
}

function parseEnvironmentListTextOutput(sOutput, sWhoOutput) {
  let aLines = (sOutput || '').split('\n').filter((sLine) => sLine.trim().length > 0);
  let aEnvironments = [];
  let oEnvironmentIdRegex = new RegExp('(?:Default-)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', 'i');
  let oUrlRegex = new RegExp('https://\\S+');

  aLines.slice(2).forEach((sLine) => {
    let sTrimmed = sLine.trim();
    if (!sTrimmed) {
      return;
    }

    let bActive = sLine.indexOf('*') >= 0 && sLine.indexOf('*') < 10;
    let oEnvironmentIdMatch = oEnvironmentIdRegex.exec(sTrimmed);
    let oUrlMatch = oUrlRegex.exec(sTrimmed);

    if (!oEnvironmentIdMatch) {
      return;
    }

    let sBeforeEnvironmentId = sTrimmed.substring(0, oEnvironmentIdMatch.index).trim();
    if (bActive && sBeforeEnvironmentId.startsWith('*')) {
      sBeforeEnvironmentId = sBeforeEnvironmentId.substring(1).trim();
    }

    let bIsDefault = new RegExp('\(default\)', 'i').test(sBeforeEnvironmentId);

    aEnvironments.push({
      sName: sBeforeEnvironmentId || 'Unknown',
      sId: buildStoredEnvironmentId(oEnvironmentIdMatch[0], bIsDefault),
      sUrl: oUrlMatch ? oUrlMatch[0] : '',
      bActive: bActive
    });
  });

  return dedupeEnvironments(applyActiveEnvironmentState(aEnvironments, sWhoOutput));
}

function updatePowerConfigEnvironmentId(sEnvironmentId) {
  let sConfigPath = getPowerConfigPath();
  if (!sConfigPath || !fs.existsSync(sConfigPath)) {
    return false;
  }

  let sContent = fs.readFileSync(sConfigPath, 'utf8');
  let oConfig = JSON.parse(sContent);
  let sNormalizedEnvironmentId = normalizeEnvironmentId(sEnvironmentId);
  let bChanged = false;

  if (oConfig.environmentId !== sNormalizedEnvironmentId) {
    oConfig.environmentId = sNormalizedEnvironmentId;
    bChanged = true;
  }

  if (bChanged) {
    fs.writeFileSync(sConfigPath, JSON.stringify(oConfig, null, 2) + '\n', 'utf8');
  }

  return bChanged;
}

function extractPowerAppsUrl(sOutput) {
  let sNormalizedOutput = String(sOutput || '')
    .replace(new RegExp('\\u001b\\][^\\u0007]*(?:\\u0007|\\u001b\\\\)', 'g'), '')
    .replace(new RegExp('\\u001b\\[[0-9;?]*[ -/]*[@-~]', 'g'), '')
    .replace(new RegExp('[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f]', 'g'), '')
    .replace(new RegExp('\r', 'g'), '');
  let oMatch = new RegExp('https://apps\\.powerapps\\.com/play/e/[^\\s"\'<>]+/app/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[^\\s"\'<>]*', 'i').exec(sNormalizedOutput) ||
    new RegExp('https://apps\\.powerapps\\.com/play/[^\\s"\'<>]+', 'i').exec(sNormalizedOutput);
  if (!oMatch) {
    return '';
  }

  return oMatch[0].replace(new RegExp('[\),.;]+$'), '');
}

function getAppIdFromPowerAppsUrl(sUrl) {
  let oMatch = new RegExp('/app/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?=[/?#]|$)', 'i').exec(sUrl || '') ||
    new RegExp('/a/app/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?=[/?#]|$)', 'i').exec(sUrl || '');
  return oMatch ? oMatch[1] : '';
}

function getTenantIdFromEnvironmentId(sEnvironmentId) {
  let sNormalizedEnvironmentId = normalizeEnvironmentId(sEnvironmentId);
  let oDefaultMatch = new RegExp('^Default-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$', 'i').exec(sNormalizedEnvironmentId);
  return oDefaultMatch ? oDefaultMatch[1].toLowerCase() : '';
}

function buildPowerAppsPlayUrl(sEnvironmentId, sAppId) {
  let sNormalizedEnvironmentId = normalizeEnvironmentId(sEnvironmentId).toLowerCase();
  let sNormalizedAppId = String(sAppId || '').trim().toLowerCase();
  if (!sNormalizedEnvironmentId || !sNormalizedAppId) {
    return '';
  }

  let sUrl = 'https://apps.powerapps.com/play/e/' + encodeURIComponent(sNormalizedEnvironmentId) + '/app/' + encodeURIComponent(sNormalizedAppId);
  let sTenantId = getTenantIdFromEnvironmentId(sNormalizedEnvironmentId);
  if (sTenantId) {
    sUrl += '?tenantId=' + encodeURIComponent(sTenantId) + '&source=portal';
  }
  return sUrl;
}

function extractAppIdFromDeployOutput(sOutput) {
  let sNormalizedOutput = String(sOutput || '')
    .replace(new RegExp('\\u001b\\[[0-9;]*m', 'g'), '')
    .replace(new RegExp('\r', 'g'), '');
  let aPatterns = [
    new RegExp('"appId"\\s*:\\s*"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"', 'i'),
    new RegExp('appId\\s+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', 'i'),
    new RegExp('app id\\s*[:=]?\\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', 'i')
  ];

  for (let iIndex = 0; iIndex < aPatterns.length; iIndex++) {
    let oMatch = aPatterns[iIndex].exec(sNormalizedOutput);
    if (oMatch) {
      return oMatch[1];
    }
  }

  return '';
}

function getDeployOutputDetails(sOutput) {
  let sNormalizedOutput = String(sOutput || '')
    .replace(new RegExp('\\u001b\\[[0-9;]*m', 'g'), '')
    .replace(new RegExp('\r', 'g'), '')
    .trim();

  if (!sNormalizedOutput) {
    return 'No deploy output was captured from CAP deploy.';
  }

  let aLines = sNormalizedOutput.split('\n').map((sLine) => sLine.trim()).filter((sLine) => sLine);
  return aLines.slice(Math.max(0, aLines.length - 20)).join('\n');
}

function updatePowerConfigAppId(sAppId) {
  let sConfigPath = getPowerConfigPath();
  if (!sConfigPath || !fs.existsSync(sConfigPath)) {
    return {
      bConfigFound: false,
      bUpdated: false,
      sConfigPath: sConfigPath
    };
  }

  let sContent = fs.readFileSync(sConfigPath, 'utf8');
  let oConfig = JSON.parse(sContent);
  let oConfigWithoutAppId = Object.assign({}, oConfig);
  delete oConfigWithoutAppId.appId;

  let oUpdatedConfig = Object.assign({ appId: sAppId }, oConfigWithoutAppId);
  let bUpdated = JSON.stringify(oConfig) !== JSON.stringify(oUpdatedConfig);

  if (bUpdated) {
    fs.writeFileSync(sConfigPath, JSON.stringify(oUpdatedConfig, null, 2) + '\n', 'utf8');
  }

  return {
    bConfigFound: true,
    bUpdated: bUpdated,
    sConfigPath: sConfigPath
  };
}

function stripUnsupportedDeployConnectionReferenceFields(oConnectionReference) {
  if (!oConnectionReference || typeof oConnectionReference !== 'object' || Array.isArray(oConnectionReference)) {
    return oConnectionReference;
  }

  let oSanitizedReference = Object.assign({}, oConnectionReference);
  delete oSanitizedReference.workflowDetails;
  return oSanitizedReference;
}

function sanitizePowerConfigForDeploy() {
  let sConfigPath = getPowerConfigPath();
  if (!sConfigPath || !fs.existsSync(sConfigPath)) {
    return {
      bConfigFound: false,
      bSanitized: false,
      iRemovedWorkflowDetailsCount: 0,
      sConfigPath: sConfigPath,
      sOriginalContent: ''
    };
  }

  let sOriginalContent = fs.readFileSync(sConfigPath, 'utf8');
  let oConfig = JSON.parse(sOriginalContent);
  let oConnectionReferences = oConfig && oConfig.connectionReferences ? oConfig.connectionReferences : null;
  if (!oConnectionReferences || typeof oConnectionReferences !== 'object') {
    return {
      bConfigFound: true,
      bSanitized: false,
      iRemovedWorkflowDetailsCount: 0,
      sConfigPath: sConfigPath,
      sOriginalContent: sOriginalContent
    };
  }

  let iRemovedWorkflowDetailsCount = 0;
  let oSanitizedConnectionReferences = Object.fromEntries(
    Object.entries(oConnectionReferences).map(([sReferenceName, oReference]) => {
      let bHadWorkflowDetails = Boolean(oReference && typeof oReference === 'object' && !Array.isArray(oReference) && oReference.workflowDetails);
      if (bHadWorkflowDetails) {
        iRemovedWorkflowDetailsCount += 1;
      }

      return [sReferenceName, stripUnsupportedDeployConnectionReferenceFields(oReference)];
    })
  );

  if (iRemovedWorkflowDetailsCount === 0) {
    return {
      bConfigFound: true,
      bSanitized: false,
      iRemovedWorkflowDetailsCount: 0,
      sConfigPath: sConfigPath,
      sOriginalContent: sOriginalContent
    };
  }

  oConfig.connectionReferences = oSanitizedConnectionReferences;
  fs.writeFileSync(sConfigPath, JSON.stringify(oConfig, null, 2) + '\n', 'utf8');
  return {
    bConfigFound: true,
    bSanitized: true,
    iRemovedWorkflowDetailsCount: iRemovedWorkflowDetailsCount,
    sConfigPath: sConfigPath,
    sOriginalContent: sOriginalContent
  };
}

function restorePowerConfigAfterDeploy(oSanitizedConfigState) {
  if (!oSanitizedConfigState || !oSanitizedConfigState.bSanitized || !oSanitizedConfigState.sConfigPath) {
    return false;
  }

  fs.writeFileSync(oSanitizedConfigState.sConfigPath, oSanitizedConfigState.sOriginalContent, 'utf8');
  return true;
}

function getConnectorHelperPath(sApiName) {
  let sRoot = getWorkspaceRoot();
  if (!sRoot) {
    return '';
  }

  let oMap = {
    shared_office365groups: path.join(sRoot, 'dist', 'office365groups.js')
  };

  return oMap[sApiName] || '';
}

function updateConnectorHelperDataSourceName(sApiName, sDataSourceName) {
  let sHelperPath = getConnectorHelperPath(sApiName);
  if (!sHelperPath || !fs.existsSync(sHelperPath)) {
    return false;
  }

  let sContent = fs.readFileSync(sHelperPath, 'utf8');
  let sUpdated = sContent.replace(
    new RegExp('const DATA_SOURCE = ".*?";'),
    'const DATA_SOURCE = "' + sDataSourceName + '";'
  );

  if (sUpdated !== sContent) {
    fs.writeFileSync(sHelperPath, sUpdated, 'utf8');
    return true;
  }

  return false;
}

function updateOffice365GroupsHelperMetadata() {
  let sHelperPath = getConnectorHelperPath('shared_office365groups');
  if (!sHelperPath || !fs.existsSync(sHelperPath)) {
    return false;
  }

  let sContent = fs.readFileSync(sHelperPath, 'utf8');
  let sUpdated = sContent.replace(
    new RegExp('const GROUPS_APIS = \\{[\\s\\S]*?\\n\\};'),
    'const GROUPS_APIS = {\n' +
    '  ListOwnedGroups: {\n' +
    '    path: "/{connectionId}/v1.0/me/memberOf/$/microsoft.graph.group",\n' +
    '    method: "GET",\n' +
    '    parameters: [\n' +
    '      { name: "connectionId", in: "path", required: true },\n' +
    '    ],\n' +
    '  },\n' +
    '  ListGroupMembers: {\n' +
    '    path: "/{connectionId}/v1.0/groups/{groupId}/members",\n' +
    '    method: "GET",\n' +
    '    parameters: [\n' +
    '      { name: "connectionId", in: "path", required: true },\n' +
    '      { name: "groupId", in: "path", required: true },\n' +
    '      { name: "$top", in: "query", required: false },\n' +
    '    ],\n' +
    '  },\n' +
    '  HttpRequest: {\n' +
    '    path: "/{connectionId}/httprequest",\n' +
    '    method: "POST",\n' +
    '    parameters: [\n' +
    '      { name: "connectionId", in: "path", required: true },\n' +
    '    ],\n' +
    '  },\n' +
    '};'
  );

  if (sUpdated !== sContent) {
    fs.writeFileSync(sHelperPath, sUpdated, 'utf8');
    return true;
  }

  return false;
}

function normalizeConnectionListOutput(sOutput) {
  return sOutput
    .replace(new RegExp('\\r\\n', 'g'), '\n')
    .replace(new RegExp('^Connected as.*\\n?', 'i'), '')
    .replace(new RegExp('^Id\\s+Name[\\s\\S]*?Status\\s*', 'i'), '')
    .replace(new RegExp('\\n', 'g'), ' ')
    .replace(new RegExp('\\s+', 'g'), ' ')
    .trim();
}

function parseConnectionListOutput(sOutput) {
  let sNormalized = normalizeConnectionListOutput(sOutput);
  let aEntries = [];
  let sIdPattern = '(?:shared-[a-z0-9-]+|[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})';
  let oEntryRegex = new RegExp(
    '(' + sIdPattern + ')\\s+(.+?)\\s+(/providers/Microsoft\\.PowerApps/apis/[^\\s]+)\\s+(Connected|Error)(?=\\s+(?:' + sIdPattern + ')\\s+|$)',
    'gi'
  );

  let oMatch = null;
  while ((oMatch = oEntryRegex.exec(sNormalized)) !== null) {
    aEntries.push({
      sId: oMatch[1],
      sName: oMatch[2].trim(),
      sApiId: oMatch[3],
      sStatus: oMatch[4]
    });
  }

  return aEntries;
}

function findConnectedConnection(aConnections, sApiId) {
  let aMatches = aConnections.filter((oConnection) => oConnection.sApiId === sApiId && oConnection.sStatus === 'Connected');
  if (aMatches.length > 0) {
    return aMatches[0];
  }

  return null;
}

function isExistingDataSourceError(sError) {
  if (!sError) {
    return false;
  }

  let sNormalized = String(sError).toLowerCase();
  return sNormalized.indexOf('already exists') !== -1 ||
    sNormalized.indexOf('already been added') !== -1 ||
    sNormalized.indexOf('duplicate') !== -1 ||
    sNormalized.indexOf('same key has already been added') !== -1;
}

function isValidDataverseTableName(sTableName) {
  return new RegExp('^[a-z0-9_]+$', 'i').test(String(sTableName || '').trim());
}

function getDataverseSchemaDirectory() {
  let sRoot = getWorkspaceRoot();
  if (!sRoot) {
    return '';
  }

  return path.join(sRoot, '.power', 'schemas', 'dataverse');
}

function getFlowSchemaDirectory() {
  let sRoot = getWorkspaceRoot();
  if (!sRoot) {
    return '';
  }

  return path.join(sRoot, '.power', 'schemas', 'logicflows');
}

function listDataverseSchemaFiles(sDirectoryPath) {
  if (!sDirectoryPath || !fs.existsSync(sDirectoryPath)) {
    return [];
  }

  return fs.readdirSync(sDirectoryPath, { withFileTypes: true })
    .filter((oEntry) => oEntry.isFile() && new RegExp('\\.Schema\\.json$', 'i').test(oEntry.name))
    .map((oEntry) => {
      let sFullPath = path.join(sDirectoryPath, oEntry.name);
      let oStats = fs.statSync(sFullPath);
      return {
        sName: oEntry.name,
        sFullPath: sFullPath,
        iMtimeMs: oStats.mtimeMs
      };
    });
}

function findGeneratedDataverseSchemaFile(sDirectoryPath, sTableName, aBeforeFiles) {
  let aAfterFiles = listDataverseSchemaFiles(sDirectoryPath);
  if (aAfterFiles.length === 0) {
    return null;
  }

  let sExpectedFileName = String(sTableName || '').trim() + '.Schema.json';
  let oExpectedFile = aAfterFiles.find((oFile) => oFile.sName.toLowerCase() === sExpectedFileName.toLowerCase());
  if (oExpectedFile) {
    return oExpectedFile;
  }

  let oBeforeFilesByName = {};
  (aBeforeFiles || []).forEach((oFile) => {
    oBeforeFilesByName[oFile.sName.toLowerCase()] = oFile;
  });

  let aChangedFiles = aAfterFiles.filter((oFile) => {
    let oBeforeFile = oBeforeFilesByName[oFile.sName.toLowerCase()];
    return !oBeforeFile || oFile.iMtimeMs > oBeforeFile.iMtimeMs + 1;
  });

  if (aChangedFiles.length > 0) {
    aChangedFiles.sort((oLeft, oRight) => oRight.iMtimeMs - oLeft.iMtimeMs);
    return aChangedFiles[0];
  }

  aAfterFiles.sort((oLeft, oRight) => oRight.iMtimeMs - oLeft.iMtimeMs);
  return aAfterFiles[0];
}

function ensureDirectoryExists(sDirectoryPath) {
  if (!sDirectoryPath) {
    return;
  }

  if (!fs.existsSync(sDirectoryPath)) {
    fs.mkdirSync(sDirectoryPath, { recursive: true });
  }
}

function getAgentDirectory() {
  let sRoot = getWorkspaceRoot();
  if (!sRoot) {
    return '';
  }

  return path.join(sRoot, S_AGENT_DIRECTORY_RELATIVE_PATH);
}

function listFilesInDirectory(sDirectoryPath) {
  if (!sDirectoryPath || !fs.existsSync(sDirectoryPath)) {
    return [];
  }

  return fs.readdirSync(sDirectoryPath, { withFileTypes: true })
    .filter((oEntry) => oEntry.isFile())
    .map((oEntry) => path.join(sDirectoryPath, oEntry.name));
}

function listJsonFilesInDirectory(sDirectoryPath) {
  return listFilesInDirectory(sDirectoryPath).filter((sFilePath) => new RegExp('\.json$', 'i').test(path.basename(sFilePath)));
}

function toWorkspaceRelativePath(sFullPath) {
  let sRoot = getWorkspaceRoot();
  if (!sRoot || !sFullPath) {
    return sFullPath || '';
  }

  return path.relative(sRoot, sFullPath).replace(new RegExp('\\\\', 'g'), '/');
}

function moveFileOverwrite(sSourcePath, sDestinationPath) {
  if (fs.existsSync(sDestinationPath)) {
    fs.unlinkSync(sDestinationPath);
  }

  try {
    fs.renameSync(sSourcePath, sDestinationPath);
  } catch (oError) {
    if (oError && oError.code === 'EXDEV') {
      fs.copyFileSync(sSourcePath, sDestinationPath);
      fs.unlinkSync(sSourcePath);
      return;
    }

    throw oError;
  }
}

function moveDataverseSchemaFilesToAgentFolder(sSourceDirectoryPath, sAgentDirectoryPath) {
  ensureDirectoryExists(sAgentDirectoryPath);

  let aSourceFiles = listFilesInDirectory(sSourceDirectoryPath);
  return aSourceFiles.map((sSourcePath) => {
    let sDestinationPath = path.join(sAgentDirectoryPath, path.basename(sSourcePath));
    moveFileOverwrite(sSourcePath, sDestinationPath);
    return sDestinationPath;
  });
}

function moveFlowSchemaFilesToAgentFolder(sSourceDirectoryPath, sAgentDirectoryPath) {
  ensureDirectoryExists(sAgentDirectoryPath);

  let aSourceFiles = listJsonFilesInDirectory(sSourceDirectoryPath);
  return aSourceFiles.map((sSourcePath) => {
    let sDestinationPath = path.join(sAgentDirectoryPath, path.basename(sSourcePath));
    moveFileOverwrite(sSourcePath, sDestinationPath);
    return sDestinationPath;
  });
}

function removeDirectoryIfExists(sDirectoryPath) {
  if (!sDirectoryPath || !fs.existsSync(sDirectoryPath)) {
    return;
  }

  fs.rmSync(sDirectoryPath, { recursive: true, force: true });
}

function quoteShellArgument(sValue) {
  return '"' + String(sValue || '').replace(new RegExp('"', 'g'), '\\"') + '"';
}

function tryParseJsonText(sOutput) {
  let sTrimmedOutput = String(sOutput || '').trim();
  if (!sTrimmedOutput) {
    return null;
  }

  let aCandidates = [sTrimmedOutput];
  let iArrayStart = sTrimmedOutput.indexOf('[');
  let iObjectStart = sTrimmedOutput.indexOf('{');
  let iJsonStart = -1;

  if (iArrayStart !== -1 && iObjectStart !== -1) {
    iJsonStart = Math.min(iArrayStart, iObjectStart);
  } else {
    iJsonStart = iArrayStart !== -1 ? iArrayStart : iObjectStart;
  }

  if (iJsonStart > 0) {
    let sOpeningChar = sTrimmedOutput.charAt(iJsonStart);
    let sClosingChar = sOpeningChar === '[' ? ']' : '}';
    let iJsonEnd = sTrimmedOutput.lastIndexOf(sClosingChar);
    if (iJsonEnd > iJsonStart) {
      aCandidates.push(sTrimmedOutput.substring(iJsonStart, iJsonEnd + 1));
    }
  }

  for (let iIndex = 0; iIndex < aCandidates.length; iIndex++) {
    try {
      return JSON.parse(aCandidates[iIndex]);
    } catch (oError) {
      /* Try the next candidate. */
    }
  }

  return null;
}

function getObjectValueIgnoreCase(oValue, aKeys) {
  if (!oValue || typeof oValue !== 'object') {
    return '';
  }

  for (let iIndex = 0; iIndex < aKeys.length; iIndex++) {
    let sKey = aKeys[iIndex];
    if (Object.prototype.hasOwnProperty.call(oValue, sKey)) {
      return String(oValue[sKey] || '').trim();
    }
  }

  let aObjectKeys = Object.keys(oValue);
  for (let iIndex = 0; iIndex < aKeys.length; iIndex++) {
    let sTargetKey = aKeys[iIndex].toLowerCase();
    let sMatchedKey = aObjectKeys.find((sCandidateKey) => sCandidateKey.toLowerCase() === sTargetKey);
    if (sMatchedKey) {
      return String(oValue[sMatchedKey] || '').trim();
    }
  }

  return '';
}

function getFlowRecordsFromJson(oParsed) {
  if (Array.isArray(oParsed)) {
    return oParsed;
  }

  if (!oParsed || typeof oParsed !== 'object') {
    return [];
  }

  let aCandidateKeys = ['flows', 'value', 'items', 'results', 'data'];
  for (let iIndex = 0; iIndex < aCandidateKeys.length; iIndex++) {
    let sKey = aCandidateKeys[iIndex];
    if (Array.isArray(oParsed[sKey])) {
      return oParsed[sKey];
    }
  }

  return [];
}

function normalizeFlowRecords(aRecords) {
  if (!Array.isArray(aRecords)) {
    return [];
  }

  return aRecords
    .map((oRecord) => {
      let sFlowId = getObjectValueIgnoreCase(oRecord, ['flowId', 'flowid', 'id', 'workflowId', 'workflowid', 'name']);
      let sDisplayName = getObjectValueIgnoreCase(oRecord, ['displayName', 'displayname', 'friendlyName', 'friendlyname', 'name']);
      let sLogicalName = getObjectValueIgnoreCase(oRecord, ['name', 'logicalName', 'logicalname']);
      if (!sFlowId) {
        return null;
      }

      return {
        sFlowId: sFlowId,
        sDisplayName: sDisplayName || sFlowId,
        sLogicalName: sLogicalName
      };
    })
    .filter((oRecord) => Boolean(oRecord));
}

function parseFlowListFromText(sOutput) {
  let aLines = String(sOutput || '')
    .split(new RegExp('\r?\n', ''))
    .map((sLine) => sLine.replace(new RegExp('\s+$', ''), ''))
    .filter((sLine) => sLine.trim());

  return aLines
    .filter((sLine) => !new RegExp('^[-=\s]+$').test(sLine))
    .filter((sLine) => !new RegExp('^(display\s+name|name)\s{2,}.*flow\s*id$', 'i').test(sLine.trim()))
    .filter((sLine) => !new RegExp('^(found|listing|retrieved)\s+\d+\s+flows?', 'i').test(sLine.trim()))
    .map((sLine) => sLine.trim().split(new RegExp('\s{2,}|\t+', '')).filter((sPart) => sPart.trim()))
    .filter((aParts) => aParts.length >= 2)
    .map((aParts) => ({
      sFlowId: aParts[aParts.length - 1].trim(),
      sDisplayName: aParts.slice(0, -1).join(' ').trim(),
      sLogicalName: ''
    }))
    .filter((oRecord) => oRecord.sFlowId && oRecord.sDisplayName);
}

function dedupeFlows(aFlows) {
  let oSeenFlowIds = {};

  return aFlows.filter((oFlow) => {
    if (!oFlow || !oFlow.sFlowId || oSeenFlowIds[oFlow.sFlowId]) {
      return false;
    }

    oSeenFlowIds[oFlow.sFlowId] = true;
    return true;
  });
}

function parseFlowListOutput(sOutput) {
  let oParsed = tryParseJsonText(sOutput);
  let aFlows = normalizeFlowRecords(getFlowRecordsFromJson(oParsed));

  if (aFlows.length === 0) {
    aFlows = parseFlowListFromText(sOutput);
  }

  return dedupeFlows(aFlows).sort((oLeft, oRight) => oLeft.sDisplayName.localeCompare(oRight.sDisplayName));
}

async function listAvailableFlows(oReporter) {
  try {
    oReporter.status('Running CAP flow list --json...');
    return parseFlowListOutput(await runLoggedPowerAppsCommand('list-flows --json', oReporter));
  } catch (oJsonError) {
    oReporter.log('JSON flow listing was unavailable. Retrying with plain text output.');
    oReporter.status('Running CAP flow list...');
    return parseFlowListOutput(await runLoggedPowerAppsCommand('list-flows', oReporter));
  }
}

async function addDataverseSchema(oPanel = null, sTableName = '') {
  let sResolvedTableName = String(sTableName || '').trim();
  if (!sResolvedTableName) {
    vscode.window.showErrorMessage('Enter a Dataverse table logical name.');
    return;
  }

  if (!isValidDataverseTableName(sResolvedTableName)) {
    vscode.window.showErrorMessage('Dataverse table names can only contain letters, numbers, and underscores.');
    return;
  }

  let bReady = await ensureCodeAppCliReady();
  if (!bReady) {
    return;
  }

  let oReporter = createCommandReporter(oPanel, 'Dataverse Schema', 'Generating Dataverse schema...');

  let fnRunDataverseSchema = async () => {
    let sRoot = getWorkspaceRoot();
    if (!sRoot) {
      throw new Error('No workspace folder open.');
    }

    let sWorkspacePowerConfigPath = getPowerConfigPath();
    if (!sWorkspacePowerConfigPath || !fs.existsSync(sWorkspacePowerConfigPath)) {
      throw new Error('power.config.json was not found in the workspace root.');
    }

    oReporter.start();
    oReporter.status('Running CAP dataverse...');
    oReporter.log('Adding Dataverse data source for table: ' + sResolvedTableName);

    try {
      await runLoggedCodeAppCommand('dataverse ' + quoteShellArgument(sResolvedTableName), oReporter);
    } catch (oError) {
      let sError = typeof oError === 'string' ? oError : (oError && oError.message ? oError.message : String(oError));
      if (!isExistingDataSourceError(sError)) {
        throw new Error(sError);
      }

      oReporter.log('Data source already exists.');
    }

    let sMessage = 'Dataverse schema ready for table: ' + sResolvedTableName + '.';
    oReporter.finish('done', sMessage);
    if (!oReporter.hasPanel()) {
      vscode.window.showInformationMessage(sMessage);
    }
  };

  try {
    if (oReporter.hasPanel()) {
      await fnRunDataverseSchema();
    } else {
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Generating Dataverse schema...', cancellable: false },
        async () => {
          await fnRunDataverseSchema();
        }
      );
    }
  } catch (oError) {
    let sMessage = 'Dataverse schema failed: ' + oError.message;
    oReporter.log(sMessage);
    oReporter.finish('error', sMessage);
    if (!oReporter.hasPanel()) {
      vscode.window.showErrorMessage(sMessage);
    }
  }
}

async function addFlowSchema() {
  let oReporter = createCommandReporter(null, 'Flow Schema', 'Loading flows...');
  let aFlows = [];

  try {
    oReporter.start();
    aFlows = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Loading Power Apps flows...', cancellable: false },
      async () => {
        return await listAvailableFlows(oReporter);
      }
    );
  } catch (oError) {
    let sMessage = 'Flow list failed: ' + normalizeErrorMessage(oError);
    oReporter.log(sMessage);
    oReporter.finish('error', sMessage);
    vscode.window.showErrorMessage(sMessage);
    return;
  }

  if (!aFlows.length) {
    let sMessage = 'No flows were returned by CAP flow.';
    oReporter.log(sMessage);
    oReporter.finish('error', sMessage);
    vscode.window.showWarningMessage(sMessage);
    return;
  }

  oReporter.finish('done', 'Loaded ' + aFlows.length + ' flow' + (aFlows.length === 1 ? '' : 's') + '.');

  let oSelectedFlow = await vscode.window.showQuickPick(
    aFlows.map((oFlow) => ({
      label: oFlow.sDisplayName,
      description: oFlow.sFlowId,
      detail: oFlow.sLogicalName && oFlow.sLogicalName !== oFlow.sDisplayName ? oFlow.sLogicalName : '',
      oFlow: oFlow
    })),
    {
      title: 'Add Flow Schema',
      placeHolder: 'Search flows by display name or flow id',
      ignoreFocusOut: true,
      matchOnDescription: true,
      matchOnDetail: true
    }
  );

  if (!oSelectedFlow) {
    return;
  }

  let sFlowId = oSelectedFlow.oFlow && oSelectedFlow.oFlow.sFlowId ? oSelectedFlow.oFlow.sFlowId : '';
  if (!sFlowId) {
    vscode.window.showErrorMessage('The selected flow did not include a flow id.');
    return;
  }

  try {
    let sRoot = getWorkspaceRoot();
    let sWorkspacePowerDirectory = sRoot ? path.join(sRoot, '.power') : '';
    let sWorkspaceSrcDirectory = sRoot ? path.join(sRoot, 'src') : '';
    let bWorkspaceSrcDirectoryExisted = sWorkspaceSrcDirectory ? fs.existsSync(sWorkspaceSrcDirectory) : false;
    let sFlowSchemaDirectory = getFlowSchemaDirectory();
    let sAgentDirectory = getAgentDirectory();

    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Adding flow schema...', cancellable: false },
      async () => {
        oReporter.status('Running CAP flow...');
        oReporter.log('Adding flow: ' + oSelectedFlow.label + ' (' + sFlowId + ')');
        await runLoggedPowerAppsCommand('add-flow --flow-id ' + quoteShellArgument(sFlowId), oReporter);
      }
    );

    let sMessage = 'Flow schema added for ' + oSelectedFlow.label + ' and moved to agent.';
    oReporter.finish('done', sMessage);
    vscode.window.showInformationMessage(sMessage);
  } catch (oError) {
    let sMessage = 'Add flow failed: ' + normalizeErrorMessage(oError);
    oReporter.log(sMessage);
    oReporter.finish('error', sMessage);
    vscode.window.showErrorMessage(sMessage);
  }
}

async function setupProject(oContext) {
  let aFolders = vscode.workspace.workspaceFolders;
  if (!aFolders || aFolders.length === 0) {
    vscode.window.showErrorMessage('No workspace folder open. Please open a folder first.');
    return;
  }

  let sTargetDir = aFolders[0].uri.fsPath;

  let aSourceDirCandidates = [
    path.join(oContext.extensionPath, 'resources', 'AI', 'codeApp'),
    path.join(oContext.extensionPath, 'resources', 'codeApp'),
    path.join(sTargetDir, 'resources', 'AI', 'codeApp'),
    path.join(sTargetDir, 'resources', 'codeApp')
  ];

  let sSourceDir = aSourceDirCandidates.find((sCandidatePath) => fs.existsSync(sCandidatePath));

  if (!sSourceDir) {
    vscode.window.showErrorMessage('CodeApp source files not found. Ensure resources/AI/codeApp/ exists.');
    return;
  }

  try {
    let aCopiedFiles = copyDirRecursive(sSourceDir, sTargetDir);
    let sConfigPath = path.join(sTargetDir, 'power.config.json');
    let bConfigCopied = aCopiedFiles.indexOf(sConfigPath) !== -1;

    if (bConfigCopied) {
      let bConfigUpdated = await promptForSetupConfigValues(oContext, sConfigPath);
      if (bConfigUpdated) {
        vscode.window.showInformationMessage('Project setup complete. power.config.json was updated.');
      } else {
        vscode.window.showWarningMessage('Project setup complete, but power.config.json was not updated.');
      }
      return;
    }

    vscode.window.showInformationMessage('Project setup complete! CodeApp files copied to workspace.');
  } catch (oError) {
    vscode.window.showErrorMessage('Setup failed: ' + oError.message);
  }
}

function copyDirRecursive(sSource, sTarget) {
  let aCopiedFiles = [];
  let aEntries = fs.readdirSync(sSource, { withFileTypes: true });
  aEntries.forEach((oEntry) => {
    let sSourcePath = path.join(sSource, oEntry.name);
    let sTargetPath = path.join(sTarget, oEntry.name);
    if (oEntry.isDirectory()) {
      if (!fs.existsSync(sTargetPath)) {
        fs.mkdirSync(sTargetPath, { recursive: true });
      }
      aCopiedFiles = aCopiedFiles.concat(copyDirRecursive(sSourcePath, sTargetPath));
    } else {
      if (fs.existsSync(sTargetPath)) {
        vscode.window.showWarningMessage('Skipping existing file: ' + oEntry.name);
      } else {
        fs.copyFileSync(sSourcePath, sTargetPath);
        aCopiedFiles.push(sTargetPath);
      }
    }
  });
  return aCopiedFiles;
}

async function promptForSetupConfigValues(oContext, sConfigPath) {
  let oInitialValues = getSetupConfigInitialValues(oContext, sConfigPath);

  let sAppDisplayName = await vscode.window.showInputBox({
    title: 'CodeAppJS Setup',
    prompt: 'App display name',
    value: oInitialValues.sAppDisplayName,
    ignoreFocusOut: true,
    validateInput: (sValue) => sValue && sValue.trim() ? null : 'App display name is required.'
  });
  if (sAppDisplayName === undefined) {
    return false;
  }

  let sDescription = await vscode.window.showInputBox({
    title: 'CodeAppJS Setup',
    prompt: 'Description',
    value: oInitialValues.sDescription,
    ignoreFocusOut: true
  });
  if (sDescription === undefined) {
    return false;
  }

  let sLogoPath = await vscode.window.showInputBox({
    title: 'CodeAppJS Setup',
    prompt: 'Logo path',
    value: oInitialValues.sLogoPath,
    ignoreFocusOut: true
  });
  if (sLogoPath === undefined) {
    return false;
  }

  let sEnvironmentId = await vscode.window.showInputBox({
    title: 'CodeAppJS Setup',
    prompt: 'Environment ID',
    value: oInitialValues.sEnvironmentId,
    ignoreFocusOut: true
  });
  if (sEnvironmentId === undefined) {
    return false;
  }

  await updatePowerConfigFile(sConfigPath, {
    sAppDisplayName: sAppDisplayName.trim(),
    sDescription: sDescription.trim(),
    sLogoPath: sLogoPath.trim(),
    sEnvironmentId: sEnvironmentId.trim() || S_ENVIRONMENT_PLACEHOLDER
  });
  await openPowerConfigFile(sConfigPath);
  return true;
}

async function updatePowerConfigFile(sConfigPath, oValues) {
  let sExistingContent = fs.readFileSync(sConfigPath, 'utf8');
  let oConfig = JSON.parse(sExistingContent);

  oConfig.appDisplayName = oValues.sAppDisplayName || '';
  oConfig.description = oValues.sDescription || '';
  oConfig.logoPath = oValues.sLogoPath || '';
  oConfig.environmentId = oValues.sEnvironmentId || S_ENVIRONMENT_PLACEHOLDER;

  fs.writeFileSync(sConfigPath, JSON.stringify(oConfig, null, 2) + '\n', 'utf8');
  updateBuildEntryPointTitle(sConfigPath, oConfig);
}

async function openPowerConfigFile(sConfigPath) {
  let oDocument = await vscode.workspace.openTextDocument(sConfigPath);
  await vscode.window.showTextDocument(oDocument, vscode.ViewColumn.One);
}

async function authenticate() {
  let oReporter = createCommandReporter(null, 'Authentication', 'Starting sign-in...');

  try {
    oReporter.start();
    let sAuthOutput = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Sign in to Power Platform', cancellable: false },
      async () => {
        oReporter.status('Running CAP auth...');
        return await runLoggedCodeAppCommand('auth', oReporter);
      }
    );

    let sSignedInUser = '';
    try {
      let oAuthResult = JSON.parse(sAuthOutput || '{}');
      sSignedInUser = oAuthResult && oAuthResult.user ? String(oAuthResult.user) : '';
    } catch (oError) {
      /* Fall back to a generic success message if the wrapper output is not JSON. */
    }

    let sMessage = sSignedInUser ? 'Signed in as ' + sSignedInUser + '.' : 'Authentication complete.';
    oReporter.log(sMessage);
    oReporter.finish('done', sMessage);
    vscode.window.showInformationMessage(sMessage);
  } catch (oError) {
    let sMessage = 'Authentication failed: ' + normalizeErrorMessage(oError);
    oReporter.log(sMessage);
    oReporter.finish('error', sMessage);
    vscode.window.showErrorMessage(sMessage);
  }
}

async function changeEnvironment(oContext = null) {
  let oReporter = createCommandReporter(null, 'Environment', 'Loading environments...');
  let aEnvironments = [];

  try {
    oReporter.start();
    aEnvironments = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Loading Power Platform environments...', cancellable: false },
      async () => {
        return await listAvailableEnvironments(oReporter);
      }
    );
  } catch (oError) {
    let sMessage = 'Environment list failed: ' + normalizeErrorMessage(oError);
    oReporter.log(sMessage);
    oReporter.finish('error', sMessage);
    vscode.window.showErrorMessage(sMessage);
    return;
  }

  if (!aEnvironments.length) {
    let sMessage = 'No environments were returned by CAP environment.';
    oReporter.log(sMessage);
    oReporter.finish('error', sMessage);
    vscode.window.showWarningMessage(sMessage);
    return;
  }

  let sCurrentEnvironmentId = getStoredEnvironmentId(oContext) || getConfiguredEnvironmentId();
  let oSelection = await vscode.window.showQuickPick(
    aEnvironments.map((oEnvironment) => ({
      label: oEnvironment.sName,
      description: oEnvironment.bActive ? 'Current selection' : (oEnvironment.sUrl || ''),
      detail: oEnvironment.sId,
      picked: areEnvironmentIdsEquivalent(oEnvironment.sId, sCurrentEnvironmentId),
      oEnvironment: oEnvironment
    })),
    {
      title: 'Change Environment',
      placeHolder: 'Search environments by name, id, or URL',
      ignoreFocusOut: true,
      matchOnDescription: true,
      matchOnDetail: true
    }
  );

  if (!oSelection) {
    return;
  }

  await applyEnvironmentSelection(oSelection.oEnvironment.sId, oContext);
}

async function applyEnvironmentSelection(sEnvId, oContext = null) {
  let sNormalizedEnvId = normalizeEnvironmentId(sEnvId);

  if (!sNormalizedEnvId) {
    vscode.window.showErrorMessage('Failed to switch environment: no valid environment id was provided.');
    return;
  }

  let oReporter = createCommandReporter(null, 'Environment', 'Selecting environment...');

  try {
    oReporter.start();
    oReporter.status('Running CAP environment select...');
    await runLoggedPacCommand('env select --environment ' + quoteShellArgument(sNormalizedEnvId), oReporter);
  } catch (oError) {
    let sMessage = 'Environment switch failed: ' + normalizeErrorMessage(oError);
    oReporter.log(sMessage);
    oReporter.finish('error', sMessage);
    vscode.window.showErrorMessage(sMessage);
    return;
  }

  try {
    await storeEnvironmentId(oContext, sNormalizedEnvId);
  } catch (oError) {
    vscode.window.showWarningMessage('Environment could not be stored locally: ' + oError.message);
  }

  try {
    let bUpdated = updatePowerConfigEnvironmentId(sNormalizedEnvId);
    if (bUpdated) {
      let sMessage = 'Environment selected and updated in power.config.json.';
      oReporter.finish('done', sMessage);
      vscode.window.showInformationMessage(sMessage);
      return;
    }
  } catch (oError) {
    let sMessage = 'power.config.json could not be updated: ' + oError.message;
    oReporter.log(sMessage);
    oReporter.finish('error', sMessage);
    vscode.window.showErrorMessage('power.config.json could not be updated: ' + oError.message);
    return;
  }

  let sMessage = 'Environment selected: ' + sNormalizedEnvId + '.';
  oReporter.finish('done', sMessage);
  vscode.window.showInformationMessage(sMessage);
}

async function listAvailableEnvironments(oReporter) {
  let sWhoOutput = '';
  oReporter.status('Running CAP environment...');
  let sListOutput = await runLoggedPacCommand('env list --json', oReporter);
  let aEnvironments = parseEnvironmentListJsonOutput(sListOutput, sWhoOutput);

  if (aEnvironments.length === 0) {
    aEnvironments = parseEnvironmentListTextOutput(sListOutput, sWhoOutput);
  }

  return aEnvironments.sort((oLeft, oRight) => oLeft.sName.localeCompare(oRight.sName));
}

async function resolveConfiguredEnvironmentUrl(oReporter) {
  let sConfiguredEnvironmentId = getConfiguredEnvironmentId();
  let sWhoOutput = '';

  try {
    oReporter.status('Reading selected environment...');
    sWhoOutput = await runLoggedPacCommand('auth who --json', oReporter);
  } catch (oError) {
    sWhoOutput = '';
  }

  let sSelectedEnvironmentUrl = getEnvironmentUrlFromWhoOutput(sWhoOutput);
  let sSelectedEnvironmentId = getEnvironmentIdFromWhoOutput(sWhoOutput);

  if (sSelectedEnvironmentUrl && (!sConfiguredEnvironmentId || areEnvironmentIdsEquivalent(sConfiguredEnvironmentId, sSelectedEnvironmentId))) {
    return sSelectedEnvironmentUrl;
  }

  if (!sConfiguredEnvironmentId) {
    return sSelectedEnvironmentUrl;
  }

  try {
    oReporter.status('Looking up configured environment URL...');
    let aEnvironments = await listAvailableEnvironments(oReporter);
    let oConfiguredEnvironment = aEnvironments.find((oEnvironment) => {
      return areEnvironmentIdsEquivalent(oEnvironment && oEnvironment.sId ? oEnvironment.sId : '', sConfiguredEnvironmentId);
    });

    if (oConfiguredEnvironment && oConfiguredEnvironment.sUrl) {
      return normalizeEnvironmentUrl(oConfiguredEnvironment.sUrl);
    }
  } catch (oError) {
    /* Fall back to the selected PAC environment URL when metadata lookup is unavailable. */
  }

  return sSelectedEnvironmentUrl;
}

async function deploy() {
  let bReady = await ensureCodeAppCliReady();
  if (!bReady) {
    return;
  }

  let oReporter = createCommandReporter(null, 'Deploy', 'Starting CAP deploy...', { bShowOnStart: false });
  let oDeployResult = null;
  let oSanitizedConfigState = null;

  let fnRunDeploy = async () => {
    oReporter.start();
    oReporter.status('Preparing deploy configuration...');
    oSanitizedConfigState = sanitizePowerConfigForDeploy();
    if (oSanitizedConfigState.bSanitized) {
      oReporter.log(
        'Removed workflowDetails from ' + oSanitizedConfigState.iRemovedWorkflowDetailsCount + ' connection reference' +
        (oSanitizedConfigState.iRemovedWorkflowDetailsCount === 1 ? '' : 's') + ' for deploy compatibility.'
      );
    }

    oReporter.status('Running CAP deploy...');
    oReporter.log('Starting deploy...');
    let sDeployOutput = await runLoggedCodeAppCommand('deploy', oReporter, { bReturnCombinedOutput: true });
    let sAppUrl = extractPowerAppsUrl(sDeployOutput);
    let sAppId = getAppIdFromPowerAppsUrl(sAppUrl) || extractAppIdFromDeployOutput(sDeployOutput) || getConfiguredAppId();
    if (!sAppUrl && sAppId) {
      sAppUrl = buildPowerAppsPlayUrl(getConfiguredEnvironmentId(), sAppId);
    }

    if (sAppUrl) {
      oReporter.log('App URL: ' + sAppUrl);
    } else if (sAppId) {
      oReporter.log('No app URL was found in the deploy output, but appId was detected: ' + sAppId);
    } else {
      let sDeployDetails = getDeployOutputDetails(sDeployOutput);
      oReporter.log('CAP deploy completed but did not return an app URL or appId. Captured deploy output:');
      oReporter.log(sDeployDetails);
    }

    let aMessageParts = ['Deploy complete.'];
    if (sAppUrl) {
      aMessageParts.push('Open app: ' + sAppUrl);
    }
    if (sAppId) {
      aMessageParts.push('Detected appId: ' + sAppId);
    }

    let sMessage = aMessageParts.join(' ');
    oReporter.log(sMessage);
    oReporter.finish('done', sMessage);
    return {
      sMessage: sMessage,
      sAppUrl: sAppUrl,
      sAppId: sAppId,
      bHasDetectedUrl: Boolean(sAppUrl)
    };
  };

  try {
    oDeployResult = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Deploying with CAP deploy...', cancellable: false },
      async () => {
        return await fnRunDeploy();
      }
    );

    if (oSanitizedConfigState && oSanitizedConfigState.bSanitized) {
      restorePowerConfigAfterDeploy(oSanitizedConfigState);
      oReporter.log('Restored original power.config.json after deploy.');
    }

    if (oDeployResult && oDeployResult.sAppId) {
      let oAppIdUpdateResult = updatePowerConfigAppId(oDeployResult.sAppId);
      if (oAppIdUpdateResult.bConfigFound) {
        oReporter.log(
          oAppIdUpdateResult.bUpdated
            ? 'Updated power.config.json with appId: ' + oDeployResult.sAppId
            : 'power.config.json already contains appId: ' + oDeployResult.sAppId
        );
      } else {
        oReporter.log('App ID detected (' + oDeployResult.sAppId + '), but power.config.json was not found in the workspace root.');
      }
    }

    if (!oReporter.hasPanel() && oDeployResult) {
      if (oDeployResult.bHasDetectedUrl) {
        let sSelection = await vscode.window.showInformationMessage('Deploy complete.', 'Open App', 'Show Log');
        if (sSelection === 'Open App') {
          await vscode.env.openExternal(vscode.Uri.parse(oDeployResult.sAppUrl));
        } else if (sSelection === 'Show Log') {
          oReporter.show();
        }
      } else {
        let sSelection = await vscode.window.showWarningMessage(
          'Deploy complete, but the app URL was not detected. Open the Deploy output to verify the result.',
          'Show Log'
        );
        if (sSelection === 'Show Log') {
          oReporter.show();
        }
      }
    }
  } catch (oError) {
    if (oSanitizedConfigState && oSanitizedConfigState.bSanitized) {
      restorePowerConfigAfterDeploy(oSanitizedConfigState);
      oReporter.log('Restored original power.config.json after deploy failure.');
    }

    let sMessage = 'Deploy failed: ' + normalizeErrorMessage(oError);
    oReporter.log(sMessage);
    oReporter.finish('error', sMessage);
    if (!oReporter.hasPanel()) {
      vscode.window.showErrorMessage(sMessage);
    }
  }
}

module.exports = { setupProject, authenticate, changeEnvironment, applyEnvironmentSelection, deploy, toggleDebugger, addDataverseSchema, addFlowSchema };
