#!/usr/bin/env node

const path = require('node:path');

const {
  appendDebuggerBootstrap,
  capAuth,
  capConnector,
  capDataverse,
  capDataverseTable,
  capDeploy,
  capEnvironment,
  capFlow,
  capImport,
  capMockup,
  capSetup,
  parseCommandInput,
} = require('codeapp-js-cli');

function getInvocationCwd() {
  const initCwd = String(process.env.INIT_CWD || '').trim();
  return initCwd ? path.resolve(initCwd) : process.cwd();
}

function printHelp() {
  console.log(`CodeApp JS CLI

Usage:
  CAP <command> [options]

Power Platform Development Commands:
  CAP dataverse --<table-logical-name> : add Dataverse table schema
  CAP table : create a Dataverse table and columns
  CAP flow : lists flows and select to add schema
  CAP flow --<flow-id> : quick select and add schema
  CAP connector --<apiName> : finds first connection of connector and adds connector file
  CAP import : import a code app solution into an editable dist workspace
  CAP export : alias for CAP import
  CAP setup : adds templated files to workspace
  CAP mockup : list HTML mockups in agent and open one in the browser
  CAP mockup --<number> : quick open mockup by list position
  CAP debugger : enable the CodeApp debugger bootstrap
  CAP deploy : deploys to Power Platform environment
  CAP deploy --debugger : deploys to Power Platform with debugger enabled

Power Platform Config Commands:
  CAP auth : authenticate with Power Platform
  CAP auth --change : force account select instead of current SSO
  CAP auth --logout : logout of Power Platform
  CAP environment : lists Power Platform environment and select
  CAP environment --<environmentURL> : quick select environment
  CAP environment --info : info about environment

For more information visit https://codeappjs.com`);
}

function getBlockedCommandMessage(command) {
  const normalizedCommand = String(command || '').toLowerCase();
  const blockedCommands = ['copilot', 'model', 'skills', 'instruction', 'session', 'edit', 'prompt'];

  if (!normalizedCommand || normalizedCommand === '--verbose') {
    return 'CAP chat is not included with the VS Code extension terminal shim. Run CAP --help to see available Power Platform commands.';
  }

  if (blockedCommands.includes(normalizedCommand)) {
    return `CAP ${command} is a GitHub Copilot command and is not included with the VS Code extension terminal shim.`;
  }

  return '';
}

async function runMain() {
  const commandCwd = getInvocationCwd();
  process.chdir(commandCwd);

  const [command, ...rest] = process.argv.slice(2);
  const normalizedCommand = String(command || '').toLowerCase();
  const blockedMessage = getBlockedCommandMessage(command);

  if (blockedMessage) {
    if (!normalizedCommand) {
      printHelp();
      return;
    }

    throw new Error(blockedMessage);
  }

  switch (normalizedCommand) {
    case 'help':
    case '--help':
    case '-h':
      printHelp();
      return;
    case 'auth': {
      const parsed = parseCommandInput(rest, {
        valueFlags: ['--cloud'],
        booleanFlags: ['--change', '--logout'],
      });
      await capAuth(parsed.target ? [parsed.target, ...rest.slice(1)] : rest, { cwd: commandCwd, namedArgs: parsed.namedArgs });
      return;
    }
    case 'environment': {
      const parsed = parseCommandInput(rest, {
        valueFlags: ['--cloud'],
        booleanFlags: ['--info'],
      });
      await capEnvironment(parsed.target, { cwd: commandCwd, namedArgs: parsed.namedArgs });
      return;
    }
    case 'dataverse': {
      const parsed = parseCommandInput(rest, {
        valueFlags: ['--environment', '-env'],
      });
      await capDataverse(parsed.target, { cwd: commandCwd, namedArgs: parsed.namedArgs });
      return;
    }
    case 'table':
      await capDataverseTable(rest, { cwd: commandCwd });
      return;
    case 'import':
    case 'export': {
      const parsed = parseCommandInput(rest, {
        valueFlags: ['--environment', '-env'],
        booleanFlags: ['--help', '-h'],
      });
      await capImport(parsed.target, { cwd: commandCwd, namedArgs: parsed.namedArgs });
      return;
    }
    case 'flow': {
      const parsed = parseCommandInput(rest, {
        valueFlags: ['--cloud', '--environment-id', '-e', '--search', '-s'],
        booleanFlags: ['--non-interactive', '--json', '--no-color'],
      });
      await capFlow(parsed.target, { cwd: commandCwd, passthroughArgs: parsed.passthroughArgs });
      return;
    }
    case 'connector': {
      const parsed = parseCommandInput(rest, {
        valueFlags: ['--environment', '-env'],
      });
      await capConnector(parsed.target, { cwd: commandCwd, namedArgs: parsed.namedArgs });
      return;
    }
    case 'setup':
      await capSetup({ cwd: commandCwd });
      return;
    case 'mockup': {
      const parsed = parseCommandInput(rest);
      await capMockup(parsed.target, { cwd: commandCwd });
      return;
    }
    case 'debugger': {
      const indexPath = await appendDebuggerBootstrap(commandCwd);
      console.log('Debugger bootstrap enabled in ' + indexPath);
      return;
    }
    case 'deploy': {
      const parsed = parseCommandInput(rest, {
        valueFlags: ['--cloud', '--environment-id', '-e', '--solution-id', '-s'],
        booleanFlags: ['--debugger', '--non-interactive', '--json', '--no-color'],
      });
      await capDeploy({
        cwd: commandCwd,
        debugger: parsed.passthroughArgs.includes('--debugger'),
        passthroughArgs: parsed.passthroughArgs.filter((arg) => arg !== '--debugger'),
      });
      return;
    }
    default:
      throw new Error('Unknown CAP command: ' + command);
  }
}

runMain().catch((error) => {
  const details = error && (error.stderr || error.stdout || error.message) || String(error);
  console.error(details);
  process.exit(typeof error.code === 'number' ? error.code : 1);
});