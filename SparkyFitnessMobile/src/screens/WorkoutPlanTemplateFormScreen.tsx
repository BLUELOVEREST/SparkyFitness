import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import Button from '../components/ui/Button';
import {
  buildDefaultFocusSessions,
  buildTrainingFocusOptionsFromTemplates,
  CUSTOM_TRAINING_FOCUS_VALUE,
  getDayName,
  resolveTrainingFocusValue,
  setPrimaryTrainingFocusSession,
  TRAINING_FOCUS_TIME_SLOTS,
  updateTrainingFocusSession,
  validateTrainingFocusSessions,
} from '../utils/trainingFocusPlan';
import {
  useCreateWorkoutPlanTemplate,
  useUpdateWorkoutPlanTemplate,
  useWorkoutPlanTemplates,
} from '../hooks/useWorkoutPlanTemplates';
import { usePreferences } from '../hooks/usePreferences';
import { createMobileTranslator } from '../utils/mobileI18n';
import type { RootStackScreenProps } from '../types/navigation';
import type {
  TrainingFocusTimeSlot,
  WorkoutPlanFocusSession,
} from '../types/workoutPlan';

type WorkoutPlanTemplateFormScreenProps =
  RootStackScreenProps<'WorkoutPlanTemplateForm'>;

const DAYS = [
  { id: 1 },
  { id: 2 },
  { id: 3 },
  { id: 4 },
  { id: 5 },
  { id: 6 },
  { id: 0 },
];

function formatDateToYYYYMMDD(date: Date) {
  return date.toISOString().slice(0, 10);
}

function defaultEndDate(startDate: string) {
  const date = new Date(`${startDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 6);
  return formatDateToYYYYMMDD(date);
}

function getSession(
  sessions: WorkoutPlanFocusSession[],
  dayOfWeek: number,
  timeSlot: TrainingFocusTimeSlot,
) {
  return sessions.find(
    session =>
      session.day_of_week === dayOfWeek && session.time_slot === timeSlot,
  );
}

function focusSessionKey(dayOfWeek: number, timeSlot: TrainingFocusTimeSlot) {
  return `${dayOfWeek}-${timeSlot}`;
}

const WorkoutPlanTemplateFormScreen: React.FC<
  WorkoutPlanTemplateFormScreenProps
> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding();
  const { preferences } = usePreferences();
  const t = useMemo(
    () => createMobileTranslator(preferences?.language),
    [preferences?.language],
  );
  const formatSummaryLine = (
    dayLabel: string,
    sessions: WorkoutPlanFocusSession[],
  ) => {
    const activeSessions = sessions.filter(
      session => session.training_focus !== 'rest',
    );
    const primary = activeSessions.find(session => session.is_primary);
    return t('workoutPlan.summaryLine', {
      defaultValue: '{{day}} · {{sessions}} · Main: {{slot}}',
      day: dayLabel,
      sessions: t('workoutPlan.sessionCount', {
        defaultValue: '{{count}} sessions',
        count: activeSessions.length,
      }),
      slot: primary?.time_slot ?? '—',
    });
  };
  const isEdit = route.params.mode === 'edit';
  const template = isEdit ? route.params.template : undefined;
  const today = useMemo(() => formatDateToYYYYMMDD(new Date()), []);
  const [planName, setPlanName] = useState(template?.plan_name ?? '');
  const [description, setDescription] = useState(template?.description ?? '');
  const [startDate, setStartDate] = useState(template?.start_date ?? today);
  const [endDate, setEndDate] = useState(
    template?.end_date ?? defaultEndDate(template?.start_date ?? today),
  );
  const [isActive, setIsActive] = useState(template?.is_active ?? true);
  const [selectedDay, setSelectedDay] = useState(1);
  const [selectedSlot, setSelectedSlot] =
    useState<TrainingFocusTimeSlot>('morning');
  const [focusSessions, setFocusSessions] = useState<WorkoutPlanFocusSession[]>(
    () => buildDefaultFocusSessions(template?.focus_sessions),
  );
  const [customFocusDrafts, setCustomFocusDrafts] = useState<
    Record<string, string>
  >({});

  const { templates: workoutPlanTemplates } = useWorkoutPlanTemplates();
  const { createTemplate, isPending: isCreating } =
    useCreateWorkoutPlanTemplate({
      onSuccess: () => navigation.goBack(),
    });
  const { updateTemplate, isPending: isUpdating } =
    useUpdateWorkoutPlanTemplate({
      templateId: template?.id,
      onSuccess: () => navigation.goBack(),
    });
  const isSaving = isCreating || isUpdating;

  const selectedSession = getSession(focusSessions, selectedDay, selectedSlot);
  const selectedSessionKey = focusSessionKey(selectedDay, selectedSlot);
  const trainingFocusOptions = useMemo(
    () =>
      buildTrainingFocusOptionsFromTemplates(
        workoutPlanTemplates,
        focusSessions,
      ),
    [workoutPlanTemplates, focusSessions],
  );

  const updateSelectedFocus = (trainingFocus: string) => {
    setFocusSessions(current =>
      updateTrainingFocusSession(
        current,
        selectedDay,
        selectedSlot,
        trainingFocus,
      ),
    );
    if (trainingFocus !== CUSTOM_TRAINING_FOCUS_VALUE) {
      setCustomFocusDrafts(current => {
        const nextDrafts = { ...current };
        delete nextDrafts[selectedSessionKey];
        return nextDrafts;
      });
    }
  };

  const setSelectedPrimary = () => {
    if (selectedSession?.training_focus === 'rest') return;
    setFocusSessions(current =>
      setPrimaryTrainingFocusSession(current, selectedDay, selectedSlot),
    );
  };

  const savePlan = async () => {
    const trimmedName = planName.trim();
    if (!trimmedName) {
      Toast.show({
        type: 'error',
        text1: t('workoutPlan.planNameRequired', {
          defaultValue: 'Enter a plan name',
        }),
      });
      return;
    }

    const resolvedFocusSessions = focusSessions.map(session => {
      const trainingFocus = resolveTrainingFocusValue(
        session.training_focus,
        customFocusDrafts[
          focusSessionKey(session.day_of_week, session.time_slot)
        ] ?? '',
      );
      return {
        ...session,
        training_focus: trainingFocus,
        is_primary: trainingFocus !== 'rest' && session.is_primary,
      };
    });

    const validation = validateTrainingFocusSessions(resolvedFocusSessions);
    if (!validation.valid) {
      Toast.show({
        type: 'error',
        text1: t('workoutPlan.mainRequired', {
          defaultValue: 'Set a main training session',
        }),
        text2: validation.message,
      });
      return;
    }

    const payload = {
      id: template?.id,
      plan_name: trimmedName,
      description: description.trim() || null,
      start_date: startDate,
      end_date: endDate || null,
      is_active: isActive,
      plan_mode: 'training_focus' as const,
      assignments: [],
      focus_sessions: resolvedFocusSessions,
    };

    if (isEdit) {
      await updateTemplate(payload);
    } else {
      await createTemplate(payload);
    }
  };

  const activeSessionCount = focusSessions.filter(
    session => session.training_focus !== 'rest',
  ).length;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: insets.bottom + activeWorkoutBarPadding + 16,
      }}
    >
      <View className="mb-5">
        <Text className="text-2xl font-bold text-text-primary">
          {isEdit
            ? t('workoutPlan.editTitle', { defaultValue: 'Edit Workout Plan' })
            : t('workoutPlan.newTitle', { defaultValue: 'New Workout Plan' })}
        </Text>
        <Text className="text-sm text-text-secondary mt-1">
          {t('workoutPlan.subtitle', {
            defaultValue:
              'Configure body-part training focus by weekday and time slot.',
          })}
        </Text>
      </View>

      <View className="bg-surface rounded-2xl p-4 border border-border-subtle mb-4">
        <Text className="text-sm font-semibold text-text-secondary mb-2">
          {t('workoutPlan.planName', { defaultValue: 'Plan Name' })}
        </Text>
        <TextInput
          value={planName}
          onChangeText={setPlanName}
          placeholder={t('workoutPlan.planNamePlaceholder', {
            defaultValue: 'Training Focus Plan',
          })}
          className="bg-background rounded-xl px-3 py-3 text-text-primary border border-border-subtle mb-4"
        />
        <Text className="text-sm font-semibold text-text-secondary mb-2">
          {t('workoutPlan.description', { defaultValue: 'Description' })}
        </Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder={t('workoutPlan.optional', { defaultValue: 'Optional' })}
          className="bg-background rounded-xl px-3 py-3 text-text-primary border border-border-subtle mb-4"
        />
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Text className="text-sm font-semibold text-text-secondary mb-2">
              {t('workoutPlan.startDate', { defaultValue: 'Start Date' })}
            </Text>
            <TextInput
              value={startDate}
              onChangeText={setStartDate}
              className="bg-background rounded-xl px-3 py-3 text-text-primary border border-border-subtle"
            />
          </View>
          <View className="flex-1">
            <Text className="text-sm font-semibold text-text-secondary mb-2">
              {t('workoutPlan.endDate', { defaultValue: 'End Date' })}
            </Text>
            <TextInput
              value={endDate}
              onChangeText={setEndDate}
              className="bg-background rounded-xl px-3 py-3 text-text-primary border border-border-subtle"
            />
          </View>
        </View>
        <Pressable
          className="flex-row items-center mt-4"
          onPress={() => setIsActive(current => !current)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: isActive }}
        >
          <View
            className={`w-5 h-5 rounded-md mr-2 border ${
              isActive
                ? 'bg-accent-primary border-accent-primary'
                : 'border-border-subtle'
            }`}
          />
          <Text className="text-sm font-semibold text-text-primary">
            {t('workoutPlan.setActive', { defaultValue: 'Set as active plan' })}
          </Text>
        </Pressable>
      </View>

      <View className="bg-surface rounded-2xl p-4 border border-border-subtle mb-4">
        <Text className="text-lg font-semibold text-text-primary mb-3">
          {t('workoutPlan.weeklySummary', { defaultValue: 'Weekly Summary' })}
        </Text>
        {DAYS.map(day => {
          const sessions = focusSessions.filter(
            session => session.day_of_week === day.id,
          );
          return (
            <Text key={day.id} className="text-sm text-text-secondary mt-1">
              {formatSummaryLine(getDayName(day.id), sessions)}
            </Text>
          );
        })}
      </View>

      <View className="bg-surface rounded-2xl p-4 border border-border-subtle mb-4">
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-lg font-semibold text-text-primary">
            {t('workoutPlan.sessions', {
              defaultValue: 'Training Focus Sessions',
            })}
          </Text>
          <Text className="text-sm text-text-secondary">
            {activeSessionCount}{' '}
            {t('workoutPlan.active', { defaultValue: 'active' })}
          </Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mb-4"
        >
          <View className="flex-row gap-2">
            {DAYS.map(day => (
              <Pressable
                key={day.id}
                className={`px-4 py-2 rounded-full ${
                  selectedDay === day.id ? 'bg-accent-primary' : 'bg-background'
                }`}
                onPress={() => setSelectedDay(day.id)}
              >
                <Text
                  className={`text-sm font-semibold ${
                    selectedDay === day.id ? 'text-white' : 'text-text-primary'
                  }`}
                >
                  {getDayName(day.id)}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        <Text className="text-base font-semibold text-text-primary mb-2">
          {getDayName(selectedDay)}
        </Text>
        <View className="flex-row flex-wrap gap-2 mb-4">
          {TRAINING_FOCUS_TIME_SLOTS.map(({ value, label }) => {
            const session = getSession(focusSessions, selectedDay, value);
            const isSelected = selectedSlot === value;
            return (
              <Pressable
                key={value}
                className={`px-3 py-2 rounded-xl border ${
                  isSelected
                    ? 'bg-accent-primary border-accent-primary'
                    : 'bg-background border-border-subtle'
                }`}
                onPress={() => setSelectedSlot(value)}
              >
                <Text
                  className={`text-sm font-semibold ${
                    isSelected ? 'text-white' : 'text-text-primary'
                  }`}
                >
                  {label()}
                </Text>
                <Text
                  className={`text-xs mt-1 ${
                    isSelected ? 'text-white/80' : 'text-text-secondary'
                  }`}
                >
                  {session?.is_primary
                    ? t('workoutPlan.mainPrefix', {
                        defaultValue: 'Main · {{focus}}',
                        focus: session.training_focus,
                      })
                    : session?.training_focus ??
                      t('workoutPlan.rest', { defaultValue: 'rest' })}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text className="text-sm font-semibold text-text-secondary mb-2">
          {t('workoutPlan.focus', { defaultValue: 'Training Focus' })}
        </Text>
        <View className="flex-row flex-wrap gap-2 mb-4">
          {trainingFocusOptions.map(option => {
            const isSelected = selectedSession?.training_focus === option.value;
            return (
              <Pressable
                key={option.value}
                className={`px-3 py-2 rounded-full ${
                  isSelected ? 'bg-accent-primary' : 'bg-background'
                }`}
                onPress={() => updateSelectedFocus(option.value)}
              >
                <Text
                  className={`text-sm font-semibold ${
                    isSelected ? 'text-white' : 'text-text-primary'
                  }`}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {selectedSession?.training_focus === CUSTOM_TRAINING_FOCUS_VALUE && (
          <TextInput
            className="bg-background border border-border-subtle rounded-xl px-4 py-3 text-text-primary mb-4"
            value={customFocusDrafts[selectedSessionKey] ?? ''}
            onChangeText={text =>
              setCustomFocusDrafts(current => ({
                ...current,
                [selectedSessionKey]: text,
              }))
            }
            placeholder={t('workoutPlan.customFocus', {
              defaultValue: 'Custom focus',
            })}
            placeholderTextColor="#8A8F98"
          />
        )}

        <Button
          variant={selectedSession?.is_primary ? 'primary' : 'secondary'}
          disabled={selectedSession?.training_focus === 'rest'}
          onPress={setSelectedPrimary}
        >
          {selectedSession?.is_primary
            ? t('workoutPlan.mainSession', { defaultValue: 'Main Session' })
            : t('workoutPlan.setAsMain', { defaultValue: 'Set as Main' })}
        </Button>
      </View>

      <Button disabled={isSaving} onPress={savePlan}>
        {isSaving
          ? t('workoutPlan.saving', { defaultValue: 'Saving...' })
          : t('workoutPlan.save', { defaultValue: 'Save Workout Plan' })}
      </Button>
    </ScrollView>
  );
};

export default WorkoutPlanTemplateFormScreen;
