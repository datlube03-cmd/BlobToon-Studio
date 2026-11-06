import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Resolves a local Chromium / Chrome / chrome-headless-shell executable for `@remotion/renderer`.
 * Checks environment overrides, PATH binaries, and Playwright / Remotion local browser caches.
 */
export function resolveRemotionBrowserExecutable(): string | null {
  const envCandidates = [
    process.env.REMOTION_CHROME_EXECUTABLE,
    process.env.CHROME_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
  ];
  for (const c of envCandidates) {
    if (c && fs.existsSync(c)) {
      return c;
    }
  }

  const pathBinaries = [
    'chromium',
    'chromium-browser',
    'google-chrome',
    'google-chrome-stable',
    'chrome-headless-shell',
  ];
  for (const bin of pathBinaries) {
    const whichRes = spawnSync('which', [bin], { encoding: 'utf-8' });
    if (whichRes.status === 0 && whichRes.stdout) {
      const resolved = whichRes.stdout.trim().split('\n')[0];
      if (resolved && fs.existsSync(resolved)) {
        return resolved;
      }
    }
  }

  // Search local Playwright / Remotion cache directories
  const searchRoots = [
    '/ms-playwright',
    path.join(os.homedir(), '.cache', 'ms-playwright'),
    path.resolve(process.cwd(), 'node_modules', '.remotion'),
  ];

  for (const root of searchRoots) {
    if (!fs.existsSync(root)) continue;
    try {
      const subdirs = fs.readdirSync(root, { withFileTypes: true });
      for (const d of subdirs) {
        if (!d.isDirectory()) continue;
        const candidates = [
          path.join(root, d.name, 'chrome-headless-shell-linux64', 'chrome-headless-shell'),
          path.join(root, d.name, 'chrome-linux', 'chrome'),
          path.join(root, d.name, 'chrome-linux64', 'chrome'),
        ];
        for (const cand of candidates) {
          if (fs.existsSync(cand)) {
            return cand;
          }
        }
      }
    } catch {
      // Ignore unreadable cache dirs
    }
  }

  return null;
}
