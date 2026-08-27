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
import { useMealPlanTemplates } from '../hooks/useMealPlanTemplates';
import type { RootStackScreenProps } from '../types/navigation';
import type { MealPlanTemplate } from '../types/mealPlan';

type MealPlanTemplatesScreenProps = RootStackScreenProps<'MealPlanTemplates'>;

function MealPlanTemplateCard({
  template,
  onPress,
}: {
  template: MealPlanTemplate;
  onPress: () => void;
}) {
  const { t } = useTranslation();
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
        <Icon name="food" size={16} color="#6B7280" />
        <Text className="text-sm text-text-secondary ml-2">
          {t('planTemplates.mealItemCount', {
            defaultValue: '{{count}} planned items',
            defaultValue_one: '{{count}} planned item',
            defaultValue_other: '{{count}} planned items',
            count: template.assignments.length,
          })}
        </Text>
      </View>
    </Pressable>
  );
}

const MealPlanTemplatesScreen: React.FC<MealPlanTemplatesScreenProps> = ({
  navigation,
}) => {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding();
  const accentColor = useCSSVariable('--color-accent-primary') as string;
  const { templates, isLoading, isError, refetch } = useMealPlanTemplates();
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
          title={t('planTemplates.meal.loading', {
            defaultValue: 'Loading meal plans...',
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
          title={t('planTemplates.meal.failed', {
            defaultValue: 'Failed to load meal plans',
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
            {t('planTemplates.meal.title', { defaultValue: 'Meal Plans' })}
          </Text>
          <Text className="text-sm text-text-secondary mt-1">
            {t('planTemplates.meal.subtitle', {
              defaultValue: 'Saved weekly templates for planned eating.',
            })}
          </Text>
        </View>
        <Pressable
          className="bg-accent-primary rounded-xl px-4 py-2"
          onPress={() =>
            navigation.navigate('MealPlanTemplateForm', { mode: 'create' })
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
            {t('planTemplates.meal.empty', {
              defaultValue: 'No meal plans yet',
            })}
          </Text>
          <Text className="text-sm text-text-secondary text-center mt-2">
            {t('planTemplates.meal.emptyHint', {
              defaultValue:
                'Create a carb-cycle target plan, then add foods on web while mobile food selection is being completed.',
            })}
          </Text>
        </View>
      ) : (
        templates.map(template => (
          <MealPlanTemplateCard
            key={template.id ?? template.plan_name}
            template={template}
            onPress={() =>
              navigation.navigate('MealPlanTemplateForm', {
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

export default MealPlanTemplatesScreen;
