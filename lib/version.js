const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

let cachedInfo = null;

function getAppVersionInfo() {
  if (cachedInfo) return cachedInfo;

  let pkg = { name: 'fandez-app', version: '0.0.0' };
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  } catch (_) {}

  let gitCommit = null;
  let gitTag = null;
  try {
    gitCommit = execSync('git rev-parse --short HEAD', {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 1500,
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch (_) {}
  try {
    gitTag = execSync('git describe --tags --always --dirty', {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 1500,
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch (_) {}

  cachedInfo = {
    name: pkg.name,
    version: pkg.version,
    gitCommit,
    gitTag,
    label: `v${pkg.version}${gitCommit ? ` · ${gitCommit}` : ''}`
  };
  return cachedInfo;
}

function getAssetVersion() {
  const info = getAppVersionInfo();
  return info.gitCommit || String(info.version).replace(/\./g, '');
}

module.exports = { getAppVersionInfo, getAssetVersion };
