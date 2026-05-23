const vscode = require('vscode');
const { checkAndInstallCodeAppCli } = require('./codeappCli');
const { setupProject, authenticate, changeEnvironment, deploy, importProject, openMockup, addDataverseTable, toggleDebugger, addDataverseSchema, addFlowSchema } = require('./commands');

const S_ENVIRONMENT_STORAGE_KEY = 'selectedEnvironmentId';
const S_BUTTONS_VISIBLE_STORAGE_KEY = 'buttonsVisible';

function getButtonsVisible(oContext) {
  return oContext.globalState.get(S_BUTTONS_VISIBLE_STORAGE_KEY, true);
}

async function applyButtonsVisibleState(bVisible, oContext) {
  await vscode.commands.executeCommand('setContext', 'codeappjsext.buttonsVisible', bVisible);
  await oContext.globalState.update(S_BUTTONS_VISIBLE_STORAGE_KEY, bVisible);
}

function shortenEnvironmentId(sEnvironmentId) {
  let sValue = String(sEnvironmentId || '').trim();
  if (!sValue) {
    return 'Not set';
  }

  if (sValue.length <= 18) {
    return sValue;
  }

  return sValue.substring(0, 8) + '...' + sValue.substring(sValue.length - 6);
}

function updateEnvironmentStatusItem(oItem, oContext) {
  let sEnvironmentId = oContext.globalState.get(S_ENVIRONMENT_STORAGE_KEY, '');
  let sShortEnvironmentId = shortenEnvironmentId(sEnvironmentId);

  oItem.text = '$(globe) Env: ' + sShortEnvironmentId;
  oItem.tooltip = sEnvironmentId
    ? 'Current Power Platform environment: ' + sEnvironmentId
    : 'Select a Power Platform environment';
}

function updateButtonsToggleStatusItem(oItem, bVisible) {
  oItem.text = bVisible ? '$(eye) CA' : '$(eye-closed) CA';
  oItem.tooltip = bVisible
    ? 'Hide CodeAppJS actions'
    : 'Show CodeAppJS actions';
}

function setActionItemsVisibility(bVisible, aItems) {
  aItems.forEach((oItem) => {
    if (bVisible) {
      oItem.show();
      return;
    }

    oItem.hide();
  });
}

function createStatusBarItems(oContext) {
  let oDeployItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 111);
  oDeployItem.command = 'codeappjsext.deploy';
  oDeployItem.text = '$(cloud-upload) Deploy';
  oDeployItem.tooltip = 'Deploy the current CodeAppJS project';

  let oDebuggerItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 110);
  oDebuggerItem.command = 'codeappjsext.debugger';
  oDebuggerItem.text = '$(debug-alt-small) Debugger';
  oDebuggerItem.tooltip = 'Toggle the CodeAppJS debugger';

  let oDataverseItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 109);
  oDataverseItem.command = 'codeappjsext.connections';
  oDataverseItem.text = '$(plug) Dataverse';
  oDataverseItem.tooltip = 'Add a Dataverse schema to the workspace';

  let oTableItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 108);
  oTableItem.command = 'codeappjsext.table';
  oTableItem.text = '$(table) Table';
  oTableItem.tooltip = 'Run CAP table to create a Dataverse table';

  let oFlowItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 107);
  oFlowItem.command = 'codeappjsext.flowSchema';
  oFlowItem.text = '$(references) Flow';
  oFlowItem.tooltip = 'Add a flow schema to the workspace';

  let oMockupItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 106.5);
  oMockupItem.command = 'codeappjsext.mockup';
  oMockupItem.text = '$(device-desktop) Mockup';
  oMockupItem.tooltip = 'Open an HTML mockup from agent/';

  let oImportItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 106);
  oImportItem.command = 'codeappjsext.import';
  oImportItem.text = '$(cloud-download) Import';
  oImportItem.tooltip = 'Import a CodeAppJS solution into the workspace';

  let oSetupItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 105);
  oSetupItem.command = 'codeappjsext.setup';
  oSetupItem.text = '$(tools) Setup';
  oSetupItem.tooltip = 'Set up a CodeAppJS project';

  let oEnvironmentItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 104);
  oEnvironmentItem.command = 'codeappjsext.environment';
  updateEnvironmentStatusItem(oEnvironmentItem, oContext);

  let oAuthItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 103);
  oAuthItem.command = 'codeappjsext.auth';
  oAuthItem.text = '$(account) Auth';
  oAuthItem.tooltip = 'Authenticate with Power Platform';

  let oButtonsToggleItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 112);
  oButtonsToggleItem.command = 'codeappjsext.toggleButtonVisibility';

  let bVisible = getButtonsVisible(oContext);
  let aActionItems = [oDeployItem, oDebuggerItem, oDataverseItem, oTableItem, oFlowItem, oMockupItem, oImportItem, oSetupItem, oEnvironmentItem, oAuthItem];
  updateButtonsToggleStatusItem(oButtonsToggleItem, bVisible);
  setActionItemsVisibility(bVisible, aActionItems);
  oButtonsToggleItem.show();

  return { oDeployItem, oDebuggerItem, oDataverseItem, oTableItem, oFlowItem, oMockupItem, oImportItem, oSetupItem, oEnvironmentItem, oAuthItem, oButtonsToggleItem };
}

async function activate(oContext) {
  checkAndInstallCodeAppCli();

  await vscode.commands.executeCommand('setContext', 'codeappjsext.buttonsVisible', getButtonsVisible(oContext));

  let { oDeployItem, oDebuggerItem, oDataverseItem, oTableItem, oFlowItem, oMockupItem, oImportItem, oSetupItem, oEnvironmentItem, oAuthItem, oButtonsToggleItem } = createStatusBarItems(oContext);

  let oSetupDisposable = vscode.commands.registerCommand('codeappjsext.setup', async () => {
    await setupProject(oContext);
  });

  let oImportDisposable = vscode.commands.registerCommand('codeappjsext.import', async () => {
    await importProject();
  });

  let oMockupDisposable = vscode.commands.registerCommand('codeappjsext.mockup', async () => {
    await openMockup();
  });

  let oAuthDisposable = vscode.commands.registerCommand('codeappjsext.auth', async () => {
    await authenticate();
  });

  let oEnvironmentDisposable = vscode.commands.registerCommand('codeappjsext.environment', async () => {
    await changeEnvironment(oContext);
    updateEnvironmentStatusItem(oEnvironmentItem, oContext);
  });

  let oToggleButtonsDisposable = vscode.commands.registerCommand('codeappjsext.toggleButtonVisibility', async () => {
    let bVisible = !getButtonsVisible(oContext);
    await applyButtonsVisibleState(bVisible, oContext);
    setActionItemsVisibility(bVisible, [oDeployItem, oDebuggerItem, oDataverseItem, oTableItem, oFlowItem, oMockupItem, oImportItem, oSetupItem, oEnvironmentItem, oAuthItem]);
    updateButtonsToggleStatusItem(oButtonsToggleItem, bVisible);
  });

  let oConnectionsDisposable = vscode.commands.registerCommand('codeappjsext.connections', async () => {
    let sTableName = await vscode.window.showInputBox({
      title: 'Add Dataverse Schema',
      prompt: 'Dataverse table logical name',
      placeHolder: 'account',
      ignoreFocusOut: true,
      validateInput: (sValue) => sValue && sValue.trim() ? null : 'Table logical name is required.'
    });

    if (sTableName === undefined) {
      return;
    }

    await addDataverseSchema(null, sTableName);
  });

  let oTableDisposable = vscode.commands.registerCommand('codeappjsext.table', async () => {
    await addDataverseTable();
  });

  let oFlowSchemaDisposable = vscode.commands.registerCommand('codeappjsext.flowSchema', async () => {
    await addFlowSchema();
  });

  let oDebuggerDisposable = vscode.commands.registerCommand('codeappjsext.debugger', async () => {
    await toggleDebugger();
  });

  let oDeployDisposable = vscode.commands.registerCommand('codeappjsext.deploy', async () => {
    await deploy();
  });

  oContext.subscriptions.push(
    oSetupDisposable,
    oImportDisposable,
    oMockupDisposable,
    oAuthDisposable,
    oEnvironmentDisposable,
    oToggleButtonsDisposable,
    oConnectionsDisposable,
    oTableDisposable,
    oFlowSchemaDisposable,
    oDebuggerDisposable,
    oDeployDisposable,
    oDeployItem,
    oDebuggerItem,
    oDataverseItem,
    oTableItem,
    oFlowItem,
    oMockupItem,
    oImportItem,
    oSetupItem,
    oEnvironmentItem,
    oAuthItem,
    oButtonsToggleItem
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
