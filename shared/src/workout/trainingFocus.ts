export interface TrainingFocusOption {
  value: string;
  label: string;
}

export interface TrainingFocusLikeSession {
  training_focus?: string | null;
}

export interface TrainingFocusLikeTemplate {
  focus_sessions?: TrainingFocusLikeSession[] | null;
}

export const CUSTOM_TRAINING_FOCUS_VALUE = "custom";

export const BUILT_IN_TRAINING_FOCUS_OPTIONS: TrainingFocusOption[] = [
  { value: "rest", label: "Rest" },
  { value: "chest", label: "Chest" },
  { value: "back", label: "Back" },
  { value: "legs", label: "Legs" },
  { value: "shoulders", label: "Shoulders" },
  { value: "arms", label: "Arms" },
  { value: "cardio", label: "Cardio" },
  { value: "full_body", label: "Full Body" },
];

export const CUSTOM_TRAINING_FOCUS_OPTION: TrainingFocusOption = {
  value: CUSTOM_TRAINING_FOCUS_VALUE,
  label: "Custom",
};

const builtInLookup = new Map(
  BUILT_IN_TRAINING_FOCUS_OPTIONS.flatMap((option) => [
    [normalizeComparableFocus(option.value), option.value],
    [normalizeComparableFocus(option.label), option.value],
  ]),
);

function normalizeComparableFocus(value: string): string {
  return value.trim().replaceAll("_", " ").replace(/\s+/g, " ").toLowerCase();
}

export function normalizeTrainingFocusValue(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return "rest";

  const builtInValue = builtInLookup.get(normalizeComparableFocus(trimmed));
  return builtInValue ?? trimmed;
}

export function isBuiltInTrainingFocus(value: string): boolean {
  return builtInLookup.has(normalizeComparableFocus(value));
}

export function resolveTrainingFocusValue(
  selectedValue: string,
  customValue: string,
): string {
  if (selectedValue === CUSTOM_TRAINING_FOCUS_VALUE) {
    return normalizeTrainingFocusValue(customValue);
  }
  return normalizeTrainingFocusValue(selectedValue);
}

export function buildTrainingFocusOptions(
  sessions: TrainingFocusLikeSession[] = [],
): TrainingFocusOption[] {
  const customOptions: TrainingFocusOption[] = [];
  const seenCustom = new Set<string>();

  for (const session of sessions) {
    const rawFocus = session.training_focus;
    if (!rawFocus) continue;

    const normalizedFocus = normalizeTrainingFocusValue(rawFocus);
    if (
      normalizedFocus === CUSTOM_TRAINING_FOCUS_VALUE ||
      isBuiltInTrainingFocus(normalizedFocus)
    ) {
      continue;
    }

    const comparable = normalizeComparableFocus(normalizedFocus);
    if (seenCustom.has(comparable)) continue;

    seenCustom.add(comparable);
    customOptions.push({
      value: normalizedFocus,
      label: normalizedFocus,
    });
  }

  return [
    ...BUILT_IN_TRAINING_FOCUS_OPTIONS,
    ...customOptions,
    CUSTOM_TRAINING_FOCUS_OPTION,
  ];
}

export function buildTrainingFocusOptionsFromTemplates(
  templates: TrainingFocusLikeTemplate[] = [],
  currentSessions: TrainingFocusLikeSession[] = [],
): TrainingFocusOption[] {
  const historicalSessions = templates.flatMap(
    (template) => template.focus_sessions ?? [],
  );
  return buildTrainingFocusOptions([...historicalSessions, ...currentSessions]);
}
