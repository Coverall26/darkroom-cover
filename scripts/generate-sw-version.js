const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SW_PATH = path.join(__dirname, '../public/sw.js');
const VERSION_PATH = path.join(__dirname, '../public/sw-version.json');

const buildHash = crypto.randomBytes(8).toString('hex');
const buildTime = new Date().toISOString();
const version = `v5-${buildHash}`;

const versionData = {
  version,
  buildTime,
  hash: buildHash,
};

fs.writeFileSync(VERSION_PATH, JSON.stringify(versionData, null, 2));

let swContent = fs.readFileSync(SW_PATH, 'utf8');

swContent = swContent.replace(
  /const CACHE_VERSION = ['"][^'"]+['"];/,
  `const CACHE_VERSION = '${version}';`
);

fs.writeFileSync(SW_PATH, swContent);

console.log(`Generated SW version: ${version}`);
console.log(`Build time: ${buildTime}`);
