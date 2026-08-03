import type React from 'react';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { formatDateToYYYYMMDD } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { usePreferences } from '@/contexts/PreferencesContext';
import { debug, error } from '@/utils/logging';
import { toast } from '@/hooks/use-toast';
import type {
  MealPlanTemplate,
  Meal,
  MealPlanTemplateAssignment,
} from '@/types/meal';
import type {
  CarbCycleDayTarget,
  CarbCycleDayType,
  CarbCycleMealTarget,
  CarbCycleWeekResult,
} from '@/types/goals';
import type { Food, FoodVariant } from '@/types/food';
import FoodUnitSelector from '@/components/FoodUnitSelector';
import MealUnitSelector from './MealUnitSelector';
import { Edit, Search, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { mealViewOptions } from '@/hooks/Foods/useMeals';
import { foodViewOptions } from '@/hooks/Foods/useFoods';
import FoodSearchDialog from '@/components/FoodSearch/FoodSearchDialog';
import { useMealTypes } from '@/hooks/Diary/useMealTypes';
import { useMostRecentMeasurement } from '@/hooks/CheckIn/useCheckIn';
import { usePreviewCarbCycleMutation } from '@/hooks/Goals/useGoals';
import { useWorkoutPlanTemplates } from '@/hooks/Exercises/useWorkoutPlans';
import { buildCarbCycleMealPlanDraft } from '@/utils/carbCycleMealPlan';
import type { FoodMacroRole } from '@/utils/carbCycleFoodRoles';
import { orderItemsByFirstDay } from '@/utils/trainingFocusPlan';
import { translateWithVars } from '@/utils/i18n';
import type { CarbCycleTrainingSlots } from '@/types/goals';
import type { WorkoutPlanFocusSession } from '@/types/workout';

// Extended assignment type with nutrition data for display
interface ExtendedAssignment extends MealPlanTemplateAssignment {
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  serving_size?: number;
  serving_unit?: string;
  total_servings?: number;
}

interface MealPlanTemplateFormProps {
  template?: MealPlanTemplate;
  mealMacroTargetsByDay?: Record<number, CarbCycleMealTarget[]>;
  onSave: (template: Partial<MealPlanTemplate>) => void;
  onClose: () => void;
}

type MealPlanMode = 'average' | 'carbCycle';
const MACRO_ROLE_ORDER: FoodMacroRole[] = ['carb', 'protein', 'fat'];
const MACRO_ROLE_TARGET_KEY: Record<
  FoodMacroRole,
  'carbs' | 'protein' | 'fat'
> = {
  carb: 'carbs',
  protein: 'protein',
  fat: 'fat',
};

function getDayOfWeekFromDate(date: string): number {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

function getWeekStartDate(date: string, firstDayOfWeek: number): string {
  const parsedDate = new Date(`${date}T00:00:00.000Z`);
  const dayOfWeek = parsedDate.getUTCDay();
  const daysSinceWeekStart = (dayOfWeek - firstDayOfWeek + 7) % 7;
  parsedDate.setUTCDate(parsedDate.getUTCDate() - daysSinceWeekStart);
  return parsedDate.toISOString().slice(0, 10);
}

const DEFAULT_TRAINING_SLOTS: CarbCycleTrainingSlots = [
  'rest',
  'rest',
  'rest',
  'rest',
  'rest',
  'rest',
  'rest',
];

const MealPlanTemplateForm: React.FC<MealPlanTemplateFormProps> = ({
  template,
  mealMacroTargetsByDay = {},
  onSave,
  onClose,
}) => {
  const { t } = useTranslation();
  const macroRoleLabels: Record<FoodMacroRole, string> = {
    carb: t('nutrition.carbs', 'Carbs'),
    protein: t('nutrition.protein', 'Protein'),
    fat: t('nutrition.fat', 'Fat'),
  };
  const formatCarbCycleDayType = (dayType: CarbCycleDayType): string => {
    switch (dayType) {
      case 'high':
        return t('cycle.highCarb', 'High Carb');
      case 'medium':
        return t('cycle.mediumCarb', 'Medium Carb');
      case 'low':
        return t('cycle.lowCarb', 'Low Carb');
      default:
        return dayType;
    }
  };
  const { loggingLevel, firstDayOfWeek } = usePreferences(); // Get loggingLevel from preferences
  const initialMacroTargets =
    Object.keys(mealMacroTargetsByDay).length > 0
      ? mealMacroTargetsByDay
      : (template?.macro_targets ?? {});
  const [planMode, setPlanMode] = useState<MealPlanMode>(
    Object.keys(initialMacroTargets).length > 0 ? 'carbCycle' : 'average'
  );
  const [generatedMealMacroTargetsByDay, setGeneratedMealMacroTargetsByDay] =
    useState<Record<number, CarbCycleMealTarget[]>>(initialMacroTargets);
  const [generatedCarbCyclePreview, setGeneratedCarbCyclePreview] =
    useState<CarbCycleWeekResult | null>(null);
  const [carbCycleForm, setCarbCycleForm] = useState({
    carbsPerKg: '3',
    proteinPerKg: '2',
    fatPerKg: '1',
  });
  const [planName, setPlanName] = useState(template?.plan_name || '');
  const [description, setDescription] = useState(template?.description || '');
  const [startDate, setStartDate] = useState(
    template?.start_date
      ? String(template.start_date).split('T')[0]
      : formatDateToYYYYMMDD(new Date())
  );
  const [endDate, setEndDate] = useState(() => {
    if (template?.end_date) return String(template.end_date).split('T')[0];
    const date = new Date();
    date.setDate(date.getDate() + 7);
    return formatDateToYYYYMMDD(date);
  });
  const [isActive, setIsActive] = useState(template?.is_active || false);
  const [assignments, setAssignments] = useState<MealPlanTemplateAssignment[]>(
    template?.assignments || []
  );
  const [extendedAssignments, setExtendedAssignments] = useState<
    ExtendedAssignment[]
  >([]);
  const [isFoodSelectionOpen, setIsFoodSelectionOpen] = useState(false);
  const [isFoodUnitSelectorOpen, setIsFoodUnitSelectorOpen] = useState(false);
  const [isMealUnitSelectorOpen, setIsMealUnitSelectorOpen] = useState(false);
  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  const [selectedMeal, setSelectedMeal] = useState<Meal | null>(null);
  const [currentDay, setCurrentDay] = useState<number | null>(null);
  const [currentMealType, setCurrentMealType] = useState<string | null>(null);
  const [currentMacroRole, setCurrentMacroRole] =
    useState<FoodMacroRole | null>(null);
  const [recommendedQuantity, setRecommendedQuantity] = useState<
    number | undefined
  >(undefined);
  const [editingAssignmentIndex, setEditingAssignmentIndex] = useState<
    number | null
  >(null);

  const queryClient = useQueryClient();
  const { data: availableMealTypes = [] } = useMealTypes();
  const { data: workoutPlans = [] } = useWorkoutPlanTemplates('current-user');
  const { data: weightData, isLoading: isWeightLoading } =
    useMostRecentMeasurement('weight');
  const previewCarbCycleMutation = usePreviewCarbCycleMutation();
  const selectedWeekStartDate = useMemo(
    () => (startDate ? getWeekStartDate(startDate, firstDayOfWeek) : ''),
    [firstDayOfWeek, startDate]
  );
  const activeTrainingFocusPlan = useMemo(() => {
    if (!startDate) return null;
    return (
      workoutPlans.find((plan) => {
        if (plan.plan_mode !== 'training_focus' || !plan.is_active) {
          return false;
        }
        const planStart = plan.start_date
          ? (String(plan.start_date).split('T')[0] ?? '')
          : '';
        const planEnd = plan.end_date
          ? String(plan.end_date).split('T')[0]
          : '';
        return planStart <= startDate && (!planEnd || startDate <= planEnd);
      }) ?? null
    );
  }, [startDate, workoutPlans]);
  const trainingSessionsByDay = useMemo(() => {
    if (!activeTrainingFocusPlan?.focus_sessions || !selectedWeekStartDate) {
      return null;
    }
    const start = new Date(`${selectedWeekStartDate}T00:00:00`);
    return Array.from({ length: 7 }, (_, dayIndex) => {
      const date = new Date(start);
      date.setUTCDate(start.getUTCDate() + dayIndex);
      const dayOfWeek = date.getUTCDay();
      return activeTrainingFocusPlan.focus_sessions!.filter(
        (session: WorkoutPlanFocusSession) => session.day_of_week === dayOfWeek
      );
    });
  }, [activeTrainingFocusPlan, selectedWeekStartDate]);
  const resolvedMealMacroTargetsByDay =
    planMode === 'carbCycle' ? generatedMealMacroTargetsByDay : {};
  // Helper function to fetch nutrition data for an assignment
  const fetchNutritionForAssignment = useCallback(
    async (
      assignment: MealPlanTemplateAssignment
    ): Promise<ExtendedAssignment> => {
      try {
        if (assignment.item_type === 'meal' && assignment.meal_id) {
          const meal = await queryClient.fetchQuery(
            mealViewOptions(assignment.meal_id)
          );
          if (meal && meal.foods) {
            // Calculate total nutrition from meal's component foods
            let totalCalories = 0;
            let totalProtein = 0;
            let totalCarbs = 0;
            let totalFat = 0;

            meal.foods.forEach((mf) => {
              const scale = mf.quantity / (mf.serving_size || 1);
              totalCalories += (mf.calories || 0) * scale;
              totalProtein += (mf.protein || 0) * scale;
              totalCarbs += (mf.carbs || 0) * scale;
              totalFat += (mf.fat || 0) * scale;
            });

            return {
              ...assignment,
              calories: totalCalories,
              protein: totalProtein,
              carbs: totalCarbs,
              fat: totalFat,
              serving_size: meal.serving_size || 1,
              serving_unit: meal.serving_unit || 'serving',
              total_servings: meal.total_servings || 1,
            };
          }
        } else if (assignment.item_type === 'food' && assignment.food_id) {
          const food = await queryClient.fetchQuery(
            foodViewOptions(assignment.food_id)
          );

          if (food && food.default_variant) {
            const variant = food.default_variant;
            return {
              ...assignment,
              calories: variant.calories,
              protein: variant.protein,
              carbs: variant.carbs,
              fat: variant.fat,
              serving_size: variant.serving_size,
              serving_unit: variant.serving_unit,
            };
          }
        }
      } catch (err) {
        error(loggingLevel, `Failed to fetch nutrition for assignment:`, err);
      }
      return { ...assignment }; // Return without nutrition if fetch fails
    },
    [loggingLevel, queryClient]
  );

  // Fetch nutrition data for existing assignments when template loads
  useEffect(() => {
    const loadNutritionForAssignments = async () => {
      if (template?.assignments && template.assignments.length > 0) {
        const extendedPromises = template.assignments.map((assignment) =>
          fetchNutritionForAssignment(assignment)
        );
        const extendedResults = await Promise.all(extendedPromises);
        setExtendedAssignments(extendedResults);
      }
    };

    loadNutritionForAssignments();
  }, [
    template?.id,
    setExtendedAssignments,
    fetchNutritionForAssignment,
    template?.assignments,
  ]); // Only run when template ID changes

  const handleAddFood = (
    day: number,
    mealType: string,
    macroRole?: FoodMacroRole
  ) => {
    setCurrentDay(day);
    setCurrentMealType(mealType);
    setCurrentMacroRole(macroRole ?? null);
    setRecommendedQuantity(undefined);
    setIsFoodSelectionOpen(true);
  };

  const calculateRecommendedQuantity = (
    food: Food,
    macroRole: FoodMacroRole
  ) => {
    if (currentDay === null || currentMealType === null) return undefined;
    const mealTarget =
      resolvedMealMacroTargetsByDay[currentDay]?.find(
        (target) => target.label.toLowerCase() === currentMealType.toLowerCase()
      ) ?? null;
    const variant = food.default_variant;
    if (!mealTarget || !variant) return undefined;
    const macroKey = MACRO_ROLE_TARGET_KEY[macroRole];
    const macroPerServing = Number(variant[macroKey] || 0);
    const servingSize = Number(variant.serving_size || 0);
    if (macroPerServing <= 0 || servingSize <= 0) return undefined;
    const currentTotals = calculateAssignmentsNutrition(
      extendedAssignments.filter(
        (assignment) =>
          assignment.day_of_week === currentDay &&
          assignment.meal_type.toLowerCase() ===
            currentMealType.toLowerCase() &&
          assignment.macro_role !== macroRole
      )
    );
    const actualByRole = {
      carb: currentTotals.totalCarbs,
      protein: currentTotals.totalProtein,
      fat: currentTotals.totalFat,
    };
    const targetByRole = {
      carb: mealTarget.carbs,
      protein: mealTarget.protein,
      fat: mealTarget.fat,
    };
    const remaining = Math.max(
      0,
      targetByRole[macroRole] - actualByRole[macroRole]
    );
    return Math.round((remaining / macroPerServing) * servingSize);
  };

  const handleMealUnitSelected = async (
    meal: Meal,
    quantity: number,
    unit: string
  ) => {
    if (currentDay === null || currentMealType === null) return;

    if (editingAssignmentIndex !== null) {
      const assignmentAtIndex = assignments[editingAssignmentIndex];
      if (assignmentAtIndex) {
        // Update existing assignment
        const updatedAssignment: MealPlanTemplateAssignment = {
          ...assignmentAtIndex,
          quantity,
          unit,
        };
        const updatedAssignments = [...assignments];
        updatedAssignments[editingAssignmentIndex] = updatedAssignment;
        setAssignments(updatedAssignments);

        // Update extended assignments
        const extendedAssignment =
          await fetchNutritionForAssignment(updatedAssignment);
        const updatedExtended = [...extendedAssignments];
        updatedExtended[editingAssignmentIndex] = extendedAssignment;
        setExtendedAssignments(updatedExtended);

        setEditingAssignmentIndex(null);
      }
    } else {
      // Add new assignment
      const newAssignment: MealPlanTemplateAssignment = {
        item_type: 'meal',
        day_of_week: currentDay,
        meal_type: currentMealType,
        meal_id: meal.id,
        meal_name: meal.name,
        quantity: quantity,
        unit: unit,
      };
      setAssignments((prev) => [...prev, newAssignment]);

      // Fetch and add to extended assignments
      const extendedAssignment =
        await fetchNutritionForAssignment(newAssignment);
      setExtendedAssignments((prev) => [...prev, extendedAssignment]);
    }

    setIsMealUnitSelectorOpen(false);
    setSelectedMeal(null);
  };

  const handleFoodSelected = (item: Food | Meal, type: 'food' | 'meal') => {
    if (currentDay === null || currentMealType === null) return;

    setIsFoodSelectionOpen(false);

    if (type === 'meal') {
      const meal = item as Meal;
      // Open quantity selector for meals instead of directly adding
      setSelectedMeal(meal);
      setIsMealUnitSelectorOpen(true);
    } else {
      const food = item as Food;
      if (
        planMode === 'carbCycle' &&
        currentMacroRole &&
        food.macro_role !== currentMacroRole
      ) {
        toast({
          title: t('common.error', 'Error'),
          description: translateWithVars(
            t,
            'mealPlanTemplateForm.chooseMacroRoleFood',
            'Choose a {{macroRole}} food for this slot.',
            { macroRole: macroRoleLabels[currentMacroRole] }
          ),
          variant: 'destructive',
        });
        return;
      }

      if (planMode === 'carbCycle' && currentMacroRole) {
        const selectedVariant = food.default_variant;
        if (!selectedVariant) {
          toast({
            title: t('common.error', 'Error'),
            description: t(
              'mealPlanTemplateForm.noDefaultNutritionVariant',
              'This food has no default nutrition variant.'
            ),
            variant: 'destructive',
          });
          return;
        }

        const quantity =
          calculateRecommendedQuantity(food, currentMacroRole) || 1;
        const newAssignment: MealPlanTemplateAssignment = {
          item_type: 'food',
          day_of_week: currentDay,
          meal_type: currentMealType,
          food_id: food.id,
          food_name: food.name,
          variant_id: selectedVariant.id,
          quantity,
          unit: selectedVariant.serving_unit,
          macro_role: currentMacroRole,
        };
        const extendedAssignment: ExtendedAssignment = {
          ...newAssignment,
          calories: selectedVariant.calories,
          protein: selectedVariant.protein,
          carbs: selectedVariant.carbs,
          fat: selectedVariant.fat,
          serving_size: selectedVariant.serving_size,
          serving_unit: selectedVariant.serving_unit,
        };
        const isSameMacroSlot = (assignment: MealPlanTemplateAssignment) =>
          assignment.day_of_week === currentDay &&
          assignment.meal_type.toLowerCase() ===
            currentMealType.toLowerCase() &&
          assignment.macro_role === currentMacroRole;

        setAssignments((prev) => [
          ...prev.filter((assignment) => !isSameMacroSlot(assignment)),
          newAssignment,
        ]);
        setExtendedAssignments((prev) => [
          ...prev.filter((assignment) => !isSameMacroSlot(assignment)),
          extendedAssignment,
        ]);
        setCurrentMacroRole(null);
        setRecommendedQuantity(undefined);
        return;
      }

      if (currentMacroRole) {
        setRecommendedQuantity(
          calculateRecommendedQuantity(food, currentMacroRole)
        );
      }
      setSelectedFood(food);
      setIsFoodUnitSelectorOpen(true);
    }
  };

  const handleFoodUnitSelected = async (
    food: Food,
    quantity: number,
    unit: string,
    selectedVariant: FoodVariant
  ) => {
    if (currentDay === null || currentMealType === null) return;

    if (editingAssignmentIndex !== null) {
      const assignmentAtIndex = assignments[editingAssignmentIndex];
      // Update existing assignment
      if (assignmentAtIndex) {
        const updatedAssignment: MealPlanTemplateAssignment = {
          ...assignmentAtIndex,
          quantity,
          unit,
          variant_id: selectedVariant.id,
        };
        const updatedAssignments = [...assignments];
        updatedAssignments[editingAssignmentIndex] = updatedAssignment;
        setAssignments(updatedAssignments);

        // Update extended assignments with nutrition data
        const extendedAssignment: ExtendedAssignment = {
          ...updatedAssignment,
          calories: selectedVariant.calories,
          protein: selectedVariant.protein,
          carbs: selectedVariant.carbs,
          fat: selectedVariant.fat,
          serving_size: selectedVariant.serving_size,
          serving_unit: selectedVariant.serving_unit,
        };
        const updatedExtended = [...extendedAssignments];
        updatedExtended[editingAssignmentIndex] = extendedAssignment;
        setExtendedAssignments(updatedExtended);

        setEditingAssignmentIndex(null);
      }
    } else {
      // Add new assignment
      const newAssignment: MealPlanTemplateAssignment = {
        item_type: 'food',
        day_of_week: currentDay,
        meal_type: currentMealType,
        food_id: food.id,
        food_name: food.name,
        variant_id: selectedVariant.id,
        quantity: quantity,
        unit: unit,
        macro_role: currentMacroRole ?? undefined,
      };
      setAssignments((prev) =>
        currentMacroRole
          ? [
              ...prev.filter(
                (assignment) =>
                  !(
                    assignment.day_of_week === currentDay &&
                    assignment.meal_type.toLowerCase() ===
                      currentMealType.toLowerCase() &&
                    assignment.macro_role === currentMacroRole
                  )
              ),
              newAssignment,
            ]
          : [...prev, newAssignment]
      );

      // Add to extended assignments with nutrition data
      const extendedAssignment: ExtendedAssignment = {
        ...newAssignment,
        calories: selectedVariant.calories,
        protein: selectedVariant.protein,
        carbs: selectedVariant.carbs,
        fat: selectedVariant.fat,
        serving_size: selectedVariant.serving_size,
        serving_unit: selectedVariant.serving_unit,
      };
      setExtendedAssignments((prev) =>
        currentMacroRole
          ? [
              ...prev.filter(
                (assignment) =>
                  !(
                    assignment.day_of_week === currentDay &&
                    assignment.meal_type.toLowerCase() ===
                      currentMealType.toLowerCase() &&
                    assignment.macro_role === currentMacroRole
                  )
              ),
              extendedAssignment,
            ]
          : [...prev, extendedAssignment]
      );
    }

    setIsFoodUnitSelectorOpen(false);
    setSelectedFood(null);
    setCurrentMacroRole(null);
    setRecommendedQuantity(undefined);
  };

  const handleRemoveAssignment = (index: number) => {
    setAssignments((prev) => prev.filter((_, i) => i !== index));
    setExtendedAssignments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRemoveMacroAssignment = (
    dayIndex: number,
    mealType: string,
    role: FoodMacroRole
  ) => {
    const isSameMacroSlot = (assignment: MealPlanTemplateAssignment) =>
      assignment.day_of_week === dayIndex &&
      assignment.meal_type.toLowerCase() === mealType.toLowerCase() &&
      assignment.macro_role === role;

    setAssignments((prev) =>
      prev.filter((assignment) => !isSameMacroSlot(assignment))
    );
    setExtendedAssignments((prev) =>
      prev.filter((assignment) => !isSameMacroSlot(assignment))
    );
  };

  const handleEditAssignment = async (index: number) => {
    const assignment = extendedAssignments[index];
    if (!assignment) return;

    setEditingAssignmentIndex(index);

    if (assignment.item_type === 'meal' && assignment.meal_id) {
      try {
        const meal = await queryClient.fetchQuery(
          mealViewOptions(assignment.meal_id)
        );
        setSelectedMeal(meal);
        setIsMealUnitSelectorOpen(true);
      } catch (err) {
        error(loggingLevel, 'Failed to fetch meal for editing:', err);
      }
    } else if (assignment.item_type === 'food' && assignment.food_id) {
      try {
        const food = await queryClient.fetchQuery(
          foodViewOptions(assignment.food_id)
        );
        setSelectedFood(food);
        setIsFoodUnitSelectorOpen(true);
      } catch (err) {
        error(loggingLevel, 'Failed to fetch food for editing:', err);
      }
    }
  };

  const calculateAssignmentsNutrition = (
    relevantAssignments: ExtendedAssignment[]
  ) => {
    let totalCalories = 0;
    let totalProtein = 0;
    let totalCarbs = 0;
    let totalFat = 0;

    relevantAssignments.forEach((assignment) => {
      // Meal assignments use uniform math: quantity / (serving_size × total_servings).
      // Food assignments leave total_servings undefined, defaulting to 1 — math
      // reduces to today's quantity/serving_size for those.
      const denominator =
        (assignment.serving_size || 1) * (assignment.total_servings || 1);
      const scale = (assignment.quantity || 1) / denominator;
      totalCalories += (assignment.calories || 0) * scale;
      totalProtein += (assignment.protein || 0) * scale;
      totalCarbs += (assignment.carbs || 0) * scale;
      totalFat += (assignment.fat || 0) * scale;
    });

    return { totalCalories, totalProtein, totalCarbs, totalFat };
  };

  // Calculate nutrition totals for a specific meal type on a specific day
  const calculateMealTypeNutrition = (dayIndex: number, mealType: string) => {
    const relevantAssignments = extendedAssignments.filter(
      (a) =>
        a.day_of_week === dayIndex &&
        a.meal_type.toLowerCase() === mealType.toLowerCase()
    );

    return calculateAssignmentsNutrition(relevantAssignments);
  };

  // Calculate total nutrition for an entire day
  const calculateDailyNutrition = (dayIndex: number) => {
    const relevantAssignments = extendedAssignments.filter(
      (a) => a.day_of_week === dayIndex
    );
    return calculateAssignmentsNutrition(relevantAssignments);
  };

  const handleSave = () => {
    if (!planName.trim()) {
      toast({
        title: t('common.error'),
        description: t('mealPlanTemplateForm.planNameEmptyError'),
        variant: 'destructive',
      });
      return;
    }
    if (startDate && endDate && startDate > endDate) {
      toast({
        title: t('common.error'),
        description: t('mealPlanTemplateForm.endDateError'),
        variant: 'destructive',
      });
      return;
    }
    const dataToSave = {
      ...template,
      plan_name: planName,
      description,
      start_date: startDate,
      end_date: endDate,
      is_active: isActive,
      macro_targets: resolvedMealMacroTargetsByDay,
      assignments,
    };
    debug(
      loggingLevel,
      'MealPlanTemplateForm: Saving template data:',
      dataToSave
    ); // Use debug
    onSave(dataToSave);
  };

  const handleGenerateCarbCycleTargets = async () => {
    const bodyWeightKg = weightData?.weight;
    if (!startDate) {
      toast({
        title: t('common.error'),
        description: t(
          'mealPlanTemplateForm.chooseWeekStartDate',
          'Choose a week start date before generating targets.'
        ),
        variant: 'destructive',
      });
      return;
    }
    if (!bodyWeightKg || bodyWeightKg <= 0) {
      toast({
        title: t('common.error'),
        description: t(
          'mealPlanTemplateForm.logWeightBeforeGeneratingTargets',
          'Log a body weight check-in before generating carb cycle targets.'
        ),
        variant: 'destructive',
      });
      return;
    }

    const previewWeekStartDate = selectedWeekStartDate || startDate;
    const preview = await previewCarbCycleMutation.mutateAsync({
      weekStartDate: previewWeekStartDate,
      bodyWeightKg,
      carbsPerKg: Number(carbCycleForm.carbsPerKg),
      proteinPerKg: Number(carbCycleForm.proteinPerKg),
      fatPerKg: Number(carbCycleForm.fatPerKg),
      trainingSlots: DEFAULT_TRAINING_SLOTS,
      trainingSessionsByDay: trainingSessionsByDay ?? undefined,
    });
    const draft = buildCarbCycleMealPlanDraft(preview);
    setGeneratedMealMacroTargetsByDay(draft.mealTargetsByDay);
    setGeneratedCarbCyclePreview(preview);
  };

  const daysOfWeek = orderItemsByFirstDay(
    [
      { id: 0, name: t('common.sunday', 'Sunday') },
      { id: 1, name: t('common.monday', 'Monday') },
      { id: 2, name: t('common.tuesday', 'Tuesday') },
      { id: 3, name: t('common.wednesday', 'Wednesday') },
      { id: 4, name: t('common.thursday', 'Thursday') },
      { id: 5, name: t('common.friday', 'Friday') },
      { id: 6, name: t('common.saturday', 'Saturday') },
    ],
    firstDayOfWeek
  );
  const mealTypes =
    availableMealTypes.length > 0
      ? availableMealTypes.map((mt) => mt.name)
      : [
          t('common.breakfast', 'breakfast'),
          t('common.lunch', 'lunch'),
          t('common.dinner', 'dinner'),
          t('common.snacks', 'snacks'),
        ];
  const carbCycleDayTargetsByDay = (
    generatedCarbCyclePreview?.days ?? []
  ).reduce<Record<number, CarbCycleDayTarget>>((acc, day) => {
    acc[getDayOfWeekFromDate(day.date)] = day;
    return acc;
  }, {});

  return (
    <>
      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {template
                ? t('mealPlanTemplateForm.editTitle')
                : t('mealPlanTemplateForm.createTitle')}
            </DialogTitle>
            <DialogDescription>
              {template
                ? t('mealPlanTemplateForm.editDescription')
                : t('mealPlanTemplateForm.createDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="planName">
                {t('mealPlanTemplateForm.planNameLabel')}
              </Label>
              <Input
                id="planName"
                value={planName}
                onChange={(e) => setPlanName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">
                {t('mealPlanTemplateForm.descriptionLabel')}
              </Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startDate">
                  {t('mealPlanTemplateForm.startDateLabel')}
                </Label>
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate">
                  {t('mealPlanTemplateForm.endDateLabel')}
                </Label>
                <Input
                  id="endDate"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-col space-y-1">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
                <Label htmlFor="isActive">
                  {t('mealPlanTemplateForm.setActiveLabel')}
                </Label>
              </div>
              <p className="text-xs text-muted-foreground ml-6">
                {t(
                  'mealPlanTemplateForm.multipleActiveHint',
                  'Multiple meal plans can be active at the same time. Active plans automatically populate diary entries.'
                )}
              </p>
            </div>
            <div className="space-y-3 rounded-lg border p-4">
              <div className="space-y-1">
                <Label>{t('mealPlanTemplateForm.planMode', 'Plan Mode')}</Label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant={planMode === 'average' ? 'default' : 'outline'}
                    onClick={() => setPlanMode('average')}
                  >
                    {t('mealPlanTemplateForm.averageMode', 'Average')}
                  </Button>
                  <Button
                    type="button"
                    variant={planMode === 'carbCycle' ? 'default' : 'outline'}
                    onClick={() => setPlanMode('carbCycle')}
                  >
                    {t('mealPlanTemplateForm.carbCycleMode', 'Carb Cycle')}
                  </Button>
                </div>
              </div>

              {planMode === 'carbCycle' ? (
                <div className="space-y-4">
                  <div className="rounded-md bg-muted p-3 text-sm">
                    <div className="font-medium">
                      {t(
                        'mealPlanTemplateForm.currentBodyWeight',
                        'Current body weight'
                      )}
                    </div>
                    <div className="text-muted-foreground">
                      {isWeightLoading
                        ? t(
                            'mealPlanTemplateForm.loadingLatestWeight',
                            'Loading latest weight...'
                          )
                        : weightData?.weight
                          ? `${weightData.weight.toFixed(1)} kg`
                          : t(
                              'mealPlanTemplateForm.noWeightCheckIn',
                              'No weight check-in found. Log weight before generating targets.'
                            )}
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="meal-plan-carb-cycle-carbs">
                        {t('mealPlanTemplateForm.carbsPerKg', 'Carbs / kg')}
                      </Label>
                      <Input
                        id="meal-plan-carb-cycle-carbs"
                        type="number"
                        inputMode="decimal"
                        step="0.1"
                        value={carbCycleForm.carbsPerKg}
                        onChange={(event) =>
                          setCarbCycleForm({
                            ...carbCycleForm,
                            carbsPerKg: event.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="meal-plan-carb-cycle-protein">
                        {t('mealPlanTemplateForm.proteinPerKg', 'Protein / kg')}
                      </Label>
                      <Input
                        id="meal-plan-carb-cycle-protein"
                        type="number"
                        inputMode="decimal"
                        step="0.1"
                        value={carbCycleForm.proteinPerKg}
                        onChange={(event) =>
                          setCarbCycleForm({
                            ...carbCycleForm,
                            proteinPerKg: event.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="meal-plan-carb-cycle-fat">
                        {t('mealPlanTemplateForm.fatPerKg', 'Fat / kg')}
                      </Label>
                      <Input
                        id="meal-plan-carb-cycle-fat"
                        type="number"
                        inputMode="decimal"
                        step="0.1"
                        value={carbCycleForm.fatPerKg}
                        onChange={(event) =>
                          setCarbCycleForm({
                            ...carbCycleForm,
                            fatPerKg: event.target.value,
                          })
                        }
                      />
                    </div>
                  </div>

                  <div className="space-y-2 rounded-md border p-3">
                    <Label>
                      {t(
                        'mealPlanTemplateForm.trainingFocusPlan',
                        'Training Focus Plan'
                      )}
                    </Label>
                    {activeTrainingFocusPlan ? (
                      <div className="space-y-2">
                        <div className="text-sm font-medium">
                          {activeTrainingFocusPlan.plan_name}
                        </div>
                        <div className="grid gap-2 md:grid-cols-7">
                          {daysOfWeek.map((day) => {
                            const daySessions =
                              activeTrainingFocusPlan.focus_sessions?.filter(
                                (session: WorkoutPlanFocusSession) =>
                                  session.day_of_week === day.id
                              ) ?? [];
                            const dayTarget = carbCycleDayTargetsByDay[day.id];
                            const primary = daySessions.find(
                              (session) => session.is_primary
                            );
                            const activeCount = daySessions.filter(
                              (session) => session.training_focus !== 'rest'
                            ).length;
                            return (
                              <div
                                key={day.id}
                                className="rounded-md bg-muted p-2 text-xs"
                              >
                                <div className="font-medium">{day.name}</div>
                                <div className="space-y-1">
                                  <div className="text-muted-foreground">
                                    {activeCount === 0
                                      ? t('exercise.rest', 'Rest')
                                      : translateWithVars(
                                          t,
                                          'mealPlanTemplateForm.sessionCount',
                                          '{{count}} session',
                                          { count: activeCount }
                                        )}
                                  </div>
                                  <div
                                    className={
                                      primary
                                        ? 'font-medium text-primary'
                                        : 'font-medium text-muted-foreground'
                                    }
                                  >
                                    {translateWithVars(
                                      t,
                                      'mealPlanTemplateForm.mainSlot',
                                      'Main: {{slot}}',
                                      { slot: primary?.time_slot ?? '—' }
                                    )}
                                  </div>
                                </div>
                                {dayTarget ? (
                                  <div className="mt-2 space-y-1 border-t pt-2">
                                    <div className="font-medium">
                                      {formatCarbCycleDayType(
                                        dayTarget.dayType
                                      )}
                                    </div>
                                    <div className="text-muted-foreground">
                                      {dayTarget.calories.toFixed(0)} kcal
                                    </div>
                                    <div className="space-y-1 font-medium">
                                      <div className="flex justify-between gap-2">
                                        <span>Carbs</span>
                                        <span>
                                          {dayTarget.carbs.toFixed(1)}g
                                        </span>
                                      </div>
                                      <div className="flex justify-between gap-2">
                                        <span>Protein</span>
                                        <span>
                                          {dayTarget.protein.toFixed(1)}g
                                        </span>
                                      </div>
                                      <div className="flex justify-between gap-2">
                                        <span>Fat</span>
                                        <span>{dayTarget.fat.toFixed(1)}g</span>
                                      </div>
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {t(
                          'mealPlanTemplateForm.noActiveTrainingFocusPlan',
                          'No active Training Focus Plan covers this start date. Carb Cycle targets will be generated as rest days until you create and activate one under Workout Plans.'
                        )}
                      </p>
                    )}
                  </div>

                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleGenerateCarbCycleTargets}
                    disabled={previewCarbCycleMutation.isPending}
                  >
                    {t(
                      'mealPlanTemplateForm.generateCarbCycleTargets',
                      'Generate Carb Cycle Targets'
                    )}
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t(
                    'mealPlanTemplateForm.averageModeDescription',
                    'Average mode keeps SparkyFitness default meal planning. Meal calorie targets come from your normal meal percentages.'
                  )}
                </p>
              )}
            </div>
            <div className="space-y-4">
              {daysOfWeek.map((day) => {
                const dayIndex = day.id;
                const dailyTotals = calculateDailyNutrition(dayIndex);
                const dayMealTargets =
                  resolvedMealMacroTargetsByDay[dayIndex] ?? [];
                const dayTargetTotals =
                  dayMealTargets.length > 0
                    ? dayMealTargets.reduce(
                        (totals, target) => ({
                          calories: totals.calories + target.calories,
                          protein: totals.protein + target.protein,
                          carbs: totals.carbs + target.carbs,
                          fat: totals.fat + target.fat,
                        }),
                        { calories: 0, protein: 0, carbs: 0, fat: 0 }
                      )
                    : null;
                const visibleMealTypesForDay =
                  planMode === 'carbCycle' && dayMealTargets.length > 0
                    ? Array.from(
                        new Set(dayMealTargets.map((target) => target.label))
                      )
                    : mealTypes;
                const hasDailyAssignments = extendedAssignments.some(
                  (a) => a.day_of_week === dayIndex
                );

                return (
                  <div key={dayIndex}>
                    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <h3 className="text-lg font-semibold">{day.name}</h3>
                      {dayTargetTotals ? (
                        <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">
                            {translateWithVars(
                              t,
                              'mealPlanTemplateForm.dailyTargetForDay',
                              'Daily Target for {{day}}:',
                              { day: day.name }
                            )}
                          </span>{' '}
                          {dayTargetTotals.calories.toFixed(0)} kcal | C:{' '}
                          {dayTargetTotals.carbs.toFixed(1)}g | P:{' '}
                          {dayTargetTotals.protein.toFixed(1)}g | F:{' '}
                          {dayTargetTotals.fat.toFixed(1)}g
                        </div>
                      ) : null}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {visibleMealTypesForDay.map((mealType) => {
                        const mealTypeTotals = calculateMealTypeNutrition(
                          dayIndex,
                          mealType
                        );
                        const mealTarget = dayMealTargets.find(
                          (target) =>
                            target.label.toLowerCase() ===
                            mealType.toLowerCase()
                        );
                        const assignmentsForMealType =
                          extendedAssignments.filter(
                            (a) =>
                              a.day_of_week === dayIndex &&
                              a.meal_type.toLowerCase() ===
                                mealType.toLowerCase()
                          );

                        return (
                          <div key={mealType} className="p-4 border rounded-lg">
                            <h4 className="font-semibold capitalize">
                              {mealType}
                            </h4>
                            {!(planMode === 'carbCycle' && mealTarget) && (
                              <div className="space-y-2 mt-2">
                                {assignmentsForMealType.map(
                                  (assignment, idx) => {
                                    const actualIndex =
                                      extendedAssignments.indexOf(assignment);
                                    const denominator =
                                      (assignment.serving_size || 1) *
                                      (assignment.total_servings || 1);
                                    const scale =
                                      (assignment.quantity || 1) / denominator;
                                    const calories =
                                      (assignment.calories || 0) * scale;
                                    const protein =
                                      (assignment.protein || 0) * scale;
                                    const carbs =
                                      (assignment.carbs || 0) * scale;
                                    const fat = (assignment.fat || 0) * scale;

                                    return (
                                      <div
                                        key={idx}
                                        className="flex flex-col p-3 border rounded-md space-y-2 bg-gray-50 dark:bg-gray-800"
                                      >
                                        <div className="flex items-center justify-between">
                                          <span className="font-medium">
                                            {assignment.item_type === 'meal'
                                              ? assignment.meal_name
                                              : assignment.food_name}
                                          </span>
                                          <div className="flex items-center space-x-1">
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              onClick={() =>
                                                handleEditAssignment(
                                                  actualIndex
                                                )
                                              }
                                              title={t(
                                                'mealPlanTemplateForm.editQuantity',
                                                'Edit quantity'
                                              )}
                                            >
                                              <Edit className="h-4 w-4" />
                                            </Button>
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              onClick={() =>
                                                handleRemoveAssignment(
                                                  actualIndex
                                                )
                                              }
                                              title={t(
                                                'common.remove',
                                                'Remove'
                                              )}
                                            >
                                              <X className="h-4 w-4" />
                                            </Button>
                                          </div>
                                        </div>
                                        <div className="flex flex-col sm:flex-row justify-between text-sm text-muted-foreground">
                                          <div>
                                            {assignment.quantity || 1}{' '}
                                            {assignment.unit ||
                                              t('common.serving', 'serving')}
                                          </div>
                                          <div className="flex space-x-3 mt-1 sm:mt-0">
                                            <span>
                                              {calories.toFixed(0)} kcal
                                            </span>
                                            <span className="text-green-500">
                                              C: {carbs.toFixed(1)}g
                                            </span>
                                            <span className="text-blue-500">
                                              P: {protein.toFixed(1)}g
                                            </span>
                                            <span className="text-yellow-500">
                                              F: {fat.toFixed(1)}g
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  }
                                )}
                              </div>
                            )}
                            {assignmentsForMealType.length > 0 && (
                              <div className="text-xs text-muted-foreground mt-2 p-2 bg-muted rounded">
                                <strong>{t('common.total', 'Total')}:</strong>{' '}
                                {mealTypeTotals.totalCalories.toFixed(0)} kcal |{' '}
                                C: {mealTypeTotals.totalCarbs.toFixed(1)}g | P:{' '}
                                {mealTypeTotals.totalProtein.toFixed(1)}g | F:{' '}
                                {mealTypeTotals.totalFat.toFixed(1)}g
                              </div>
                            )}
                            {mealTarget ? (
                              <div className="text-xs text-muted-foreground mt-2 p-2 border border-dashed rounded">
                                <div className="font-medium text-foreground">
                                  {t('mealPlanTemplateForm.target', 'Target')}:{' '}
                                  {mealTarget.calories} kcal | C:{' '}
                                  {mealTarget.carbs}g | P: {mealTarget.protein}g
                                  | F: {mealTarget.fat}g
                                </div>
                                <div>
                                  {t(
                                    'mealPlanTemplateForm.remaining',
                                    'Remaining'
                                  )}
                                  : C:{' '}
                                  {(
                                    mealTarget.carbs - mealTypeTotals.totalCarbs
                                  ).toFixed(1)}
                                  g | P:{' '}
                                  {(
                                    mealTarget.protein -
                                    mealTypeTotals.totalProtein
                                  ).toFixed(1)}
                                  g | F:{' '}
                                  {(
                                    mealTarget.fat - mealTypeTotals.totalFat
                                  ).toFixed(1)}
                                  g
                                </div>
                              </div>
                            ) : null}
                            {planMode === 'carbCycle' && mealTarget ? (
                              <div className="mt-3 space-y-2 rounded-md border bg-muted/30 p-2">
                                {MACRO_ROLE_ORDER.map((role) => {
                                  const selectedRoleAssignment =
                                    assignmentsForMealType.find(
                                      (assignment) =>
                                        assignment.macro_role === role
                                    );
                                  const targetValue =
                                    mealTarget[MACRO_ROLE_TARGET_KEY[role]];
                                  return (
                                    <div
                                      key={role}
                                      className="flex items-center justify-between gap-2 text-sm"
                                    >
                                      <div>
                                        <div className="font-medium">
                                          {macroRoleLabels[role]}
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                          {translateWithVars(
                                            t,
                                            'mealPlanTemplateForm.targetGrams',
                                            'Target {{value}}g',
                                            { value: targetValue }
                                          )}
                                        </div>
                                      </div>
                                      <div className="min-w-0 flex-1 truncate text-right text-xs text-muted-foreground">
                                        {selectedRoleAssignment ? (
                                          <>
                                            {selectedRoleAssignment.food_name}
                                            {selectedRoleAssignment.quantity &&
                                            selectedRoleAssignment.unit
                                              ? ` · ${selectedRoleAssignment.quantity}${selectedRoleAssignment.unit}`
                                              : ''}
                                          </>
                                        ) : (
                                          t(
                                            'mealPlanTemplateForm.noneSelected',
                                            'None selected'
                                          )
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <Button
                                          variant="outline"
                                          size="icon"
                                          aria-label={
                                            selectedRoleAssignment
                                              ? translateWithVars(
                                                  t,
                                                  'mealPlanTemplateForm.changeMacroFood',
                                                  'Change {{macroRole}} food',
                                                  {
                                                    macroRole:
                                                      macroRoleLabels[role],
                                                  }
                                                )
                                              : translateWithVars(
                                                  t,
                                                  'mealPlanTemplateForm.selectMacroFood',
                                                  'Select {{macroRole}} food',
                                                  {
                                                    macroRole:
                                                      macroRoleLabels[role],
                                                  }
                                                )
                                          }
                                          title={
                                            selectedRoleAssignment
                                              ? translateWithVars(
                                                  t,
                                                  'mealPlanTemplateForm.changeMacroFood',
                                                  'Change {{macroRole}} food',
                                                  {
                                                    macroRole:
                                                      macroRoleLabels[role],
                                                  }
                                                )
                                              : translateWithVars(
                                                  t,
                                                  'mealPlanTemplateForm.selectMacroFood',
                                                  'Select {{macroRole}} food',
                                                  {
                                                    macroRole:
                                                      macroRoleLabels[role],
                                                  }
                                                )
                                          }
                                          onClick={() =>
                                            handleAddFood(
                                              dayIndex,
                                              mealType,
                                              role
                                            )
                                          }
                                        >
                                          <Search className="h-4 w-4" />
                                        </Button>
                                        {selectedRoleAssignment ? (
                                          <>
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              aria-label={translateWithVars(
                                                t,
                                                'mealPlanTemplateForm.editMacroQuantity',
                                                'Edit {{macroRole}} quantity',
                                                {
                                                  macroRole:
                                                    macroRoleLabels[role],
                                                }
                                              )}
                                              title={translateWithVars(
                                                t,
                                                'mealPlanTemplateForm.editMacroQuantity',
                                                'Edit {{macroRole}} quantity',
                                                {
                                                  macroRole:
                                                    macroRoleLabels[role],
                                                }
                                              )}
                                              onClick={() =>
                                                handleEditAssignment(
                                                  extendedAssignments.indexOf(
                                                    selectedRoleAssignment
                                                  )
                                                )
                                              }
                                            >
                                              <Edit className="h-4 w-4" />
                                            </Button>
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              aria-label={translateWithVars(
                                                t,
                                                'mealPlanTemplateForm.clearMacroFood',
                                                'Clear {{macroRole}} food',
                                                {
                                                  macroRole:
                                                    macroRoleLabels[role],
                                                }
                                              )}
                                              title={translateWithVars(
                                                t,
                                                'mealPlanTemplateForm.clearMacroFood',
                                                'Clear {{macroRole}} food',
                                                {
                                                  macroRole:
                                                    macroRoleLabels[role],
                                                }
                                              )}
                                              onClick={() =>
                                                handleRemoveMacroAssignment(
                                                  dayIndex,
                                                  mealType,
                                                  role
                                                )
                                              }
                                            >
                                              <X className="h-4 w-4" />
                                            </Button>
                                          </>
                                        ) : null}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="flex space-x-2 mt-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    handleAddFood(dayIndex, mealType)
                                  }
                                >
                                  {t(
                                    'mealPlanTemplateForm.addFoodOrMealButton'
                                  )}
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {hasDailyAssignments && (
                      <div className="mt-4 p-3 bg-primary/5 rounded-lg border border-primary/20">
                        <h4 className="font-semibold text-sm mb-2">
                          {translateWithVars(
                            t,
                            'mealPlanTemplateForm.dailyTotalForDay',
                            'Daily Total for {{day}}',
                            { day: day.name }
                          )}
                        </h4>
                        <div className="text-sm space-x-4">
                          <span className="font-medium">
                            {dailyTotals.totalCalories.toFixed(0)} kcal
                          </span>
                          <span className="text-green-500">
                            C: {dailyTotals.totalCarbs.toFixed(1)}g
                          </span>
                          <span className="text-blue-500">
                            P: {dailyTotals.totalProtein.toFixed(1)}g
                          </span>
                          <span className="text-yellow-500">
                            F: {dailyTotals.totalFat.toFixed(1)}g
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSave}>{t('common.saveChanges')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FoodSearchDialog
        open={isFoodSelectionOpen}
        onOpenChange={setIsFoodSelectionOpen}
        onFoodSelect={(item, type) => handleFoodSelected(item, type)}
        title={t('mealPlanTemplateForm.addFoodToMealPlanTitle')}
        description={t('mealPlanTemplateForm.addFoodToMealPlanDescription')}
        hideMealTab={planMode === 'carbCycle'}
        localDatabaseOnly={planMode === 'carbCycle'}
        macroRoleFilter={currentMacroRole}
      />

      {selectedFood && (
        <FoodUnitSelector
          food={selectedFood}
          open={isFoodUnitSelectorOpen}
          onOpenChange={setIsFoodUnitSelectorOpen}
          onSelect={handleFoodUnitSelected}
          initialQuantity={recommendedQuantity}
        />
      )}

      {selectedMeal && (
        <MealUnitSelector
          key={`${selectedMeal?.id}-${isMealUnitSelectorOpen}`}
          meal={selectedMeal}
          open={isMealUnitSelectorOpen}
          onOpenChange={setIsMealUnitSelectorOpen}
          onSelect={handleMealUnitSelected}
        />
      )}
    </>
  );
};

export default MealPlanTemplateForm;
