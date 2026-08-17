import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, '../db/migrations');

function migrationSql(namePart: string) {
  const migrationFile = fs
    .readdirSync(migrationsDir)
    .find((file) => file.includes(namePart));

  expect(migrationFile).toBeDefined();

  return fs.readFileSync(path.join(migrationsDir, migrationFile ?? ''), 'utf8');
}

describe('Grocy global provider migration', () => {
  it('seeds Grocy as an inactive global provider shell', () => {
    const sql = migrationSql('ensure_grocy_global_provider');

    expect(sql).toContain("'Grocy'");
    expect(sql).toContain("'grocy'");
    expect(sql).toMatch(/is_active,\s*is_public/s);
    expect(sql).toMatch(/FALSE,\s*TRUE/s);
    expect(sql).not.toMatch(/192\.168\./);
    expect(sql).not.toMatch(
      /encrypted_app_key\s*,\s*app_key_iv\s*,\s*app_key_tag/s
    );
  });
});
