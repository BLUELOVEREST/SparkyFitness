export function isOpenGymOwned(record: {
  source?: string | null;
  exercise_snapshot?: { source?: string | null } | null;
}): boolean {
  // A local diary entry can use an imported library exercise without becoming
  // source-owned itself. Its explicit entry source takes precedence.
  const source = record.source ?? record.exercise_snapshot?.source;
  return source?.toLowerCase() === 'opengym';
}
