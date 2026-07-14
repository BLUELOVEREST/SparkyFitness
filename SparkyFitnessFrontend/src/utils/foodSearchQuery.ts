const CJK_PATTERN = /[\u3400-\u9fff\uf900-\ufaff]/;

export function getFoodProviderSearchMinLength(query: string): number {
  return CJK_PATTERN.test(query.trim()) ? 1 : 3;
}

export function isFoodProviderSearchActive(
  query: string,
  debouncedQuery = query
): boolean {
  const trimmedQuery = query.trim();
  const trimmedDebouncedQuery = debouncedQuery.trim();
  const minLength = getFoodProviderSearchMinLength(trimmedQuery);
  return (
    trimmedQuery.length >= minLength &&
    trimmedDebouncedQuery.length >= minLength
  );
}
