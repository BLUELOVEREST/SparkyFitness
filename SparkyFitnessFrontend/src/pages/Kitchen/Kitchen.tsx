import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  CalendarDays,
  ChefHat,
  ChevronDown,
  ChevronUp,
  Utensils,
} from 'lucide-react';
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
  buildKitchenIngredientSummary,
  buildKitchenWeek,
  getActiveKitchenTemplate,
  localDateString,
  type KitchenDayPreview,
  type KitchenIngredientSummaryItem,
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
  <div className="rounded-lg border bg-background px-3 py-2">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="mt-0.5 text-base font-semibold">{value}</p>
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
      className={`relative h-20 min-w-24 overflow-hidden rounded-lg border px-3 py-2 text-left transition-colors ${
        day.isSelected
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-card hover:bg-accent'
      }`}
      onClick={() => onSelect(day.date)}
    >
      {day.isToday && !day.isSelected ? (
        <span
          aria-hidden="true"
          data-testid="kitchen-today-inner-border"
          className="pointer-events-none absolute inset-0 box-border rounded-lg border border-white/90"
        />
      ) : null}
      <span className="block text-xs font-medium">{day.weekdayLabel}</span>
      <span className="block text-xl font-semibold leading-tight">
        {day.dayNumberLabel}
      </span>
      {day.isToday ? (
        <span className="mt-1 inline-flex rounded-full bg-background/80 px-2 py-0.5 text-[11px] text-foreground">
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
      <CardHeader className="space-y-2 p-4 pb-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{meal.label}</CardTitle>
            <CardDescription className="mt-1 text-xs">
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
      <CardContent className="p-4 pt-2">
        {meal.items.length > 0 ? (
          <ul className="space-y-2">
            {meal.items.map((item) => (
              <li
                key={`${meal.key}-${item.id}`}
                className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2"
              >
                <span className="text-sm font-medium">{item.name}</span>
                <span className="text-sm text-muted-foreground">
                  {item.amountLabel}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
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

const KitchenIngredientSummaryList = ({
  items,
  maxItems,
}: {
  items: KitchenIngredientSummaryItem[];
  maxItems?: number;
}) => {
  const visibleItems = maxItems ? items.slice(0, maxItems) : items;

  if (visibleItems.length === 0) return null;

  return (
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {visibleItems.map((item) => (
        <li
          key={item.key}
          className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2"
        >
          <span className="min-w-0 truncate text-sm font-medium">
            {item.name}
          </span>
          <span className="shrink-0 text-sm font-semibold tabular-nums">
            {item.amountLabel}
          </span>
        </li>
      ))}
    </ul>
  );
};

const WeeklyPrepCommandBar = ({
  items,
}: {
  items: KitchenIngredientSummaryItem[];
}) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);

  if (items.length === 0) return null;

  const ingredientCountLabel =
    items.length === 1
      ? t('kitchen.ingredientCountSingular', '1 ingredient')
      : translateWithVars(
          t,
          'kitchen.ingredientCountPlural',
          '{{count}} ingredients',
          { count: items.length }
        );
  const previewItems = items.slice(0, 4);

  return (
    <section
      className="rounded-lg border bg-card px-4 py-3"
      aria-label={t('kitchen.weeklyPrep', 'Weekly Prep')}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">
            {t('kitchen.weeklyPrep', 'Weekly Prep')}
          </span>
          <Badge variant="secondary">{ingredientCountLabel}</Badge>
          <span className="text-sm text-muted-foreground">
            {previewItems
              .map((item) => `${item.name} ${item.amountLabel}`)
              .join(' · ')}
          </span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          aria-expanded={isExpanded}
          aria-controls="kitchen-weekly-prep-details"
          onClick={() => setIsExpanded((current) => !current)}
        >
          {isExpanded ? (
            <ChevronUp className="mr-2 h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronDown className="mr-2 h-4 w-4" aria-hidden="true" />
          )}
          {isExpanded
            ? t('kitchen.hideWeeklyIngredientTotals', 'Hide weekly totals')
            : t(
                'kitchen.viewWeeklyIngredientTotals',
                'View weekly ingredient totals'
              )}
        </Button>
      </div>
      {isExpanded ? (
        <div id="kitchen-weekly-prep-details" className="mt-3">
          <KitchenIngredientSummaryList items={items} />
        </div>
      ) : null}
    </section>
  );
};

const KitchenDailySummary = ({
  title,
  day,
  items,
}: {
  title: string;
  day: KitchenDayPreview;
  items: KitchenIngredientSummaryItem[];
}) => {
  const { t } = useTranslation();

  return (
    <Card data-testid="kitchen-daily-summary">
      <CardHeader className="p-4 pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-lg">{title}</CardTitle>
            <CardDescription>
              <span>{day.weekdayLabel}</span>
              <span aria-hidden="true"> · </span>
              <span>{day.date}</span>
            </CardDescription>
          </div>
          <Badge>{day.dayTypeLabel}</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 p-4 pt-0 lg:grid-cols-[1fr_1.15fr]">
        <div className="grid gap-2 sm:grid-cols-2">
          <KitchenMetric
            label={t('nutrition.calories', 'Calories')}
            value={`${formatMacro(day.targetCalories)} ${t('common.kcal', 'kcal')}`}
          />
          <KitchenMetric
            label={t('nutrition.carbs', 'Carbs')}
            value={`${formatMacro(day.targetCarbs)}g ${t('nutrition.carbs', 'carbs')}`}
          />
          <KitchenMetric
            label={t('nutrition.protein', 'Protein')}
            value={`${formatMacro(day.targetProtein)}g ${t('nutrition.protein', 'protein')}`}
          />
          <KitchenMetric
            label={t('nutrition.fat', 'Fat')}
            value={`${formatMacro(day.targetFat)}g ${t('nutrition.fat', 'fat')}`}
          />
        </div>
        {items.length > 0 ? (
          <KitchenIngredientSummaryList items={items} />
        ) : null}
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
  const dailyIngredientSummary = useMemo(
    () => (selectedDay ? buildKitchenIngredientSummary([selectedDay]) : []),
    [selectedDay]
  );
  const weeklyIngredientSummary = useMemo(
    () => (week ? buildKitchenIngredientSummary(week.days) : []),
    [week]
  );

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
          <WeeklyPrepCommandBar items={weeklyIngredientSummary} />

          <section aria-label="Kitchen week">
            <div
              role="tablist"
              aria-label={t('kitchen.selectDate', 'Select kitchen date')}
              data-testid="kitchen-date-tabs"
              className="flex gap-2 overflow-x-auto pb-2"
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

          <KitchenDailySummary
            title={t('kitchen.dailySummary', 'Daily Summary')}
            day={selectedDay}
            items={dailyIngredientSummary}
          />

          <section
            className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"
            aria-label={`${selectedDay.weekdayLabel} meals`}
            data-testid="kitchen-meal-grid"
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
