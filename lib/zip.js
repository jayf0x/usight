import { inflateRawSync } from 'zlib';
import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';

// Minimal ZIP extractor: handles stored (method=0) and deflate (method=8).
// Reads from the central directory so sizes are always correct (even with data descriptors).
// ponytail: skips zip64, encryption, and methods other than 0/8 — not found in widget archives
export function extractZip(data, destDir) {
  const entries = readCentralDirectory(data);

  // Detect a single common top-level directory (GitHub release zips sometimes add one)
  const tops = new Set(entries.map(e => e.name.split('/')[0]).filter(Boolean));
  const strip = tops.size === 1 && entries.some(e => e.name.includes('/'));

  for (const entry of entries) {
    if (entry.name.endsWith('/')) continue; // directory entry

    let name = strip ? entry.name.split('/').slice(1).join('/') : entry.name;
    if (!name) continue;

    // Local header extra field can differ from central dir — read it to find data start
    const localFnLen = data.readUInt16LE(entry.lhOffset + 26);
    const localExtraLen = data.readUInt16LE(entry.lhOffset + 28);
    const dataStart = entry.lhOffset + 30 + localFnLen + localExtraLen;

    const compressed = data.subarray(dataStart, dataStart + entry.compressedSize);
    const content = entry.compression === 8 ? inflateRawSync(compressed) : compressed;

    const dest = join(destDir, name);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, content);
  }
}

function readCentralDirectory(data) {
  // Find End of Central Directory record by scanning backwards
  let eocd = -1;
  const limit = Math.max(0, data.length - 65558); // max EOCD search range
  for (let i = data.length - 22; i >= limit; i--) {
    if (data.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd === -1) throw new Error('Not a valid ZIP file');

  const count = data.readUInt16LE(eocd + 10);
  let pos = data.readUInt32LE(eocd + 16);

  const entries = [];
  for (let i = 0; i < count; i++) {
    if (data.readUInt32LE(pos) !== 0x02014b50) break; // central dir signature

    const compression = data.readUInt16LE(pos + 10);
    const compressedSize = data.readUInt32LE(pos + 20);
    const fnLen = data.readUInt16LE(pos + 28);
    const extraLen = data.readUInt16LE(pos + 30);
    const commentLen = data.readUInt16LE(pos + 32);
    const lhOffset = data.readUInt32LE(pos + 42);
    const name = data.subarray(pos + 46, pos + 46 + fnLen).toString('utf8');

    entries.push({ name, compression, compressedSize, lhOffset });
    pos += 46 + fnLen + extraLen + commentLen;
  }

  return entries;
}
