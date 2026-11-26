import zlib from "zlib";

export interface ZipInputEntry {
  name: string;
  data: Buffer | string;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

/** Computes standard IEEE 802.3 CRC-32 checksum. */
export function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Pure Node.js deterministic ZIP builder using built-in `zlib.deflateRawSync`.
 */
export function createZipBuffer(entries: readonly ZipInputEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  // Deterministic DOS timestamp: 2026-01-01 00:00:00
  const dosTime = 0;
  const dosDate = 0x5c21;

  for (const entry of entries) {
    const cleanName = entry.name.replace(/\\/g, "/").replace(/^\/+/, "");
    const nameBuf = Buffer.from(cleanName, "utf-8");
    const rawBuf = Buffer.isBuffer(entry.data)
      ? entry.data
      : Buffer.from(entry.data, "utf-8");
    const checksum = crc32(rawBuf);
    const compressedBuf = zlib.deflateRawSync(rawBuf);

    // Local File Header (30 bytes + filename)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4); // version needed: 2.0
    localHeader.writeUInt16LE(0x0800, 6); // UTF-8 filename flag
    localHeader.writeUInt16LE(8, 8); // compression method: DEFLATE
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(compressedBuf.length, 18);
    localHeader.writeUInt32LE(rawBuf.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra field length

    localParts.push(localHeader, nameBuf, compressedBuf);

    // Central Directory File Header (46 bytes + filename)
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0x0800, 8); // UTF-8 flag
    centralHeader.writeUInt16LE(8, 10); // DEFLATE
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(compressedBuf.length, 20);
    centralHeader.writeUInt32LE(rawBuf.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30); // extra len
    centralHeader.writeUInt16LE(0, 32); // comment len
    centralHeader.writeUInt16LE(0, 34); // disk number start
    centralHeader.writeUInt16LE(0, 36); // internal attrs
    centralHeader.writeUInt32LE(0, 38); // external attrs
    centralHeader.writeUInt32LE(offset, 42); // relative offset of local header

    centralParts.push(centralHeader, nameBuf);

    offset += localHeader.length + nameBuf.length + compressedBuf.length;
  }

  const centralDir = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDir, eocd]);
}

/**
 * Unpacks a ZIP buffer into a filename -> Buffer map (validating CRC-32 checksums).
 */
export function readZipEntries(zipBuffer: Buffer): Map<string, Buffer> {
  // Locate End of Central Directory (0x06054b50)
  let eocdOffset = -1;
  for (let i = zipBuffer.length - 22; i >= Math.max(0, zipBuffer.length - 65557); i--) {
    if (zipBuffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error("Invalid ZIP archive: EOCD signature not found");
  }

  const totalEntries = zipBuffer.readUInt16LE(eocdOffset + 10);
  const centralDirOffset = zipBuffer.readUInt32LE(eocdOffset + 16);

  const result = new Map<string, Buffer>();
  let cursor = centralDirOffset;

  for (let idx = 0; idx < totalEntries; idx++) {
    if (zipBuffer.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error("Invalid ZIP central directory header");
    }

    const method = zipBuffer.readUInt16LE(cursor + 10);
    const expectedCrc = zipBuffer.readUInt32LE(cursor + 16);
    const compressedSize = zipBuffer.readUInt32LE(cursor + 20);
    const nameLen = zipBuffer.readUInt16LE(cursor + 28);
    const extraLen = zipBuffer.readUInt16LE(cursor + 30);
    const commentLen = zipBuffer.readUInt16LE(cursor + 32);
    const localOffset = zipBuffer.readUInt32LE(cursor + 42);

    const fileName = zipBuffer
      .subarray(cursor + 46, cursor + 46 + nameLen)
      .toString("utf-8");

    cursor += 46 + nameLen + extraLen + commentLen;

    if (zipBuffer.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error(`Invalid local header for entry: ${fileName}`);
    }
    const localNameLen = zipBuffer.readUInt16LE(localOffset + 26);
    const localExtraLen = zipBuffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const compressed = zipBuffer.subarray(dataStart, dataStart + compressedSize);

    const inflated =
      method === 0
        ? Buffer.from(compressed)
        : method === 8
        ? zlib.inflateRawSync(compressed)
        : (() => {
            throw new Error(`Unsupported ZIP compression method: ${method}`);
          })();

    if (crc32(inflated) !== expectedCrc) {
      throw new Error(`CRC-32 mismatch for entry: ${fileName}`);
    }

    result.set(fileName, inflated);
  }

  return result;
}
