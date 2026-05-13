/**
 * app-builder-bin downloads winCodeSign-2.6.0.7z and extracts with 7za; the
 * archive includes Darwin entries as symlinks that fail on Windows without
 * Developer Mode / elevation. Extracting with "-xr!darwin" yields a usable
 * toolset for Windows-only rcedit/signing helpers.
 * @see https://github.com/electron-userland/electron-builder/issues/8149
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.join(__dirname, '..');

const ARCHIVE_URL =
  'https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-2.6.0/winCodeSign-2.6.0.7z';

function find7za() {
  const candidates = [
    path.join(adminRoot, 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe'),
    path.join(adminRoot, '..', '..', 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(
    '7za.exe not found (install deps so 7zip-bin is available under node_modules)',
  );
}

function cacheTargetDir() {
  const local = process.env.LOCALAPPDATA;
  if (!local) return null;
  return path.join(
    local,
    'electron-builder',
    'Cache',
    'winCodeSign',
    'winCodeSign-2.6.0',
  );
}

async function downloadFile(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

async function main() {
  if (process.platform !== 'win32') return;

  const target = cacheTargetDir();
  if (!target) {
    console.warn('[ensure-win-codesign-cache] LOCALAPPDATA unset, skip');
    return;
  }

  const marker = path.join(target, 'rcedit-x64.exe');
  if (fs.existsSync(marker)) return;

  console.log('[ensure-win-codesign-cache] materializing winCodeSign-2.6.0 (darwin excluded)...');

  const seven = find7za();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gg-winCodeSign-'));
  const archive = path.join(tmp, 'winCodeSign-2.6.0.7z');
  const stage = path.join(tmp, 'stage');

  try {
    await downloadFile(ARCHIVE_URL, archive);
    fs.mkdirSync(stage, { recursive: true });
    execFileSync(seven, ['x', archive, `-o${stage}`, '-xr!darwin', '-bd'], {
      stdio: 'inherit',
    });

    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.rmSync(target, { recursive: true, force: true });
    fs.cpSync(stage, target, { recursive: true });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('[ensure-win-codesign-cache]', err);
  process.exit(1);
});
