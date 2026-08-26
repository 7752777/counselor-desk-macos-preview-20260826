'use strict';

const fs = require('node:fs');
const { chromium } = require('playwright-core');

const CANDIDATES = [
  process.env.CHROME_BIN,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];

function browserExecutable() {
  return CANDIDATES.filter(Boolean).find(file => fs.existsSync(file));
}

function requireBrowserExecutable(label) {
  const executablePath = browserExecutable();
  if (!executablePath) throw new Error(`${label || 'BROWSER'}_BROWSER_NOT_FOUND`);
  return executablePath;
}

module.exports = { chromium, browserExecutable, requireBrowserExecutable };
