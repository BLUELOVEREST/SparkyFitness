import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import { useTranslation } from 'react-i18next';
import Icon from '../components/Icon';
import StatusView from '../components/StatusView';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useWorkoutPlanTemplates } from '../hooks/useWorkoutPlanTemplates';
import type { RootStackScreenProps } from '../types/navigation';
import type { WorkoutPlanTemplate } from '../types/workoutPlan';

type WorkoutPlanTemplatesScreenProps =
  RootStackScreenProps<'WorkoutPlanTemplates'>;

function WorkoutPlanTemplateCard({
  template,
  onPress,
}: {
  template: WorkoutPlanTemplate;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const trainingSessionCount = (template.focus_sessions ?? []).filter(
    session => session.training_focus !== 'rest',
  ).length;
  return (
    <Pressable
      className="bg-surface rounded-2xl px-4 py-4 mb-3 shadow-sm border border-border-subtle"
      style={({ pressed }) => (pressed ? { opacity: 0.75 } : null)}
      accessibilityRole="button"
      onPress={onPress}
    >
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-3">
          <Text className="text-lg font-semibold text-text-primary">
            {template.plan_name}
          </Text>
          {template.description ? (
            <Text className="text-sm text-text-secondary mt-1">
              {template.description}
            </Text>
          ) : null}
        </View>
        <View
          className={`px-3 py-1 rounded-full ${
            template.is_active ? 'bg-accent-primary/10' : 'bg-surface-muted'
          }`}
        >
          <Text
            className={`text-xs font-semibold ${
              template.is_active ? 'text-accent-primary' : 'text-text-secondary'
            }`}
          >
            {template.is_active
              ? t('planTemplates.active', { defaultValue: 'Active' })
              : t('planTemplates.inactive', { defaultValue: 'Inactive' })}
          </Text>
        </View>
      </View>

      <View className="flex-row items-center mt-4">
        <Icon name="calendar" size={16} color="#6B7280" />
        <Text className="text-sm text-text-secondary ml-2">
          {template.end_date
            ? t('planTemplates.dateRange', {
                defaultValue: 'Starts {{start}} · Ends {{end}}',
                start: template.start_date,
                end: template.end_date,
              })
            : t('planTemplates.starts', {
                defaultValue: 'Starts {{date}}',
                date: template.start_date,
              })}
        </Text>
      </View>
      <View className="flex-row items-center mt-2">
        <Icon name="exercise-weights" size={16} color="#6B7280" />
        <Text className="text-sm text-text-secondary ml-2">
          {t('planTemplates.trainingSessionCount', {
            defaultValue: '{{count}} training sessions',
            defaultValue_one: '{{count}} training session',
            defaultValue_other: '{{count}} training sessions',
            count: trainingSessionCount,
          })}
        </Text>
      </View>
    </Pressable>
  );
}

const WorkoutPlanTemplatesScreen: React.FC<WorkoutPlanTemplatesScreenProps> = ({
  navigation,
}) => {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding();
  const accentColor = useCSSVariable('--color-accent-primary') as string;
  const { templates, isLoading, isError, refetch } = useWorkoutPlanTemplates();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  }, [refetch]);

  if (isLoading) {
    return (
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
        <StatusView
          loading
          title={t('planTemplates.workout.loading', {
            defaultValue: 'Loading workout plans...',
          })}
        />
      </View>
    );
  }

  if (isError) {
    return (
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
        <StatusView
          icon="alert-circle"
          title={t('planTemplates.workout.failed', {
            defaultValue: 'Failed to load workout plans',
          })}
          subtitle={t('planTemplates.connectionHint', {
            defaultValue: 'Pull to refresh or check your server connection.',
          })}
        />
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: insets.bottom + activeWorkoutBarPadding + 16,
      }}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={onRefresh}
          tintColor={accentColor}
        />
      }
    >
      <View className="mb-5 flex-row items-start justify-between">
        <View className="flex-1 pr-3">
          <Text className="text-2xl font-bold text-text-primary">
            {t('planTemplates.workout.title', {
              defaultValue: 'Workout Plans',
            })}
          </Text>
          <Text className="text-sm text-text-secondary mt-1">
            {t('planTemplates.workout.subtitle', {
              defaultValue:
                'Weekly body-part focus plans for carb-cycle meal planning.',
            })}
          </Text>
        </View>
        <Pressable
          className="bg-accent-primary rounded-xl px-4 py-2"
          onPress={() =>
            navigation.navigate('WorkoutPlanTemplateForm', { mode: 'create' })
          }
        >
          <Text className="text-white font-semibold">
            {t('planTemplates.new', { defaultValue: 'New' })}
          </Text>
        </Pressable>
      </View>

      {templates.length === 0 ? (
        <View className="bg-surface rounded-2xl px-5 py-8 border border-border-subtle">
          <Text className="text-lg font-semibold text-text-primary text-center">
            {t('planTemplates.workout.empty', {
              defaultValue: 'No workout plans yet',
            })}
          </Text>
          <Text className="text-sm text-text-secondary text-center mt-2">
            {t('planTemplates.workout.emptyHint', {
              defaultValue:
                'Create a Training Focus Plan to tell carb-cycle meal plans which days and slots are training days.',
            })}
          </Text>
        </View>
      ) : (
        templates.map(template => (
          <WorkoutPlanTemplateCard
            key={template.id ?? template.plan_name}
            template={template}
            onPress={() =>
              navigation.navigate('WorkoutPlanTemplateForm', {
                mode: 'edit',
                template,
              })
            }
          />
        ))
      )}

      {isRefreshing ? (
        <View className="items-center py-4">
          <ActivityIndicator size="small" color={accentColor} />
        </View>
      ) : null}
    </ScrollView>
  );
};

export default WorkoutPlanTemplatesScreen;
