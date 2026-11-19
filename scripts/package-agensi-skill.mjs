/**
 * Zero-dependency, cross-platform POSIX ZIP packager for Agensi.io skill uploads.
 * Always writes forward-slash (`/`) entry paths so Linux/macOS/Windows extract cleanly.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = path.resolve(import.meta.dirname, '..');
const SKILL_NAME = 'arch-guard-backend-verifier';
const SKILL_DIR = path.join(ROOT, 'packages', 'agensi', SKILL_NAME);
const OUT_DIR = path.join(ROOT, 'dist');
const OUT_ZIP = path.join(OUT_DIR, `${SKILL_NAME}.zip`);

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[i] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function collectFiles(dir, prefix, out) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const zipPath = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      await collectFiles(full, zipPath, out);
    } else if (entry.isFile()) {
      out.push({ zipPath, data: await fs.readFile(full) });
    }
  }
}

function buildZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const nameBuf = Buffer.from(file.zipPath, 'utf8');
    const compressed = zlib.deflateRawSync(file.data);
    const crc = crc32(file.data);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(file.data.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);

    localParts.push(localHeader, nameBuf, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(0x0314, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(file.data.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt32LE(0x81a40000, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + compressed.length;
  }

  const centralDir = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...localParts, centralDir, eocd]);
}

async function main() {
  await fs.access(path.join(SKILL_DIR, 'SKILL.md'));
  await fs.mkdir(OUT_DIR, { recursive: true });
  const files = [];
  await collectFiles(SKILL_DIR, SKILL_NAME, files);
  const zipBuf = buildZip(files);
  await fs.writeFile(OUT_ZIP, zipBuf);
  console.log(`Packaged POSIX ZIP: ${OUT_ZIP} (${zipBuf.length} bytes, ${files.length} files)`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
