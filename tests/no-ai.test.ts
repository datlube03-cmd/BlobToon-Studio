import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function walkRepoFiles(dirPath: string, results: string[] = []): string[] {
  if (!fs.existsSync(dirPath)) return results;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (
      entry.name === 'node_modules' ||
      entry.name === 'dist' ||
      entry.name === 'out' ||
      entry.name === 'cache' ||
      entry.name.startsWith('.')
    ) {
      continue;
    }
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkRepoFiles(full, results);
    } else if (/\.(ts|tsx|js|mjs|json|md|html)$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

test('no-ai guard: zero AI/LLM SDKs, cloud AI references, or external network endpoints in repo', () => {
  const cwd = process.cwd();
  const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf-8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  const allDeps = {
    ...(pkg.dependencies ?? {}),
    ...(pkg.devDependencies ?? {}),
  };

  const forbiddenPackages = [
    '@anthropic-ai/sdk',
    '@google/genai',
    '@google/generative-ai',
    'openai',
  ];

  for (const forbiddenPkg of forbiddenPackages) {
    assert.equal(
      Boolean(allDeps[forbiddenPkg]),
      false,
      `Forbidden AI package "${forbiddenPkg}" must not be in package.json`
    );
  }

  assert.equal(
    fs.existsSync(path.join(cwd, 'prompts')),
    false,
    'prompts/ directory must not exist'
  );
  assert.equal(
    fs.existsSync(path.join(cwd, 'src/script/ideas.ts')),
    false,
    'src/script/ideas.ts must not exist'
  );

  const filesToScan = [
    ...walkRepoFiles(path.join(cwd, 'src')),
    ...walkRepoFiles(path.join(cwd, 'skills')),
    ...walkRepoFiles(path.join(cwd, 'docs')),
    path.join(cwd, 'server.ts'),
    path.join(cwd, 'vite.config.ts'),
    path.join(cwd, 'index.html'),
    path.join(cwd, '.env.example'),
    path.join(cwd, 'README.md'),
  ].filter((f) => fs.existsSync(f));

  const forbiddenTerms = /\b(anthropic|claude|openai|gemini|genai|aistudio)\b/i;

  for (const file of filesToScan) {
    const content = fs.readFileSync(file, 'utf-8');
    const rel = path.relative(cwd, file);
    const match = content.match(forbiddenTerms);
    assert.equal(
      match,
      null,
      `Forbidden AI/cloud reference "${match?.[0] ?? ''}" found in ${rel}`
    );
  }
});
