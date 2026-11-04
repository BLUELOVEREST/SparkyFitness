import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function leaves(value: unknown, path = ''): [string, unknown][] {
  if (value !== null && typeof value === 'object') {
    return Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .flatMap(([key, child]) => leaves(child, path ? `${path}.${key}` : key));
  }
  return [[path, value]];
}

const catalogs = Object.fromEntries(
  ['en', 'zh-Hans'].map((language) => [
    language,
    new Map(
      leaves(
        JSON.parse(
          readFileSync(
            resolve(
              process.cwd(),
              `public/locales/${language}/translation.json`
            ),
            'utf8'
          )
        ) as unknown
      )
    ),
  ])
);
const addedPath =
  /^settings\.aiService\.(discovery\.|selection\.|profileSettings\.|(?:globalSettings|userSettings)\.maxTokens(?:Placeholder|Description)?$)/;

it('provides Chinese discovery, selection, profile and token-budget strings', () => {
  for (const [path, english] of catalogs['en']!) {
    if (!addedPath.test(path)) continue;
    const chinese = catalogs['zh-Hans']!.get(path);
    expect(typeof chinese).toBe('string');
    expect(chinese).not.toBe(english);
    expect(chinese).toMatch(/[\u3400-\u9fff]/);
  }
});

it('contains the resolved summary labels in both languages', () => {
  for (const catalog of Object.values(catalogs)) {
    for (const key of [
      'resolvedProfileSummary',
      'resolvedProfileSummaryHint',
      'noExtraBody',
    ]) {
      expect(catalog.get(`settings.aiService.selection.${key}`)).toEqual(
        expect.any(String)
      );
    }
  }
});
