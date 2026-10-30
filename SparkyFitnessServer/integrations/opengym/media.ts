import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  sparkyGymMediaFrameMetadataSchema,
  type SparkyGymMediaFrameMetadata,
} from '@workspace/shared';

const MAX_MEDIA = 104857600;
const fail = (): never => {
  throw new Error('invalid_personal_media');
};
function isoBrand(bytes: Buffer): string | null {
  let offset = 0;
  for (
    let count = 0;
    count < 32 && offset + 12 <= Math.min(bytes.length, 65536);
    count++
  ) {
    let size = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    let header = 8;
    if (size === 1) {
      if (offset + 16 > bytes.length) return null;
      const large = bytes.readBigUInt64BE(offset + 8);
      if (large > BigInt(Number.MAX_SAFE_INTEGER)) return null;
      size = Number(large);
      header = 16;
    } else if (size === 0) size = bytes.length - offset;
    if (size < header || offset + size > bytes.length) return null;
    if (type === 'ftyp' && size >= header + 8)
      return bytes.toString('ascii', offset + header, offset + header + 4);
    offset += size;
  }
  return null;
}
function mimeMatches(bytes: Buffer, mime: string): boolean {
  if (mime === 'image/png')
    return bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
  if (mime === 'image/jpeg')
    return (
      bytes.length > 3 &&
      bytes[0] === 255 &&
      bytes[1] === 216 &&
      bytes[2] === 255
    );
  if (mime === 'image/webp')
    return (
      bytes.toString('ascii', 0, 4) === 'RIFF' &&
      bytes.toString('ascii', 8, 12) === 'WEBP'
    );
  if (mime === 'image/gif')
    return ['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6));
  if (mime === 'video/webm') {
    if (!bytes.subarray(0, 4).equals(Buffer.from('1a45dfa3', 'hex')))
      return false;
    // The EBML header's DocType must be webm, not Matroska with the same magic.
    const head = bytes.subarray(4, Math.min(bytes.length, 4096));
    for (let offset = 0; offset + 7 <= head.length; offset++) {
      if (head[offset] !== 0x42 || head[offset + 1] !== 0x82) continue;
      let lengthBytes = 1;
      while (
        lengthBytes <= 4 &&
        !(head[offset + 2]! & (0x80 >> (lengthBytes - 1)))
      )
        lengthBytes++;
      if (lengthBytes > 4 || offset + 2 + lengthBytes + 4 > head.length)
        return false;
      let length = head[offset + 2]! & (0xff >> lengthBytes);
      for (let i = 1; i < lengthBytes; i++)
        length = length * 256 + head[offset + 2 + i]!;
      return (
        length === 4 &&
        head.toString(
          'ascii',
          offset + 2 + lengthBytes,
          offset + 6 + lengthBytes
        ) === 'webm'
      );
    }
    return false;
  }
  const brand = isoBrand(bytes);
  if (mime === 'video/quicktime') return brand === 'qt  ';
  if (mime === 'video/mp4')
    return (
      brand !== null &&
      [
        'isom',
        'iso2',
        'iso4',
        'iso5',
        'iso6',
        'mp41',
        'mp42',
        'avc1',
        'M4V ',
        'MSNV',
        'dash',
      ].includes(brand)
    );
  if (mime === 'image/heic' || mime === 'image/heif')
    return (
      brand !== null &&
      ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)
    );
  return false;
}

export interface DecodedMedia {
  metadata: SparkyGymMediaFrameMetadata;
  bytes: Buffer;
}
export function decodeMediaFrame(frame: Buffer): DecodedMedia {
  if (
    !Buffer.isBuffer(frame) ||
    frame.length < 5 ||
    frame.length > MAX_MEDIA + 65540
  )
    return fail();
  const size = frame.readUInt32BE(0);
  if (!size || size > 65536 || frame.length < size + 5) return fail();
  const metadata = sparkyGymMediaFrameMetadataSchema.parse(
    JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(
        frame.subarray(4, size + 4)
      )
    )
  );
  const bytes = frame.subarray(size + 4);
  if (
    bytes.length !== metadata.bytes ||
    createHash('sha256').update(bytes).digest('hex') !== metadata.sha256 ||
    !mimeMatches(bytes, metadata.mime)
  )
    return fail();
  return { metadata, bytes };
}

function syncDirectory(dir: string): void {
  const fd = fs.openSync(dir, 'r');
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

export function privateArchiveRoot(): string {
  const uploads = process.env.SPARKY_FITNESS_CUSTOM_UPLOADS_DIRECTORY
    ? path.resolve(process.env.SPARKY_FITNESS_CUSTOM_UPLOADS_DIRECTORY)
    : path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '../../uploads'
      );
  return path.join(uploads, 'sparkygym');
}

export function removeArchive(
  root: string,
  owner: string,
  digest: string,
  recordedPath: string | null
): void {
  z.uuid().parse(owner);
  if (!/^[a-f0-9]{64}$/.test(digest)) return fail();
  const directory = path.join(path.resolve(root), owner);
  const target = path.join(directory, digest);
  if (recordedPath && path.resolve(recordedPath) !== target) return fail();
  try {
    fs.unlinkSync(target);
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !('code' in error) ||
      error.code !== 'ENOENT'
    )
      throw error;
  }
  // A previous unlink may have succeeded before its directory sync failed.
  try {
    syncDirectory(directory);
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !('code' in error) ||
      error.code !== 'ENOENT'
    )
      throw error;
  }
}

export function removeOwnerArchive(root: string, owner: string): void {
  const ownerId = z.uuid().parse(owner).toLowerCase();
  const archiveRoot = path.resolve(root);
  // rm does not follow directory symlinks; include interrupted .upload files.
  fs.rmSync(path.join(archiveRoot, ownerId), { recursive: true, force: true });
  // Repeat the barrier even when a previous attempt already removed the owner
  // directory. If the root is absent, sync its nearest surviving ancestor.
  let directory = archiveRoot;
  for (;;) {
    try {
      syncDirectory(directory);
      return;
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !('code' in error) ||
        error.code !== 'ENOENT'
      )
        throw error;
      const parent = path.dirname(directory);
      if (parent === directory) throw error;
      directory = parent;
    }
  }
}

export function persistArchive(
  root: string,
  owner: string,
  media: DecodedMedia
): string {
  z.uuid().parse(owner);
  if (
    !/^[a-f0-9]{64}$/.test(media.metadata.sha256) ||
    media.bytes.length !== media.metadata.bytes ||
    createHash('sha256').update(media.bytes).digest('hex') !==
      media.metadata.sha256
  )
    return fail();
  const dir = path.join(path.resolve(root), owner);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(root, 0o700);
  fs.chmodSync(dir, 0o700);
  const target = path.join(dir, media.metadata.sha256);
  try {
    const stat = fs.lstatSync(target);
    if (
      !stat.isFile() ||
      stat.size !== media.metadata.bytes ||
      createHash('sha256').update(fs.readFileSync(target)).digest('hex') !==
        media.metadata.sha256
    )
      return fail();
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !('code' in error) ||
      error.code !== 'ENOENT'
    )
      throw error;
    const temporary = path.join(dir, `.upload-${randomUUID()}`);
    const fd = fs.openSync(temporary, 'wx', 0o600);
    try {
      try {
        fs.writeFileSync(fd, media.bytes);
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      fs.renameSync(temporary, target);
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
  }
  fs.chmodSync(target, 0o600);
  // Repeat barriers on retry even if a previous attempt already installed the file.
  syncDirectory(dir);
  syncDirectory(root);
  syncDirectory(path.dirname(path.resolve(root)));
  return target;
}
