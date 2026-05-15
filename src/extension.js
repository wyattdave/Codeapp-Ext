const vscode = require('vscode');
const { checkAndInstallCodeAppCli } = require('./codeappCli');
const { setupProject, authenticate, changeEnvironment, deploy, toggleDebugger, addDataverseSchema, addFlowSchema } = require('./commands');

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

function setActionItemsVisibility(bVisible, oSetupItem, oAuthItem, oEnvironmentItem) {
  if (bVisible) {
    oSetupItem.show();
    oAuthItem.show();
    oEnvironmentItem.show();
    return;
  }

  oSetupItem.hide();
  oAuthItem.hide();
  oEnvironmentItem.hide();
}

function createStatusBarItems(oContext) {
  let oSetupItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 111);
  oSetupItem.command = 'codeappjsext.setup';
  oSetupItem.text = '$(tools) Setup';
  oSetupItem.tooltip = 'Set up a CodeAppJS project';

  let oAuthItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 110);
  oAuthItem.command = 'codeappjsext.auth';
  oAuthItem.text = '$(account) Auth';
  oAuthItem.tooltip = 'Authenticate with Power Platform';

  let oEnvironmentItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 109);
  oEnvironmentItem.command = 'codeappjsext.environment';
  updateEnvironmentStatusItem(oEnvironmentItem, oContext);

  let oButtonsToggleItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 112);
  oButtonsToggleItem.command = 'codeappjsext.toggleButtonVisibility';

  let bVisible = getButtonsVisible(oContext);
  updateButtonsToggleStatusItem(oButtonsToggleItem, bVisible);
  setActionItemsVisibility(bVisible, oSetupItem, oAuthItem, oEnvironmentItem);
  oButtonsToggleItem.show();

  return { oSetupItem, oAuthItem, oEnvironmentItem, oButtonsToggleItem };
}

async function activate(oContext) {
  checkAndInstallCodeAppCli();

  await vscode.commands.executeCommand('setContext', 'codeappjsext.buttonsVisible', getButtonsVisible(oContext));

  let { oSetupItem, oAuthItem, oEnvironmentItem, oButtonsToggleItem } = createStatusBarItems(oContext);

  let oSetupDisposable = vscode.commands.registerCommand('codeappjsext.setup', async () => {
    await setupProject(oContext);
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
    setActionItemsVisibility(bVisible, oSetupItem, oAuthItem, oEnvironmentItem);
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
    oAuthDisposable,
    oEnvironmentDisposable,
    oToggleButtonsDisposable,
    oConnectionsDisposable,
    oFlowSchemaDisposable,
    oDebuggerDisposable,
    oDeployDisposable,
    oSetupItem,
    oAuthItem,
    oEnvironmentItem,
    oButtonsToggleItem
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
