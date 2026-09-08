'use strict';

const fs = require('node:fs');
const path = require('node:path');

function listFiles(sDirectory) {
  return fs.readdirSync(sDirectory, { withFileTypes: true }).flatMap((oEntry) => {
    let sPath = path.join(sDirectory, oEntry.name);
    if (oEntry.isDirectory()) {
      return listFiles(sPath);
    }
    return oEntry.isFile() ? [sPath] : [];
  }).sort();
}

function getAssetContributions(sRoot) {
  let sPackageRoot = path.join(sRoot, 'node_modules', 'codeapp-js');
  let sPackageManifest = path.join(sPackageRoot, 'package.json');
  let sCliSdkManifest = require.resolve('codeapp-js/package.json', {
    paths: [path.join(sRoot, 'node_modules', 'codeapp-js-cli')]
  });
  if (fs.realpathSync(sPackageManifest) !== fs.realpathSync(sCliSdkManifest)) {
    throw new Error('codeapp-js-cli must resolve the same codeapp-js package as the extension.');
  }

  ['power.config.json', 'dist/index.html', 'dist/index.js', 'dist/codeapp.js', 'dist/power-apps-data.js'].forEach((sFile) => {
    if (!fs.statSync(path.join(sPackageRoot, 'codeApp', sFile)).isFile()) {
      throw new Error('Missing codeapp-js template file: ' + sFile);
    }
  });

  let aFiles = listFiles(path.join(sPackageRoot, 'AI'));
  let fnContribution = (sFile) => ({
    path: './' + path.relative(sRoot, sFile).split(path.sep).join('/'),
    sessionTypes: ['local']
  });
  let aAgents = aFiles.filter((sFile) => sFile.endsWith('.agent.md')).map(fnContribution);
  let aSkills = aFiles.filter((sFile) => path.basename(sFile) === 'SKILL.md').map(fnContribution);
  if (!aAgents.length || !aSkills.length) {
    throw new Error('codeapp-js must contain agent and skill files before packaging.');
  }
  return { chatAgents: aAgents, chatSkills: aSkills };
}

function syncCodeAppAssets(sRoot) {
  let oContributions = getAssetContributions(sRoot);
  let sManifestPath = path.join(sRoot, 'package.json');
  let oManifest = JSON.parse(fs.readFileSync(sManifestPath, 'utf8'));
  oManifest.contributes = { ...oManifest.contributes, ...oContributions };
  fs.writeFileSync(sManifestPath, JSON.stringify(oManifest, null, 2) + '\n');
  console.log('Registered ' + oContributions.chatAgents.length + ' agents and ' + oContributions.chatSkills.length + ' skills from codeapp-js.');
}

if (require.main === module) {
  syncCodeAppAssets(path.resolve(__dirname, '..'));
}

module.exports = { getAssetContributions, syncCodeAppAssets };