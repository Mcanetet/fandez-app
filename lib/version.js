const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

function getAppVersionInfo() {
  let pkg = { name: 'fandez-app', version: '0.0.0' };
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  } catch (_) {}

  let gitCommit = null;
  let gitTag = null;
  try {
    gitCommit = execSync('git rev-parse --short HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch (_) {}
  try {
    gitTag = execSync('git describe --tags --always --dirty', { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch (_) {}

  return {
    name: pkg.name,
    version: pkg.version,
    gitCommit,
    gitTag,
    label: `v${pkg.version}${gitCommit ? ` · ${gitCommit}` : ''}`
  };
}

function getAssetVersion() {
  const info = getAppVersionInfo();
  return info.gitCommit || String(info.version).replace(/\./g, '');
}

module.exports = { getAppVersionInfo, getAssetVersion };
