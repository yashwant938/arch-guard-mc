#!/usr/bin/env node
/**
 * ArchGuard Standalone Developer CLI
 * Usage:
 *   node bin/cli.mjs audit [dir]
 *   node bin/cli.mjs migrate <file.sql> [postgres|mysql|sqlite]
 *   node bin/cli.mjs capacity <preset>
 */

import fs from 'node:fs/promises';
import { auditLocalDirectory } from '../src/engines/fsScanner.mjs';
import { analyzeSqlMigration } from '../src/engines/migrationGuardian.mjs';
import { estimateSystemCapacity } from '../src/engines/capacityMath.mjs';

const [, , command, arg1, arg2] = process.argv;

async function main() {
  if (command === 'audit') {
    const target = arg1 || '.';
    const report = await auditLocalDirectory(target);
    console.log(JSON.stringify(report, null, 2));
    if (report.summary.verdict === 'BLOCK_RELEASE') process.exitCode = 1;
    return;
  }

  if (command === 'migrate') {
    if (!arg1) {
      console.error('Usage: node bin/cli.mjs migrate <migration.sql> [postgres|mysql|sqlite]');
      process.exitCode = 2;
      return;
    }
    const sql = await fs.readFile(arg1, 'utf8');
    const report = analyzeSqlMigration(sql, { dialect: arg2 || 'postgres' });
    console.log(JSON.stringify(report, null, 2));
    if (report.verdict === 'BLOCK_DEPLOY') process.exitCode = 1;
    return;
  }

  if (command === 'capacity') {
    const report = estimateSystemCapacity({ preset: arg1 || 'twitter' });
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log('ArchGuard CLI — commands: audit [dir] | migrate <file.sql> [dialect] | capacity <preset>');
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
