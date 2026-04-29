const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { runPacCommand, getWorkspaceRoot, getPacCommand } = require('./pacCli');

let oConnectionSyncOutput = null;
let oCommandOutputs = {};
const S_ENVIRONMENT_STORAGE_KEY = 'selectedEnvironmentId';
const S_ENVIRONMENT_PLACEHOLDER = '<ENVIRONMENT ID>';
const S_AGENT_DIRECTORY_RELATIVE_PATH = 'agent';
const S_DEBUGGER_SNIPPET = "import { enableDebugger } from './codeapp.js';\nenableDebugger();\n";

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

function normalizeErrorMessage(oError) {
  if (!oError) {
    return 'Unknown error';
  }

  if (typeof oError === 'string') {
    return oError;
  }

  if (oError.message) {
    return oError.message;
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
    finish(sState, sText) {
      sLastStatus = sText || sLastStatus;
      oOutput.appendLine('[' + sState + '] ' + sLastStatus);
      if (sState === 'error') {
        oOutput.show(true);
      }
    },
    hasPanel() {
      return false;
    }
  };
}

async function runLoggedPacCommand(sCommand, oReporter) {
  oReporter.log('> pac ' + sCommand);
  return await runPacCommand(sCommand, {
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
    let sUpdatedContent = bEnable ? enableDebuggerInContent(sContent) : disableDebuggerInContent(sContent);

    if (sUpdatedContent !== sContent) {
      oReporter.start();
      oReporter.status(bEnable ? 'Enabling debugger...' : 'Disabling debugger...');
      fs.writeFileSync(oState.sIndexPath, sUpdatedContent, 'utf8');
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

  let oMatch = new RegExp('Environment ID:\\s*(\\S+)', 'i').exec(sOutput || '');
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
          oEnvironmentIdentifier.Id || oEnvironment?.EnvironmentId || oEnvironment?.Id || '',
          bIsDefault
        );
        if (!sEnvironmentId) {
          return null;
        }

        return {
          sName: oEnvironment.FriendlyName || oEnvironment.UniqueName || sEnvironmentId,
          sId: sEnvironmentId,
          sUrl: oEnvironment.EnvironmentUrl || '',
          bActive: false
        };
      })
      .filter((oEnvironment) => Boolean(oEnvironment));

    return applyActiveEnvironmentState(aEnvironments, sWhoOutput);
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

    aEnvironments.push({
      sName: sBeforeEnvironmentId || 'Unknown',
      sId: oEnvironmentIdMatch[0],
      sUrl: oUrlMatch ? oUrlMatch[0] : '',
      bActive: bActive
    });
  });

  return applyActiveEnvironmentState(aEnvironments, sWhoOutput);
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
    let oMatch = new RegExp('https://apps\\.powerapps\\.com/play/[^\\s"\'<>]+', 'i').exec(sOutput || '');
  if (!oMatch) {
    return '';
  }

  return oMatch[0].replace(new RegExp('[\),.;]+$'), '');
}

function getAppIdFromPowerAppsUrl(sUrl) {
  let oMatch = new RegExp('/app/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?=[/?#]|$)', 'i').exec(sUrl || '');
  return oMatch ? oMatch[1] : '';
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

  let oReporter = createCommandReporter(oPanel, 'Dataverse Schema', 'Generating Dataverse schema...');

  let fnRunDataverseSchema = async () => {
    let sRoot = getWorkspaceRoot();
    if (!sRoot) {
      throw new Error('No workspace folder open.');
    }

    let sSchemaDirectory = getDataverseSchemaDirectory();
    let aBeforeFiles = listDataverseSchemaFiles(sSchemaDirectory);

    oReporter.start();
    oReporter.status('Running pac code add-data-source...');
    oReporter.log('Preparing Dataverse schema for table: ' + sResolvedTableName);

    try {
      await runLoggedPacCommand('code add-data-source -a dataverse -t ' + sResolvedTableName, oReporter);
    } catch (oError) {
      if (!isExistingDataSourceError(oError)) {
        throw new Error(oError.message || String(oError));
      }

      oReporter.log('Data source already exists; checking for an updated schema file.');
    }

    let oGeneratedFile = findGeneratedDataverseSchemaFile(sSchemaDirectory, sResolvedTableName, aBeforeFiles);
    if (!oGeneratedFile) {
      throw new Error('PAC completed, but no schema file was found in .power/schemas/dataverse/.');
    }

    let sAgentDirectory = path.join(sRoot, S_AGENT_DIRECTORY_RELATIVE_PATH);
    ensureDirectoryExists(sAgentDirectory);

    let sDestinationPath = path.join(sAgentDirectory, oGeneratedFile.sName);
    oReporter.status('Moving schema into agent folder...');
    moveFileOverwrite(oGeneratedFile.sFullPath, sDestinationPath);
    oReporter.log('Moved schema to ' + toWorkspaceRelativePath(sDestinationPath) + '.');

    let sMessage = 'Dataverse schema ready: ' + toWorkspaceRelativePath(sDestinationPath);
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

async function setupProject(oContext) {
  let aFolders = vscode.workspace.workspaceFolders;
  if (!aFolders || aFolders.length === 0) {
    vscode.window.showErrorMessage('No workspace folder open. Please open a folder first.');
    return;
  }

  let sTargetDir = aFolders[0].uri.fsPath;

  /* Source is the codeApp folder in the extension's resources */
  let sSourceDir = path.join(oContext.extensionPath, 'resources', 'codeApp');
  if (!fs.existsSync(sSourceDir)) {
    /* Fallback: check workspace resources */
    sSourceDir = path.join(sTargetDir, 'resources', 'codeApp');
  }

  if (!fs.existsSync(sSourceDir)) {
    vscode.window.showErrorMessage('CodeApp source files not found. Ensure resources/codeApp/ exists.');
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
  let oReporter = createCommandReporter(null, 'Authentication', 'Opening Power Platform authentication...');
  oReporter.start();
  let oTerminal = vscode.window.createTerminal('PAC Auth');
  oTerminal.show();
  oTerminal.sendText('pac auth create');
  let sMessage = 'Opened the PAC Auth terminal. Follow the browser prompts to authenticate with Power Platform.';
  oReporter.log('> pac auth create');
  oReporter.log(sMessage);
  oReporter.finish('working', 'Authentication started. Complete sign-in in the browser and terminal.');
  if (!oReporter.hasPanel()) {
    vscode.window.showInformationMessage('Follow the browser prompts to authenticate with Power Platform.');
  }
}

async function changeEnvironment(oContext = null) {
  try {
    let aEnvironments = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Loading Power Platform environments...',
        cancellable: false
      },
      async () => {
        let sWhoOutput = await runPacCommand('env who --json').catch(() => '');
        if (!sWhoOutput) {
          sWhoOutput = await runPacCommand('env who').catch(() => '');
        }
        let sJsonOutput = await runPacCommand('env list --json').catch(() => '');
        let aResolvedEnvironments = parseEnvironmentListJsonOutput(sJsonOutput, sWhoOutput);

        if (aResolvedEnvironments.length === 0) {
          let sTextOutput = await runPacCommand('env list');
          aResolvedEnvironments = parseEnvironmentListTextOutput(sTextOutput, sWhoOutput);
        }

        return aResolvedEnvironments;
      }
    );

    if (aEnvironments.length === 0) {
      vscode.window.showWarningMessage('No environments found. Run Auth first.');
      return;
    }

    let aItems = aEnvironments.map((oEnv) => ({
      label: (oEnv.bActive ? '* ' : '') + oEnv.sName,
      description: oEnv.sUrl,
      sId: oEnv.sId
    }));

    let oSelected = await vscode.window.showQuickPick(aItems, {
      placeHolder: 'Select a Power Platform environment'
    });

    if (oSelected) {
      await applyEnvironmentSelection(oSelected.sId, oContext);
    }
  } catch (oError) {
    vscode.window.showErrorMessage('Failed to list environments: ' + oError);
  }
}

async function applyEnvironmentSelection(sEnvId, oContext = null) {
  let sNormalizedEnvId = normalizeEnvironmentId(sEnvId);
  let sPacSelectableEnvironmentId = getPacSelectableEnvironmentId(sNormalizedEnvId);

  if (!sNormalizedEnvId || !sPacSelectableEnvironmentId) {
    vscode.window.showErrorMessage('Failed to switch environment: no valid environment id was provided.');
    return;
  }

  try {
    await runPacCommand('org select --environment ' + sPacSelectableEnvironmentId);
  } catch (oError) {
    vscode.window.showErrorMessage('Failed to switch environment: ' + oError);
    return;
  }

  try {
    await storeEnvironmentId(oContext, sNormalizedEnvId);
  } catch (oError) {
    vscode.window.showWarningMessage('Environment switched, but the saved environment could not be stored locally: ' + oError.message);
  }

  try {
    let bUpdated = updatePowerConfigEnvironmentId(sNormalizedEnvId);
    if (bUpdated) {
      vscode.window.showInformationMessage('Environment switched and power.config.json updated.');
      return;
    }
  } catch (oError) {
    vscode.window.showErrorMessage('Environment switched, but power.config.json could not be updated: ' + oError.message);
    return;
  }

  vscode.window.showInformationMessage('Environment switched.');
}

async function deploy() {
  let oReporter = createCommandReporter(null, 'Deploy', 'Starting pac code push...', { bShowOnStart: false });

  let fnRunDeploy = async () => {
    oReporter.start();
    oReporter.status('Running pac code push...');
    oReporter.log('Starting deploy...');
    let sDeployOutput = await runLoggedPacCommand('code push', oReporter);
    let sAppUrl = extractPowerAppsUrl(sDeployOutput);
    let sAppId = getAppIdFromPowerAppsUrl(sAppUrl);
    let oAppIdUpdateResult = null;

    if (sAppUrl) {
      oReporter.log('App URL: ' + sAppUrl);
    }

    if (sAppId) {
      oAppIdUpdateResult = updatePowerConfigAppId(sAppId);
      if (oAppIdUpdateResult.bConfigFound) {
        oReporter.log(
          oAppIdUpdateResult.bUpdated
            ? 'Updated power.config.json with appId: ' + sAppId
            : 'power.config.json already contains appId: ' + sAppId
        );
      } else {
        oReporter.log('App ID detected (' + sAppId + '), but power.config.json was not found in the workspace root.');
      }
    }

    let aMessageParts = ['Deploy complete.'];
    if (sAppUrl) {
      aMessageParts.push('Open app: ' + sAppUrl);
    }
    if (sAppId && oAppIdUpdateResult && oAppIdUpdateResult.bConfigFound) {
      aMessageParts.push('Saved appId to power.config.json.');
    } else if (sAppId) {
      aMessageParts.push('Detected appId: ' + sAppId);
    }

    let sMessage = aMessageParts.join(' ');
    oReporter.log(sMessage);
    oReporter.finish('done', sMessage);
    if (!oReporter.hasPanel()) {
      vscode.window.showInformationMessage(sMessage);
    }
  };

  try {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Deploying with pac code push...', cancellable: false },
      async () => {
        await fnRunDeploy();
      }
    );
  } catch (oError) {
    let sMessage = 'Deploy failed: ' + normalizeErrorMessage(oError);
    oReporter.log(sMessage);
    oReporter.finish('error', sMessage);
    if (!oReporter.hasPanel()) {
      vscode.window.showErrorMessage(sMessage);
    }
  }
}

async function syncConnections() {
  try {
    let oOutput = getConnectionSyncOutput();
    oOutput.clear();

    let oReporter = createCommandReporter(null, 'Connection Sync', 'Starting connection sync...');
    oReporter.start();
    oReporter.log('Starting connection sync...');

    let { sConfigPath, oConfig } = getPowerConfig();
    let oConnectionReferences = oConfig.connectionReferences || {};
    let aReferenceEntries = Object.entries(oConnectionReferences);

    if (aReferenceEntries.length === 0) {
      let sMessage = 'No connectionReferences were found in power.config.json.';
      oReporter.log(sMessage);
      oReporter.finish('warning', sMessage);
      if (!oReporter.hasPanel()) {
        vscode.window.showWarningMessage(sMessage);
      }
      return;
    }

    let sEnvironmentId = normalizeEnvironmentId(oConfig.environmentId || '');
    let bHasConcreteEnvironment = sEnvironmentId && sEnvironmentId.indexOf('<') === -1;
    let sEnvironmentUrl = '';

    let oSummary = {
      aSynced: [],
      aExisting: [],
      aMissing: [],
      aErrors: [],
      iUpdatedIds: 0
    };

    let fnRunSync = async (oProgress) => {
        if (bHasConcreteEnvironment) {
          let sPacSelectableEnvironmentId = getPacSelectableEnvironmentId(sEnvironmentId);
          oReporter.status('Selecting configured environment...');
          if (oProgress) {
            oProgress.report({ message: 'Selecting configured environment...' });
          }
          try {
            oReporter.log('Selecting environment: ' + sEnvironmentId);
            await runLoggedPacCommand('org select --environment ' + sPacSelectableEnvironmentId, oReporter);
          } catch (oError) {
            throw new Error('Failed to select environment ' + sEnvironmentId + ': ' + oError);
          }
        }

        try {
          oReporter.status('Reading active environment...');
          let sWhoOutput = await runLoggedPacCommand('env who', oReporter);
          sEnvironmentUrl = getEnvironmentUrlFromWhoOutput(sWhoOutput);
          oReporter.log('Active environment URL: ' + (sEnvironmentUrl || 'not found'));
        } catch (oError) {
          oReporter.log('Failed to read active environment URL: ' + oError);
        }

        oReporter.status('Reading available connections...');
        if (oProgress) {
          oProgress.report({ message: 'Reading available connections...' });
        }
        let sConnectionOutput = await runLoggedPacCommand('connection list', oReporter);
        oReporter.log('connection list output received.');
        let aConnections = parseConnectionListOutput(sConnectionOutput);

        if (aConnections.length === 0) {
          throw new Error('No connections could be parsed from pac connection list. Output: ' + sConnectionOutput.substring(0, 500));
        }

        oReporter.log('Parsed ' + aConnections.length + ' connection(s).');

        let bConfigChanged = false;
        let iTotal = aReferenceEntries.length;

        for (let iIndex = 0; iIndex < aReferenceEntries.length; iIndex++) {
          let [sReferenceName, oReference] = aReferenceEntries[iIndex];
          let sApiName = getApiNameFromReference(oReference);
          let sDisplayName = oReference.displayName || sReferenceName;

          oReporter.status('Syncing ' + sDisplayName + '...');
          if (oProgress) {
            oProgress.report({
              increment: 100 / iTotal,
              message: 'Syncing ' + sDisplayName + '...'
            });
          }

          if (!sApiName || !oReference.id) {
            oSummary.aErrors.push(sDisplayName + ': missing connector id in power.config.json');
            oReporter.log('Skipping ' + sDisplayName + ': missing connector id in power.config.json.');
            continue;
          }

          let oConnection = findConnectedConnection(aConnections, oReference.id);
          if (!oConnection) {
            oReporter.log('No connected connection found for ' + sDisplayName + ' (' + oReference.id + ').');
            oSummary.aMissing.push(sDisplayName);
            continue;
          }

          oReporter.log('Matched ' + sDisplayName + ' to connection ' + oConnection.sId + '.');

          if (oReference.sharedConnectionId !== oConnection.sId) {
            oReference.sharedConnectionId = oConnection.sId;
            oSummary.iUpdatedIds++;
            bConfigChanged = true;
          }

          try {
            let sAddDataSourceCommand = 'code add-data-source -a ' + sApiName + ' -c ' + oConnection.sId;
            if (sEnvironmentUrl) {
              sAddDataSourceCommand = sAddDataSourceCommand + ' --environment ' + sEnvironmentUrl;
            }

            oReporter.log('Running: ' + sAddDataSourceCommand);
            let sAddDataSourceOutput = await runLoggedPacCommand(sAddDataSourceCommand, oReporter);
            oReporter.log('add-data-source succeeded for ' + sDisplayName + '.');
            if (sAddDataSourceOutput && sAddDataSourceOutput.trim()) {
              oReporter.log(sAddDataSourceOutput.trim());
            }
            if (normalizeConnectionReferences(sConfigPath, aReferenceEntries)) {
              oReporter.log('Normalized connectionReferences after add-data-source.');
            }
            if (sApiName === 'shared_office365groups' && updateConnectorHelperDataSourceName(sApiName, getDefaultDataSourceName(sApiName))) {
              oReporter.log('Updated dist/office365groups.js to use the generated data source name.');
            }
            if (sApiName === 'shared_office365groups' && updateOffice365GroupsHelperMetadata()) {
              oReporter.log('Updated dist/office365groups.js with generated Office 365 Groups operation metadata.');
            }
            oSummary.aSynced.push(sDisplayName);
          } catch (oError) {
            if (isExistingDataSourceError(oError)) {
              oReporter.log('add-data-source already existed for ' + sDisplayName + '.');
              if (normalizeConnectionReferences(sConfigPath, aReferenceEntries)) {
                oReporter.log('Normalized connectionReferences after existing data source check.');
              }
              if (sApiName === 'shared_office365groups' && updateConnectorHelperDataSourceName(sApiName, getDefaultDataSourceName(sApiName))) {
                oReporter.log('Updated dist/office365groups.js to use the generated data source name.');
              }
              if (sApiName === 'shared_office365groups' && updateOffice365GroupsHelperMetadata()) {
                oReporter.log('Updated dist/office365groups.js with generated Office 365 Groups operation metadata.');
              }
              oSummary.aExisting.push(sDisplayName);
            } else {
              oReporter.log('add-data-source failed for ' + sDisplayName + ': ' + oError);
              oSummary.aErrors.push(sDisplayName + ': ' + oError);
            }
          }
        }

        if (bConfigChanged) {
          fs.writeFileSync(sConfigPath, JSON.stringify(oConfig, null, 2) + '\n', 'utf8');
          oReporter.log('Updated sharedConnectionId values in power.config.json.');
        }
      };

    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Syncing connector data sources...', cancellable: false },
      async (oProgress) => {
        await fnRunSync(oProgress);
      }
    );

    let aSummaryParts = [];
    if (oSummary.aSynced.length > 0) {
      aSummaryParts.push(oSummary.aSynced.length + ' data source(s) added');
    }
    if (oSummary.aExisting.length > 0) {
      aSummaryParts.push(oSummary.aExisting.length + ' already present');
    }
    if (oSummary.iUpdatedIds > 0) {
      aSummaryParts.push(oSummary.iUpdatedIds + ' sharedConnectionId value(s) updated');
    }
    if (oSummary.aMissing.length > 0) {
      aSummaryParts.push(oSummary.aMissing.length + ' missing connection(s)');
    }
    if (oSummary.aErrors.length > 0) {
      aSummaryParts.push(oSummary.aErrors.length + ' error(s)');
    }

    let sSummaryText = aSummaryParts.length > 0 ? aSummaryParts.join(', ') : 'no changes needed';
    if (oSummary.aErrors.length > 0) {
      let sMessage = 'Connection sync completed with issues: ' + sSummaryText + '.';
      oReporter.log(sMessage);
      oReporter.finish('warning', sMessage);
      if (!oReporter.hasPanel()) {
        vscode.window.showWarningMessage(sMessage + ' See the "Code App Plus: Connection Sync" output for details.');
      }
    } else if (oSummary.aMissing.length > 0) {
      let sMessage = 'Connection sync completed: ' + sSummaryText + '. Missing: ' + oSummary.aMissing.join(', ');
      oReporter.log(sMessage);
      oReporter.finish('warning', sMessage);
      if (!oReporter.hasPanel()) {
        vscode.window.showWarningMessage(sMessage);
      }
    } else {
      let sMessage = 'Connection sync complete: ' + sSummaryText;
      oReporter.log(sMessage);
      oReporter.finish('done', sMessage);
      if (!oReporter.hasPanel()) {
        vscode.window.showInformationMessage(sMessage);
      }
    }
  } catch (oError) {
    let sMessage = 'Connection sync failed: ' + normalizeErrorMessage(oError);
    appendConnectionSyncLog(sMessage);
    vscode.window.showErrorMessage(sMessage);
  }
}

module.exports = { setupProject, authenticate, changeEnvironment, applyEnvironmentSelection, deploy, syncConnections, toggleDebugger, addDataverseSchema };
