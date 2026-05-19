#!/usr/bin/env node
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const S_POWER_APPS_PACKAGE = '@microsoft/power-apps-cli';
const S_POWER_APPS_COMMAND = 'power-apps';
const S_DEFAULT_CLOUD = 'prod';
const S_PROFILE_STATE_FILE = path.join(os.homedir(), '.powerapps-cli', 'codeapp-profile.json');
const S_MSAL_CACHE_FILE = 'msal_cache.json';
const aArgs = process.argv.slice(2);
const sCommand = aArgs[0] || '';
const aRest = aArgs.slice(1);

let oPacCompatibilityContextPromise = null;

function isNodeScriptExecutablePath(sExecutablePath) {
  let sExtension = path.extname(String(sExecutablePath || '')).toLowerCase();
  return sExtension === '.js' || sExtension === '.cjs' || sExtension === '.mjs';
}

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
  if (isNodeScriptExecutablePath(oSpec.sExecutable)) {
    return {
      sCommand: process.execPath,
      aArgs: [oSpec.sExecutable].concat(oSpec.aExecutableArgs),
      bWindowsVerbatimArguments: false
    };
  }

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

function getLocalNodeModulesDirectories() {
  return [
    path.resolve(__dirname, '..', '..', 'node_modules'),
    path.join(process.cwd(), 'node_modules')
  ].filter((sDirectoryPath, iIndex, aDirectories) => {
    return aDirectories.indexOf(sDirectoryPath) === iIndex && fs.existsSync(sDirectoryPath);
  });
}

function getLocalNodeModulesBinDirectories() {
  return getLocalNodeModulesDirectories().map((sDirectoryPath) => path.join(sDirectoryPath, '.bin')).filter((sDirectoryPath, iIndex, aDirectories) => {
    return aDirectories.indexOf(sDirectoryPath) === iIndex && fs.existsSync(sDirectoryPath);
  });
}

function getPowerAppsCliPackageRoot() {
  let aNodeModulesDirectories = getLocalNodeModulesDirectories();
  for (let iIndex = 0; iIndex < aNodeModulesDirectories.length; iIndex++) {
    let sPackageRoot = path.join(aNodeModulesDirectories[iIndex], '@microsoft', 'power-apps-cli');
    if (fs.existsSync(sPackageRoot)) {
      return sPackageRoot;
    }
  }

  return '';
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

function getPowerAppsCliBinEntryPath() {
  return getPackageBinEntryPath(getPowerAppsCliPackageRoot(), S_POWER_APPS_COMMAND);
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

  if (sCommandName === S_POWER_APPS_COMMAND) {
    let sPackageBinEntryPath = getPowerAppsCliBinEntryPath();
    if (sPackageBinEntryPath) {
      return sPackageBinEntryPath;
    }
  }

  if (sCommandName === 'pac' || sCommandName === S_POWER_APPS_COMMAND) {
    return '';
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
    return 'PAC compatibility is provided by codeapp itself. Reinstall the extension or install @microsoft/power-apps-cli locally.';
  }
  if (sExecutableName === S_POWER_APPS_COMMAND) {
    return 'Could not find the packaged power-apps CLI. Reinstall the extension or install @microsoft/power-apps-cli locally.';
  }
  if (sExecutableName === 'npx') {
    return 'Could not find npx. Install Node.js and ensure npx is available to VS Code.';
  }

  return 'Could not find ' + sExecutableName + '.';
}

function getPacHelpText() {
  return [
    'Usage: codeapp pac <group> <command> [options]',
    '',
    'Supported PAC compatibility commands:',
    '  auth create               Sign in using the local power-apps auth cache',
    '  auth clear                Clear the local power-apps auth cache',
    '  auth who [--json]         Show the current signed-in account and selected environment',
    '  env list [--json]         List environments using the local power-apps SDK',
    '  env select --environment <id>    Persist the selected environment for auth who',
    ''
  ].join('\n');
}

function printHelp() {
  process.stdout.write(
    'Usage: codeapp <command> [options]\n\n' +
    'Lightweight wrapper used by the VS Code extension.\n\n' +
    'Commands:\n' +
    '  add-data-source   Run power-apps add-data-source with extension-friendly flags\n' +
    '  push              Run power-apps push\n' +
    '  list-codeapps     Run power-apps list-codeapps\n' +
    '  pac               Run PAC-compatible auth and environment commands\n' +
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

function getFlagValue(aInputArgs, aFlags) {
  for (let iIndex = 0; iIndex < aInputArgs.length; iIndex++) {
    let sArg = aInputArgs[iIndex];
    if (aFlags.indexOf(sArg) >= 0) {
      return aInputArgs[iIndex + 1] || '';
    }

    let oInlineMatch = new RegExp('^(' + aFlags.map((sFlag) => sFlag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')=(.+)$').exec(sArg);
    if (oInlineMatch) {
      return oInlineMatch[2] || '';
    }
  }

  return '';
}

function hasAnyFlag(aInputArgs, aFlags) {
  return aInputArgs.some((sArg) => aFlags.indexOf(sArg) >= 0);
}

function readProfileState() {
  if (!fs.existsSync(S_PROFILE_STATE_FILE)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(S_PROFILE_STATE_FILE, 'utf8')) || {};
  } catch (oError) {
    return {};
  }
}

function writeProfileState(oState) {
  fs.mkdirSync(path.dirname(S_PROFILE_STATE_FILE), { recursive: true });
  fs.writeFileSync(S_PROFILE_STATE_FILE, JSON.stringify(oState, null, 2) + '\n', 'utf8');
}

function clearProfileState() {
  if (fs.existsSync(S_PROFILE_STATE_FILE)) {
    fs.rmSync(S_PROFILE_STATE_FILE, { force: true });
  }
}

function normalizeEnvironmentId(sEnvironmentId) {
  return String(sEnvironmentId || '').trim().replace(/^Default-/i, '');
}

function areEnvironmentIdsEquivalent(sLeftEnvironmentId, sRightEnvironmentId) {
  return normalizeEnvironmentId(sLeftEnvironmentId).toLowerCase() === normalizeEnvironmentId(sRightEnvironmentId).toLowerCase();
}

function getClusterCategoryForCloud(sCloud) {
  switch (String(sCloud || S_DEFAULT_CLOUD).toLowerCase()) {
    case 'preview':
      return 'firstrelease';
    case 'gccmoderate':
      return 'gov';
    case 'gcchigh':
      return 'high';
    case 'dod':
    case 'mooncake':
    case 'ex':
    case 'rx':
    case 'test':
    case 'preprod':
    case 'prod':
      return String(sCloud || S_DEFAULT_CLOUD).toLowerCase();
    default:
      return 'prod';
  }
}

async function importPowerAppsCliModule(aPathParts) {
  let sPackageRoot = getPowerAppsCliPackageRoot();
  if (!sPackageRoot) {
    throw new Error('Could not find ' + S_POWER_APPS_PACKAGE + ' in local node_modules.');
  }

  let sModulePath = path.join(sPackageRoot, ...aPathParts);
  return await import(pathToFileURL(sModulePath).href);
}

async function getPacCompatibilityContext(sCloud = S_DEFAULT_CLOUD) {
  if (!oPacCompatibilityContextPromise) {
    oPacCompatibilityContextPromise = (async () => {
      let sResolvedCloud = String(sCloud || S_DEFAULT_CLOUD).toLowerCase();
      let sClusterCategory = getClusterCategoryForCloud(sResolvedCloud);
      let [
        oCliSettingsModule,
        oAuthModule,
        oHttpClientModule,
        oDiscoveryModule,
        oConstantsModule
      ] = await Promise.all([
        importPowerAppsCliModule(['dist', 'CliSettings.js']),
        importPowerAppsCliModule(['dist', 'Authentication', 'NodeMsalAuthenticationProvider.js']),
        importPowerAppsCliModule(['dist', 'HttpClient', 'CliHttpClient.js']),
        import(pathToFileURL(path.join(path.dirname(getPowerAppsCliPackageRoot()), 'power-apps-common', 'dist', 'services', 'PowerPlatformApiDiscovery.js')).href),
        importPowerAppsCliModule(['dist', 'Constants.js'])
      ]);

      await oCliSettingsModule.initializeCliSettings({
        source: 'standalone',
        interactive: false
      });

      let oAuthProvider = new oAuthModule.NodeMsalAuthenticationProvider();
      await oAuthProvider.initAsync(sResolvedCloud);

      return {
        oAuthProvider: oAuthProvider,
        oHttpClient: new oHttpClientModule.CliHttpClient(oAuthProvider),
        oDiscovery: new oDiscoveryModule.PowerPlatformApiDiscovery(sClusterCategory),
        sAuthCacheDirectory: oConstantsModule.AUTH_CACHE_DIRECTORY,
        sAuthResource: new oDiscoveryModule.PowerPlatformApiDiscovery(sClusterCategory).getTokenAudience(),
        sCloud: sResolvedCloud
      };
    })();
  }

  return await oPacCompatibilityContextPromise;
}

async function getCachedAccounts(oContext) {
  if (!oContext || !oContext.oAuthProvider || !oContext.oAuthProvider._msalClient) {
    return [];
  }

  return await oContext.oAuthProvider._msalClient.getTokenCache().getAllAccounts();
}

function ensureAuthCacheStore(oContext) {
  if (!oContext || !oContext.sAuthCacheDirectory) {
    return;
  }

  fs.mkdirSync(oContext.sAuthCacheDirectory, { recursive: true });
  let sCacheFilePath = path.join(oContext.sAuthCacheDirectory, S_MSAL_CACHE_FILE);
  if (!fs.existsSync(sCacheFilePath)) {
    fs.writeFileSync(sCacheFilePath, '{}', 'utf8');
  }
}

async function clearCachedAccounts(oContext) {
  let aAccounts = await getCachedAccounts(oContext);
  if (!oContext || !oContext.oAuthProvider || !oContext.oAuthProvider._msalClient) {
    return;
  }

  let oTokenCache = oContext.oAuthProvider._msalClient.getTokenCache();
  for (let iIndex = 0; iIndex < aAccounts.length; iIndex++) {
    await oTokenCache.removeAccount(aAccounts[iIndex]);
  }

  ensureAuthCacheStore(oContext);
}

async function ensureAuthenticated(oContext) {
  ensureAuthCacheStore(oContext);
  await oContext.oAuthProvider.getAccessTokenForResource(oContext.sAuthResource);
}

async function authenticateWithAccountPicker(oContext) {
  ensureAuthCacheStore(oContext);
  let sScope = oContext.sAuthResource + '/.default';
  let oRequest = Object.assign({}, oContext.oAuthProvider._getInteractiveLoginRequest(sScope), {
    prompt: 'select_account'
  });
  let oResult = await oContext.oAuthProvider._msalClient.acquireTokenInteractive(oRequest);
  oContext.oAuthProvider._tenantId = oResult && oResult.tenantId ? oResult.tenantId : '';
  return oResult;
}

function extractEnvironmentCollection(oPayload) {
  if (Array.isArray(oPayload)) {
    return oPayload;
  }
  if (oPayload && Array.isArray(oPayload.value)) {
    return oPayload.value;
  }
  if (oPayload && Array.isArray(oPayload.environments)) {
    return oPayload.environments;
  }
  if (oPayload && oPayload.name && oPayload.properties) {
    return [oPayload];
  }

  return [];
}

function mapEnvironmentToPacShape(oEnvironment) {
  let sEnvironmentId = String(oEnvironment?.name || oEnvironment?.id || '').trim();
  if (!sEnvironmentId) {
    return null;
  }

  let oMetadata = oEnvironment?.properties?.linkedEnvironmentMetadata || {};
  return {
    FriendlyName: oEnvironment?.properties?.displayName || oMetadata.friendlyName || oMetadata.uniqueName || sEnvironmentId,
    UniqueName: oMetadata.uniqueName || sEnvironmentId,
    EnvironmentId: sEnvironmentId,
    EnvironmentUrl: oMetadata.instanceUrl || oMetadata.instanceApiUrl || '',
    EnvironmentIdentifier: {
      Id: sEnvironmentId,
      IsDefault: /^default-/i.test(sEnvironmentId)
    }
  };
}

async function fetchEnvironments(oContext) {
  await ensureAuthenticated(oContext);

  let sTenantId = oContext.oAuthProvider.getUserTenantId();
  if (!sTenantId) {
    throw new Error('Unable to determine the signed-in tenant.');
  }

  let sTenantEndpoint = 'https://' + oContext.oDiscovery.getTenantEndpoint(sTenantId);
  let aCandidateUrls = [
    sTenantEndpoint + '/powerapps/environment?api-version=1',
    sTenantEndpoint + '/powerapps/environments?api-version=1'
  ];
  let oLastError = null;

  for (let iIndex = 0; iIndex < aCandidateUrls.length; iIndex++) {
    try {
      let oResponse = await oContext.oHttpClient.get(aCandidateUrls[iIndex], {
        authResource: oContext.sAuthResource
      });
      return extractEnvironmentCollection(oResponse.data)
        .map((oEnvironment) => mapEnvironmentToPacShape(oEnvironment))
        .filter((oEnvironment) => Boolean(oEnvironment));
    } catch (oError) {
      oLastError = oError;
    }
  }

  throw oLastError || new Error('Unable to list environments.');
}

async function populateSelectedEnvironmentDetails(oContext, oProfileState) {
  if (!oProfileState.sEnvironmentId) {
    return oProfileState;
  }

  try {
    let aEnvironments = await fetchEnvironments(oContext);
    let oSelectedEnvironment = aEnvironments.find((oEnvironment) => areEnvironmentIdsEquivalent(oEnvironment.EnvironmentId, oProfileState.sEnvironmentId));
    if (!oSelectedEnvironment) {
      return oProfileState;
    }

    return Object.assign({}, oProfileState, {
      sEnvironmentId: oSelectedEnvironment.EnvironmentId,
      sEnvironmentName: oSelectedEnvironment.FriendlyName,
      sEnvironmentUrl: oSelectedEnvironment.EnvironmentUrl
    });
  } catch (oError) {
    return oProfileState;
  }
}

function writePacJson(oPayload) {
  process.stdout.write(JSON.stringify(oPayload, null, 2) + '\n');
}

function writePacWhoText(oWhoState) {
  let aLines = [];
  if (oWhoState.sUserName) {
    aLines.push('User: ' + oWhoState.sUserName);
  }
  if (oWhoState.sTenantId) {
    aLines.push('Tenant ID: ' + oWhoState.sTenantId);
  }
  if (oWhoState.sEnvironmentId) {
    aLines.push('Environment ID: ' + oWhoState.sEnvironmentId);
  }
  if (oWhoState.sEnvironmentUrl) {
    aLines.push('Org URL: ' + oWhoState.sEnvironmentUrl);
  }

  process.stdout.write((aLines.length ? aLines.join('\n') : 'No profiles were found.') + '\n');
}

function writePacEnvironmentTable(aEnvironments) {
  let oProfileState = readProfileState();
  process.stdout.write('Active Friendly Name Environment ID Environment URL\n');
  process.stdout.write('------ ------------- -------------- ---------------\n');
  aEnvironments.forEach((oEnvironment) => {
    let sActiveMarker = areEnvironmentIdsEquivalent(oEnvironment.EnvironmentId, oProfileState.sEnvironmentId) ? '*' : ' ';
    process.stdout.write(
      sActiveMarker + ' ' +
      (oEnvironment.FriendlyName || 'Unknown') + ' ' +
      oEnvironment.EnvironmentId + ' ' +
      (oEnvironment.EnvironmentUrl || '') + '\n'
    );
  });
}

async function handlePacAuthCreate(aPacArgs) {
  let sCloud = getFlagValue(aPacArgs, ['--cloud']) || S_DEFAULT_CLOUD;
  let oContext = await getPacCompatibilityContext(sCloud);
  clearProfileState();
  await clearCachedAccounts(oContext);
  let oResult = await authenticateWithAccountPicker(oContext);
  let sUserName = oResult && oResult.account && oResult.account.username ? oResult.account.username : '';

  if (hasAnyFlag(aPacArgs, ['--json'])) {
    writePacJson({
      status: 'Authenticated',
      user: sUserName,
      tenantId: oContext.oAuthProvider.getUserTenantId() || ''
    });
    return;
  }

  process.stdout.write('Authentication complete' + (sUserName ? ': ' + sUserName : '.') + '\n');
}

async function handlePacAuthClear() {
  let oContext = await getPacCompatibilityContext(S_DEFAULT_CLOUD);
  clearProfileState();

  if ((await getCachedAccounts(oContext)).length > 0 || fs.existsSync(oContext.sAuthCacheDirectory)) {
    await clearCachedAccounts(oContext);
    process.stdout.write('Successfully logged out. Cached credentials have been cleared.\n');
    return;
  }

  process.stdout.write('No user found.\n');
}

async function handlePacAuthWho(aPacArgs) {
  let oProfileState = readProfileState();
  let oContext = await getPacCompatibilityContext(getFlagValue(aPacArgs, ['--cloud']) || S_DEFAULT_CLOUD);
  let aAccounts = await getCachedAccounts(oContext);

  if (aAccounts.length === 0) {
    if (hasAnyFlag(aPacArgs, ['--json'])) {
      writePacJson({});
      return;
    }

    process.stdout.write('No profiles were found.\n');
    return;
  }

  if (!oContext.oAuthProvider.getUserTenantId()) {
    try {
      await ensureAuthenticated(oContext);
    } catch (oError) {
      /* Keep auth who best-effort even if silent token acquisition fails. */
    }
  }

  oProfileState = await populateSelectedEnvironmentDetails(oContext, oProfileState);
  if (oProfileState.sEnvironmentId) {
    writeProfileState(oProfileState);
  }

  let oWhoState = {
    sUserName: aAccounts[0].username || '',
    sTenantId: oContext.oAuthProvider.getUserTenantId() || '',
    sEnvironmentId: oProfileState.sEnvironmentId || '',
    sEnvironmentUrl: oProfileState.sEnvironmentUrl || ''
  };

  if (hasAnyFlag(aPacArgs, ['--json'])) {
    writePacJson({
      User: oWhoState.sUserName,
      TenantId: oWhoState.sTenantId,
      EnvironmentId: oWhoState.sEnvironmentId,
      OrgUrl: oWhoState.sEnvironmentUrl
    });
    return;
  }

  writePacWhoText(oWhoState);
}

async function handlePacEnvList(aPacArgs) {
  let oContext = await getPacCompatibilityContext(getFlagValue(aPacArgs, ['--cloud']) || S_DEFAULT_CLOUD);
  let aEnvironments = await fetchEnvironments(oContext);

  if (hasAnyFlag(aPacArgs, ['--json'])) {
    writePacJson(aEnvironments);
    return;
  }

  writePacEnvironmentTable(aEnvironments);
}

async function handlePacEnvSelect(aPacArgs) {
  let sEnvironmentId = normalizeEnvironmentId(getFlagValue(aPacArgs, ['--environment', '-e']));
  if (!sEnvironmentId) {
    throw new Error('Missing required option --environment.');
  }

  let oProfileState = readProfileState();
  let oUpdatedState = Object.assign({}, oProfileState, {
    sEnvironmentId: sEnvironmentId
  });

  try {
    let oContext = await getPacCompatibilityContext(getFlagValue(aPacArgs, ['--cloud']) || S_DEFAULT_CLOUD);
    oUpdatedState = await populateSelectedEnvironmentDetails(oContext, oUpdatedState);
  } catch (oError) {
    /* Selection persistence should still succeed even if metadata lookup fails. */
  }

  writeProfileState(oUpdatedState);

  if (hasAnyFlag(aPacArgs, ['--json'])) {
    writePacJson({ EnvironmentId: oUpdatedState.sEnvironmentId, OrgUrl: oUpdatedState.sEnvironmentUrl || '' });
    return;
  }

  process.stdout.write('Selected environment: ' + oUpdatedState.sEnvironmentId + '\n');
}

async function handlePacCompatibility(aPacArgs) {
  if (!aPacArgs.length || hasAnyFlag(aPacArgs, ['--help', '-h'])) {
    process.stdout.write(getPacHelpText());
    return;
  }

  let sGroup = aPacArgs[0];
  let sAction = aPacArgs[1] || '';
  let aPacRest = aPacArgs.slice(2);

  if (sGroup === 'auth' && sAction === 'create') {
    await handlePacAuthCreate(aPacRest);
    return;
  }

  if (sGroup === 'auth' && sAction === 'clear') {
    await handlePacAuthClear();
    return;
  }

  if (sGroup === 'auth' && sAction === 'who') {
    await handlePacAuthWho(aPacRest);
    return;
  }

  if (sGroup === 'env' && sAction === 'list') {
    await handlePacEnvList(aPacRest);
    return;
  }

  if (sGroup === 'env' && sAction === 'select') {
    await handlePacEnvSelect(aPacRest);
    return;
  }

  throw new Error('Unsupported pac compatibility command: ' + aPacArgs.join(' '));
}

function getCommandSpec() {
  switch (sCommand) {
    case 'add-data-source':
      return {
        sExecutableName: S_POWER_APPS_COMMAND,
        sExecutable: resolveExecutable(S_POWER_APPS_COMMAND),
        aExecutableArgs: ['add-data-source'].concat(mapArgs(normalizeHelpArgs(aRest), {
          '--org-url': '--org-url',
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
    case 'pac':
      return {
        sExecutableName: 'pac',
        sExecutable: resolveExecutable('pac'),
        aExecutableArgs: normalizeHelpArgs(aRest)
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
  if (sCommand === 'pac') {
    handlePacCompatibility(aRest).then(() => {
      process.exit(0);
    }).catch((oError) => {
      process.stderr.write((oError && oError.message ? oError.message : String(oError)) + '\n');
      process.exit(1);
    });
    return;
  }

  if (sCommand === 'logout') {
    handlePacCompatibility(['auth', 'clear']).then(() => {
      process.exit(0);
    }).catch((oError) => {
      process.stderr.write((oError && oError.message ? oError.message : String(oError)) + '\n');
      process.exit(1);
    });
    return;
  }

  let oSpec = getCommandSpec();
  if (!oSpec.sExecutable) {
    process.stderr.write(getMissingExecutableMessage(oSpec.sExecutableName || 'command') + '\n');
    process.exit(1);
  }

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
