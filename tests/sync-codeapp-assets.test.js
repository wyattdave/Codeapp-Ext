'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { getAssetContributions, syncCodeAppAssets } = require('../scripts/sync-codeapp-assets');

function createFixture(oTest) {
  let sRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'codeapp-assets-'));
  oTest.after(() => fs.rmSync(sRoot, { recursive: true, force: true }));
  let fnWrite = (sFile, sContent = '') => {
    let sPath = path.join(sRoot, sFile);
    fs.mkdirSync(path.dirname(sPath), { recursive: true });
    fs.writeFileSync(sPath, sContent);
  };
  fnWrite('package.json', JSON.stringify({ version: '2.1.6', contributes: { commands: [{ command: 'keep.me' }], chatSkills: [{ path: './stale.md' }] } }));
  fnWrite('node_modules/codeapp-js/package.json', '{"name":"codeapp-js","version":"2.2.1"}');
  fnWrite('node_modules/codeapp-js-cli/package.json', '{"name":"codeapp-js-cli"}');
  fnWrite('node_modules/codeapp-js/AI/codeapp.agent.md', '---\nname: codeapp\n---');
  fnWrite('node_modules/codeapp-js/AI/skills/start/SKILL.md');
  ['power.config.json', 'dist/index.html', 'dist/index.js', 'dist/codeapp.js', 'dist/power-apps-data.js'].forEach((sFile) => {
    fnWrite('node_modules/codeapp-js/codeApp/' + sFile);
  });
  return { sRoot, fnWrite };
}

test('discovers new agents and skills with portable extension-relative paths', (oTest) => {
  let { sRoot, fnWrite } = createFixture(oTest);
  fnWrite('node_modules/codeapp-js/AI/agents/extra.agent.md');
  fnWrite('node_modules/codeapp-js/AI/skills/docs/SKILL.md');
  fnWrite('node_modules/codeapp-js/AI/skills/docs/docs-template.html');
  let oResult = getAssetContributions(sRoot);
  assert.equal(oResult.chatAgents.length, 2);
  assert.deepEqual(oResult.chatSkills, [
    { path: './node_modules/codeapp-js/AI/skills/docs/SKILL.md', sessionTypes: ['local'] },
    { path: './node_modules/codeapp-js/AI/skills/start/SKILL.md', sessionTypes: ['local'] }
  ]);
});

test('replaces stale registrations, preserves unrelated contributions, and is idempotent', (oTest) => {
  let { sRoot } = createFixture(oTest);
  syncCodeAppAssets(sRoot);
  let sFirst = fs.readFileSync(path.join(sRoot, 'package.json'), 'utf8');
  let oManifest = JSON.parse(sFirst);
  assert.equal(oManifest.version, '2.1.6');
  assert.deepEqual(oManifest.contributes.commands, [{ command: 'keep.me' }]);
  assert.equal(oManifest.contributes.chatSkills.length, 1);
  assert.equal(oManifest.contributes.chatAgents.length, 1);
  syncCodeAppAssets(sRoot);
  assert.equal(fs.readFileSync(path.join(sRoot, 'package.json'), 'utf8'), sFirst);
});

test('rejects a different SDK nested under the CLI', (oTest) => {
  let { sRoot, fnWrite } = createFixture(oTest);
  fnWrite('node_modules/codeapp-js-cli/node_modules/codeapp-js/package.json', '{"name":"codeapp-js","version":"1.0.0"}');
  assert.throws(() => getAssetContributions(sRoot), new RegExp('same codeapp-js package'));
});

test('rejects missing template files without changing the manifest', (oTest) => {
  let { sRoot } = createFixture(oTest);
  let sBefore = fs.readFileSync(path.join(sRoot, 'package.json'), 'utf8');
  fs.unlinkSync(path.join(sRoot, 'node_modules/codeapp-js/codeApp/dist/codeapp.js'));
  assert.throws(() => syncCodeAppAssets(sRoot), new RegExp('ENOENT'));
  assert.equal(fs.readFileSync(path.join(sRoot, 'package.json'), 'utf8'), sBefore);
});

test('rejects missing agents or skills', (oTest) => {
  let { sRoot, fnWrite } = createFixture(oTest);
  fs.unlinkSync(path.join(sRoot, 'node_modules/codeapp-js/AI/codeapp.agent.md'));
  assert.throws(() => getAssetContributions(sRoot), new RegExp('agent and skill files'));
  fnWrite('node_modules/codeapp-js/AI/codeapp.agent.md');
  fs.unlinkSync(path.join(sRoot, 'node_modules/codeapp-js/AI/skills/start/SKILL.md'));
  assert.throws(() => getAssetContributions(sRoot), new RegExp('agent and skill files'));
});