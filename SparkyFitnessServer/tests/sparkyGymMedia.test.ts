import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  decodeMediaFrame,
  persistArchive,
  privateArchiveRoot,
  removeArchive,
} from '../integrations/opengym/media.js';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);
const metadata = {
  connection_id: randomUUID(),
  request_id: randomUUID(),
  media_id: 'photo-one',
  sha256: createHash('sha256').update(png).digest('hex'),
  bytes: png.length,
  mime: 'image/png',
};
function frame(patch = {}) {
  const json = Buffer.from(JSON.stringify({ ...metadata, ...patch }));
  const size = Buffer.alloc(4);
  size.writeUInt32BE(json.length);
  return Buffer.concat([size, json, png]);
}
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    fs.rmSync(dir, { recursive: true, force: true });
});

describe('fixed-path personal media frames', () => {
  it('repeats the deletion durability barrier after an interrupted purge', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sparkygym-media-'));
    dirs.push(dir);
    const owner = randomUUID();
    const file = persistArchive(dir, owner, decodeMediaFrame(frame()));
    const sync = vi.spyOn(fs, 'fsyncSync').mockImplementationOnce(() => {
      throw new Error('fixture_delete_sync_failure');
    });
    try {
      expect(() => removeArchive(dir, owner, metadata.sha256, file)).toThrow(
        'fixture_delete_sync_failure'
      );
      expect(fs.existsSync(file)).toBe(false);
      removeArchive(dir, owner, metadata.sha256, file);
      expect(sync).toHaveBeenCalledTimes(2);
    } finally {
      sync.mockRestore();
    }
  });
  it('deletes only the exact owner/hash archive and tolerates a repeated purge', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sparkygym-media-'));
    dirs.push(dir);
    const owner = randomUUID();
    const other = randomUUID();
    const file = persistArchive(dir, owner, decodeMediaFrame(frame()));
    const retained = persistArchive(dir, other, decodeMediaFrame(frame()));
    expect(() =>
      removeArchive(dir, owner, metadata.sha256, retained)
    ).toThrow();
    expect(fs.existsSync(file)).toBe(true);
    removeArchive(dir, owner, metadata.sha256, file);
    expect(fs.existsSync(file)).toBe(false);
    expect(fs.existsSync(retained)).toBe(true);
    expect(() =>
      removeArchive(dir, owner, metadata.sha256, file)
    ).not.toThrow();
  });
  it('removes an incomplete private temporary file when file durability fails', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sparkygym-media-'));
    dirs.push(dir);
    const owner = randomUUID();
    const spy = vi.spyOn(fs, 'fsyncSync').mockImplementation(() => {
      throw new Error('fixture_fsync_failure');
    });
    try {
      expect(() =>
        persistArchive(dir, owner, decodeMediaFrame(frame()))
      ).toThrow('fixture_fsync_failure');
    } finally {
      spy.mockRestore();
    }
    expect(fs.readdirSync(path.join(dir, owner))).toEqual([]);
  });
  it('uses the server uploads volume regardless of the launching working directory', () => {
    vi.stubEnv('SPARKY_FITNESS_CUSTOM_UPLOADS_DIRECTORY', '');
    vi.spyOn(process, 'cwd').mockReturnValue(os.tmpdir());
    try {
      expect(privateArchiveRoot()).toBe(
        path.resolve(import.meta.dirname, '../uploads/sparkygym')
      );
    } finally {
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
    }
  });
  it('validates exact length, hash, metadata and independently inspected MIME', () => {
    expect(decodeMediaFrame(frame()).metadata).toEqual(metadata);
    expect(() => decodeMediaFrame(frame({ bytes: png.length + 1 }))).toThrow();
    expect(() => decodeMediaFrame(frame({ sha256: 'a'.repeat(64) }))).toThrow();
    expect(() => decodeMediaFrame(frame({ mime: 'video/mp4' }))).toThrow();
    expect(() =>
      decodeMediaFrame(frame({ url: 'https://untrusted.example.com/photo' }))
    ).toThrow();
    expect(() => decodeMediaFrame(Buffer.alloc(3))).toThrow();
    const invalid = frame();
    invalid.writeUInt32BE(0xffffffff);
    expect(() => decodeMediaFrame(invalid)).toThrow();
  });

  it('archives by authenticated owner and hash, never by caller-controlled filenames', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sparkygym-media-'));
    dirs.push(dir);
    const owner = randomUUID();
    const decoded = decodeMediaFrame(frame());
    const archive = persistArchive(dir, owner, decoded);
    expect(fs.readFileSync(archive)).toEqual(png);
    expect(fs.statSync(archive).mode & 0o777).toBe(0o600);
    expect(fs.statSync(path.dirname(archive)).mode & 0o777).toBe(0o700);
    expect(persistArchive(dir, owner, decoded)).toBe(archive);
    expect(persistArchive(dir, randomUUID(), decoded)).not.toBe(archive);
    expect(() => persistArchive(dir, '../outside', decoded)).toThrow();
    fs.writeFileSync(archive, 'tampered');
    expect(() => persistArchive(dir, owner, decoded)).toThrow();
  });
});
