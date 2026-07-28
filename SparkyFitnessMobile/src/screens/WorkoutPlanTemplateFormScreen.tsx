import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import Button from '../components/ui/Button';
import {
  buildDefaultFocusSessions,
  getDayName,
  setPrimaryTrainingFocusSession,
  TRAINING_FOCUS_OPTIONS,
  TRAINING_FOCUS_TIME_SLOTS,
  updateTrainingFocusSession,
  validateTrainingFocusSessions,
} from '../utils/trainingFocusPlan';
import {
  useCreateWorkoutPlanTemplate,
  useUpdateWorkoutPlanTemplate,
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
  { id: 1, label: 'Monday' },
  { id: 2, label: 'Tuesday' },
  { id: 3, label: 'Wednesday' },
  { id: 4, label: 'Thursday' },
  { id: 5, label: 'Friday' },
  { id: 6, label: 'Saturday' },
  { id: 0, label: 'Sunday' },
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
    (session) => session.day_of_week === dayOfWeek && session.time_slot === timeSlot,
  );
}

function formatSessionCount(count: number) {
  return `${count} session${count === 1 ? '' : 's'}`;
}

function formatSummaryLine(
  dayLabel: string,
  sessions: WorkoutPlanFocusSession[],
) {
  const activeSessions = sessions.filter(
    (session) => session.training_focus !== 'rest',
  );
  const primary = activeSessions.find((session) => session.is_primary);
  return `${dayLabel} · ${formatSessionCount(activeSessions.length)} · Main: ${
    primary?.time_slot ?? '—'
  }`;
}

const WorkoutPlanTemplateFormScreen: React.FC<WorkoutPlanTemplateFormScreenProps> = ({
  navigation,
  route,
}) => {
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding();
  const { preferences } = usePreferences();
  const t = useMemo(
    () => createMobileTranslator(preferences?.language),
    [preferences?.language],
  );
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
  const [selectedSlot, setSelectedSlot] = useState<TrainingFocusTimeSlot>('morning');
  const [focusSessions, setFocusSessions] = useState<WorkoutPlanFocusSession[]>(
    () => buildDefaultFocusSessions(template?.focus_sessions),
  );

  const { createTemplate, isPending: isCreating } = useCreateWorkoutPlanTemplate({
    onSuccess: () => navigation.goBack(),
  });
  const { updateTemplate, isPending: isUpdating } = useUpdateWorkoutPlanTemplate({
    templateId: template?.id,
    onSuccess: () => navigation.goBack(),
  });
  const isSaving = isCreating || isUpdating;

  const selectedSession = getSession(focusSessions, selectedDay, selectedSlot);

  const updateSelectedFocus = (trainingFocus: string) => {
    setFocusSessions((current) =>
      updateTrainingFocusSession(current, selectedDay, selectedSlot, trainingFocus),
    );
  };

  const setSelectedPrimary = () => {
    if (selectedSession?.training_focus === 'rest') return;
    setFocusSessions((current) =>
      setPrimaryTrainingFocusSession(current, selectedDay, selectedSlot),
    );
  };

  const savePlan = async () => {
    const trimmedName = planName.trim();
    if (!trimmedName) {
      Toast.show({
        type: 'error',
        text1: t('workoutPlan.planNameRequired'),
      });
      return;
    }

    const validation = validateTrainingFocusSessions(focusSessions);
    if (!validation.valid) {
      Toast.show({
        type: 'error',
        text1: t('workoutPlan.mainRequired'),
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
      focus_sessions: focusSessions,
    };

    if (isEdit) {
      await updateTemplate(payload);
    } else {
      await createTemplate(payload);
    }
  };

  const activeSessionCount = focusSessions.filter(
    (session) => session.training_focus !== 'rest',
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
          {isEdit ? t('workoutPlan.editTitle') : t('workoutPlan.newTitle')}
        </Text>
        <Text className="text-sm text-text-secondary mt-1">
          {t('workoutPlan.subtitle')}
        </Text>
      </View>

      <View className="bg-surface rounded-2xl p-4 border border-border-subtle mb-4">
        <Text className="text-sm font-semibold text-text-secondary mb-2">
          {t('workoutPlan.planName')}
        </Text>
        <TextInput
          value={planName}
          onChangeText={setPlanName}
          placeholder={t('workoutPlan.planNamePlaceholder')}
          className="bg-background rounded-xl px-3 py-3 text-text-primary border border-border-subtle mb-4"
        />
        <Text className="text-sm font-semibold text-text-secondary mb-2">
          {t('workoutPlan.description')}
        </Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder={t('workoutPlan.optional')}
          className="bg-background rounded-xl px-3 py-3 text-text-primary border border-border-subtle mb-4"
        />
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Text className="text-sm font-semibold text-text-secondary mb-2">
              {t('workoutPlan.startDate')}
            </Text>
            <TextInput
              value={startDate}
              onChangeText={setStartDate}
              className="bg-background rounded-xl px-3 py-3 text-text-primary border border-border-subtle"
            />
          </View>
          <View className="flex-1">
            <Text className="text-sm font-semibold text-text-secondary mb-2">
              {t('workoutPlan.endDate')}
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
          onPress={() => setIsActive((current) => !current)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: isActive }}
        >
          <View
            className={`w-5 h-5 rounded-md mr-2 border ${
              isActive ? 'bg-accent-primary border-accent-primary' : 'border-border-subtle'
            }`}
          />
          <Text className="text-sm font-semibold text-text-primary">
            {t('workoutPlan.setActive')}
          </Text>
        </Pressable>
      </View>

      <View className="bg-surface rounded-2xl p-4 border border-border-subtle mb-4">
        <Text className="text-lg font-semibold text-text-primary mb-3">
          {t('workoutPlan.weeklySummary')}
        </Text>
        {DAYS.map((day) => {
          const sessions = focusSessions.filter(
            (session) => session.day_of_week === day.id,
          );
          return (
            <Text
              key={day.id}
              className="text-sm text-text-secondary mt-1"
            >
              {formatSummaryLine(day.label, sessions)}
            </Text>
          );
        })}
      </View>

      <View className="bg-surface rounded-2xl p-4 border border-border-subtle mb-4">
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-lg font-semibold text-text-primary">
            {t('workoutPlan.sessions')}
          </Text>
          <Text className="text-sm text-text-secondary">
            {activeSessionCount} {t('workoutPlan.active')}
          </Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mb-4"
        >
          <View className="flex-row gap-2">
            {DAYS.map((day) => (
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
                  {day.label}
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
                  {label}
                </Text>
                <Text
                  className={`text-xs mt-1 ${
                    isSelected ? 'text-white/80' : 'text-text-secondary'
                  }`}
                >
                  {session?.is_primary ? 'Main · ' : ''}
                  {session?.training_focus ?? 'rest'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text className="text-sm font-semibold text-text-secondary mb-2">
          {t('workoutPlan.focus')}
        </Text>
        <View className="flex-row flex-wrap gap-2 mb-4">
          {TRAINING_FOCUS_OPTIONS.map((option) => {
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

        <Button
          variant={selectedSession?.is_primary ? 'primary' : 'secondary'}
          disabled={selectedSession?.training_focus === 'rest'}
          onPress={setSelectedPrimary}
        >
          {selectedSession?.is_primary
            ? t('workoutPlan.mainSession')
            : t('workoutPlan.setAsMain')}
        </Button>
      </View>

      <Button disabled={isSaving} onPress={savePlan}>
        {isSaving ? t('workoutPlan.saving') : t('workoutPlan.save')}
      </Button>
    </ScrollView>
  );
};

export default WorkoutPlanTemplateFormScreen;
