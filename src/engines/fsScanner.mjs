import fs from 'node:fs/promises';
import path from 'node:path';
import { auditCodeFiles } from './codebaseAuditor.mjs';

const DEFAULT_IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.vite',
  '.wrangler',
  'coverage',
  '__pycache__',
  '.venv',
  'venv',
  'target',
  'vendor',
  '.idea',
  '.vscode',
]);

const CODE_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.mjs',
  '.cjs',
  '.py',
  '.java',
  '.go',
  '.cpp',
  '.cc',
  '.c',
  '.h',
  '.hpp',
]);

async function walkDirectory(rootDir, currentDir, files, limits) {
  if (files.length >= limits.maxFiles) return;

  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    if (files.length >= limits.maxFiles) break;
    if (entry.name.startsWith('.') && entry.name !== '.agents') continue;

    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      if (DEFAULT_IGNORE_DIRS.has(entry.name)) continue;
      await walkDirectory(rootDir, fullPath, files, limits);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (!CODE_EXTENSIONS.has(ext)) continue;

      const stat = await fs.stat(fullPath);
      if (stat.size > limits.maxFileBytes) continue;

      const content = await fs.readFile(fullPath, 'utf8');
      const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');
      files.push({ path: relPath, content });
    }
  }
}

/**
 * Walk a local project directory and execute the full ArchGuard audit.
 */
export async function auditLocalDirectory(directoryPath, options = {}) {
  const absRoot = path.resolve(directoryPath);
  const stat = await fs.stat(absRoot);
  if (!stat.isDirectory()) {
    throw new Error(`Path is not a directory: ${absRoot}`);
  }

  const limits = {
    maxFiles: options.maxFiles ?? 250,
    maxFileBytes: options.maxFileBytes ?? 250_000,
  };

  const files = [];
  await walkDirectory(absRoot, absRoot, files, limits);
  const report = auditCodeFiles(files, options);

  return {
    rootDirectory: absRoot,
    ...report,
  };
}
