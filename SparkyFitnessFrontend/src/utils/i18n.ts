import type { TFunction } from 'i18next';

export function translateWithVars(
  t: TFunction,
  key: string,
  fallback: string,
  values: Record<string, string | number | boolean | null | undefined>
): string {
  const translated = t(key, fallback, values);
  if (
    typeof translated === 'string' &&
    !/\{\{\s*[A-Za-z0-9_]+\s*\}\}/.test(translated)
  ) {
    return translated;
  }

  return fallback.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_match, key) =>
    String(values[key] ?? '')
  );
}
