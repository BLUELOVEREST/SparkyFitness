import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, CalendarDays, ChefHat, Utensils } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import { useMealPlanTemplates } from '@/hooks/Foods/useMealplanTemplate';
import {
  buildKitchenWeek,
  getActiveKitchenTemplate,
  localDateString,
  type KitchenDayPreview,
  type KitchenMealPreview,
  type KitchenPlanTemplate,
} from '@/pages/Kitchen/kitchenPlanUtils';
import { translateWithVars } from '@/utils/i18n';

interface KitchenProps {
  todayOverride?: string;
}

const formatMacro = (value: number): string =>
  Number.isInteger(value) ? String(value) : String(Number(value.toFixed(1)));

const isDateInTemplateRange = (
  template: KitchenPlanTemplate,
  date: string
): boolean =>
  template.start_date <= date &&
  (!template.end_date || template.end_date >= date);

const getInitialSelectedDate = (
  activeTemplate: KitchenPlanTemplate | undefined,
  todayDate: string
): string => {
  if (!activeTemplate) return todayDate;

  return isDateInTemplateRange(activeTemplate, todayDate)
    ? todayDate
    : activeTemplate.start_date;
};

const KitchenMetric = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg border bg-background p-4">
    <p className="text-sm text-muted-foreground">{label}</p>
    <p className="mt-1 text-2xl font-semibold">{value}</p>
  </div>
);

const KitchenDayTab = ({
  day,
  onSelect,
}: {
  day: KitchenDayPreview;
  onSelect: (date: string) => void;
}) => {
  const { t } = useTranslation();

  return (
    <button
      type="button"
      role="tab"
      aria-selected={day.isSelected}
      aria-current={day.isToday ? 'date' : undefined}
      className={`min-w-28 rounded-xl border px-4 py-3 text-left transition-colors ${
        day.isSelected
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-card hover:bg-accent'
      } ${day.isToday && !day.isSelected ? 'ring-2 ring-primary ring-offset-2' : ''}`}
      onClick={() => onSelect(day.date)}
    >
      <span className="block text-sm font-medium">{day.weekdayLabel}</span>
      <span className="block text-lg font-semibold">{day.dayNumberLabel}</span>
      {day.isToday ? (
        <span className="mt-1 inline-flex rounded-full bg-background/80 px-2 py-0.5 text-xs text-foreground">
          {t('common.today', 'Today')}
        </span>
      ) : null}
    </button>
  );
};

const KitchenMealCard = ({ meal }: { meal: KitchenMealPreview }) => {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-xl">{meal.label}</CardTitle>
            <CardDescription>
              {translateWithVars(
                t,
                'kitchen.targetSummary',
                'Target C {{carbs}}g / P {{protein}}g / F {{fat}}g / {{calories}} kcal',
                {
                  carbs: formatMacro(meal.target.carbs),
                  protein: formatMacro(meal.target.protein),
                  fat: formatMacro(meal.target.fat),
                  calories: formatMacro(meal.target.calories),
                }
              )}
            </CardDescription>
          </div>
          <Badge variant="secondary">
            {formatMacro(meal.target.calories)} {t('common.kcal', 'kcal')}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {meal.items.length > 0 ? (
          <ul className="space-y-3">
            {meal.items.map((item) => (
              <li
                key={`${meal.key}-${item.id}`}
                className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3"
              >
                <span className="font-medium">{item.name}</span>
                <span className="text-sm text-muted-foreground">
                  {item.amountLabel}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
            {t(
              'kitchen.noPlannedFoodsForMeal',
              'No planned foods for this meal yet.'
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default function Kitchen({ todayOverride }: KitchenProps) {
  const { t } = useTranslation();
  const { activeUserId } = useActiveUser();
  const todayDate = todayOverride ?? localDateString();
  const [userSelectedDate, setUserSelectedDate] = useState<string | null>(null);
  const {
    data: templates,
    isError,
    isLoading,
    error,
  } = useMealPlanTemplates(activeUserId);

  const activeTemplate = useMemo(
    () =>
      getActiveKitchenTemplate(
        templates as KitchenPlanTemplate[] | undefined,
        todayDate
      ),
    [templates, todayDate]
  );

  const selectedDate =
    userSelectedDate ?? getInitialSelectedDate(activeTemplate, todayDate);

  const week = useMemo(() => {
    if (!activeTemplate) return undefined;
    return buildKitchenWeek(activeTemplate, selectedDate, todayDate);
  }, [activeTemplate, selectedDate, todayDate]);

  const selectedDay = week?.days.find((day) => day.isSelected) ?? week?.days[0];

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <ChefHat className="h-5 w-5" aria-hidden="true" />
            <span className="text-sm font-medium">
              {t('kitchen.mealPlanPreview', 'Meal plan preview')}
            </span>
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            {t('nav.kitchen', 'Kitchen')}
          </h1>
          <p className="mt-1 text-muted-foreground">
            {t(
              'kitchen.description',
              'Read-only cooking view for the active Meal Plan.'
            )}
          </p>
        </div>
        {activeTemplate ? (
          <Badge className="w-fit" variant="outline">
            {activeTemplate.plan_name}
          </Badge>
        ) : null}
      </header>

      {isLoading ? (
        <Card>
          <CardContent className="flex items-center gap-3 p-6 text-muted-foreground">
            <CalendarDays
              className="h-5 w-5 animate-pulse"
              aria-hidden="true"
            />
            {t('kitchen.loadingActivePlan', 'Loading your active meal plan...')}
          </CardContent>
        </Card>
      ) : null}

      {isError ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertCircle
                className="h-5 w-5 text-destructive"
                aria-hidden="true"
              />
              <CardTitle>
                {t('kitchen.unableToLoad', 'Unable to load Kitchen')}
              </CardTitle>
            </div>
            <CardDescription>
              {error instanceof Error
                ? error.message
                : t(
                    'kitchen.loadError',
                    'We could not load the active Meal Plan. Please try again.'
                  )}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {!isLoading && !isError && !activeTemplate ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {t('kitchen.noActiveMealPlan', 'No active meal plan')}
            </CardTitle>
            <CardDescription>
              {t(
                'kitchen.noActiveMealPlanDescription',
                'Kitchen uses your active Meal Plan to show what to cook and weigh for each day.'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/foods">
                {t(
                  'kitchen.createOrActivateMealPlan',
                  'Create or activate a Meal Plan'
                )}
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {week && selectedDay ? (
        <>
          <section aria-label="Kitchen week">
            <div
              role="tablist"
              aria-label={t('kitchen.selectDate', 'Select kitchen date')}
              className="flex gap-3 overflow-x-auto pb-2"
            >
              {week.days.map((day) => (
                <KitchenDayTab
                  key={day.date}
                  day={day}
                  onSelect={setUserSelectedDate}
                />
              ))}
            </div>
          </section>

          <Card>
            <CardHeader>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>{selectedDay.weekdayLabel}</CardTitle>
                  <CardDescription>{selectedDay.date}</CardDescription>
                </div>
                <Badge>{selectedDay.dayTypeLabel}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <KitchenMetric
                  label={t('nutrition.calories', 'Calories')}
                  value={`${formatMacro(selectedDay.targetCalories)} ${t('common.kcal', 'kcal')}`}
                />
                <KitchenMetric
                  label={t('nutrition.carbs', 'Carbs')}
                  value={`${formatMacro(selectedDay.targetCarbs)}g ${t('nutrition.carbs', 'carbs')}`}
                />
                <KitchenMetric
                  label={t('nutrition.protein', 'Protein')}
                  value={`${formatMacro(selectedDay.targetProtein)}g ${t('nutrition.protein', 'protein')}`}
                />
                <KitchenMetric
                  label={t('nutrition.fat', 'Fat')}
                  value={`${formatMacro(selectedDay.targetFat)}g ${t('nutrition.fat', 'fat')}`}
                />
              </div>
            </CardContent>
          </Card>

          <section
            className="grid gap-4"
            aria-label={`${selectedDay.weekdayLabel} meals`}
          >
            {selectedDay.meals.length > 0 ? (
              selectedDay.meals.map((meal) => (
                <KitchenMealCard key={meal.key} meal={meal} />
              ))
            ) : (
              <Card>
                <CardContent className="flex items-center gap-3 p-6 text-muted-foreground">
                  <Utensils className="h-5 w-5" aria-hidden="true" />
                  {t(
                    'kitchen.noMealsPlannedForDay',
                    'No meals are planned for this day.'
                  )}
                </CardContent>
              </Card>
            )}
          </section>
        </>
      ) : null}
    </main>
  );
}
