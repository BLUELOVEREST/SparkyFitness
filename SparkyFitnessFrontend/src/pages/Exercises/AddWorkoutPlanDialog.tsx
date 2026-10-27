import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isBuiltInTrainingFocus } from '@workspace/shared';
import { TooltipProvider } from '@/components/ui/tooltip';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type {
  SortableExerciseItemData,
  TrainingFocusTimeSlot,
  WorkoutPlanTemplate,
  WorkoutPlanFocusSession,
  WorkoutPlanMode,
} from '@/types/workout';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import {
  Plus,
  Clipboard,
  CalendarDays,
  Repeat,
  Trash2,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { Card } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import AddExerciseDialog from './AddExerciseDialog';
import { usePreferences } from '@/contexts/PreferencesContext';
import { formatDateToYYYYMMDD } from '@/lib/utils';
import { DAYS_OF_WEEK } from '@/constants/exercises';
import { useWorkoutPlanAssignments } from '@/hooks/Exercises/useWorkoutPlanAssignments';
import { SortableExerciseItem } from './SortableExerciseItem';
import {
  orderItemsByFirstDay,
  buildTrainingFocusOptionsFromTemplates,
  CUSTOM_TRAINING_FOCUS_VALUE,
  normalizeTrainingFocusValue,
  resolveTrainingFocusValue,
  setPrimaryTrainingFocusSession,
  updateTrainingFocusSession,
} from '@/utils/trainingFocusPlan';

const TRAINING_FOCUS_TIME_SLOTS: {
  value: TrainingFocusTimeSlot;
  label: string;
}[] = [
  { value: 'morning', label: 'Morning' },
  { value: 'noon', label: 'Noon' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' },
];

function buildDefaultFocusSessions(
  initialSessions?: WorkoutPlanFocusSession[]
): WorkoutPlanFocusSession[] {
  return DAYS_OF_WEEK.flatMap((day) =>
    TRAINING_FOCUS_TIME_SLOTS.map(({ value }) => {
      const existing = initialSessions?.find(
        (session) =>
          session.day_of_week === day.id && session.time_slot === value
      );
      const trainingFocus = normalizeTrainingFocusValue(
        existing?.training_focus ?? 'rest'
      );
      return {
        day_of_week: day.id,
        time_slot: value,
        training_focus: trainingFocus,
        is_primary: trainingFocus !== 'rest' && Boolean(existing?.is_primary),
      };
    })
  );
}

interface AddWorkoutPlanDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (
    newPlan: Omit<
      WorkoutPlanTemplate,
      'id' | 'user_id' | 'created_at' | 'updated_at'
    >
  ) => void;
  initialData?: WorkoutPlanTemplate | null;
  existingPlans?: WorkoutPlanTemplate[];
  onUpdate?: (
    planId: string,
    updatedPlan: Partial<WorkoutPlanTemplate>
  ) => void;
}

const AddWorkoutPlanDialog = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  existingPlans = [],
  onUpdate,
}: AddWorkoutPlanDialogProps) => {
  const {
    assignments,
    sessionList,
    sessionNames,
    setSessionName,
    addSession,
    removeSession,
    moveSession,
    scheduleType,
    setScheduleType,
    entryMode,
    setEntryMode,
    copiedAssignment,
    workoutPresets,
    isAddExerciseDialogOpen,
    setIsAddExerciseDialogOpen,
    setSelectedDayForAssignment,
    selectedSessionForAssignment,
    setSelectedSessionForAssignment,
    handleRemoveAssignment,
    handleSetChangeInPlan,
    handleAddSetInPlan,
    handleDuplicateSetInPlan,
    handleRemoveSetInPlan,
    handleDragEnd,
    handleAddExerciseOrPreset,
    handleCopyAssignment,
    handlePasteAssignment,
    buildAssignmentsForSave,
  } = useWorkoutPlanAssignments(initialData);
  const { t } = useTranslation();
  const { weightUnit, firstDayOfWeek } = usePreferences();
  const [planName, setPlanName] = useState(() => initialData?.plan_name || '');
  const [description, setDescription] = useState(
    () => initialData?.description || ''
  );

  const [startDate, setStartDate] = useState(() => {
    if (initialData?.start_date) {
      return String(initialData.start_date).split('T')[0];
    }
    return formatDateToYYYYMMDD(new Date());
  });

  const [endDate, setEndDate] = useState(() => {
    if (initialData?.end_date) {
      return String(initialData.end_date).split('T')[0];
    }
    const date = new Date();
    date.setDate(date.getDate() + 7);
    return formatDateToYYYYMMDD(date);
  });

  const [isActive, setIsActive] = useState(
    () => initialData?.is_active ?? true
  );
  const [planMode, setPlanMode] = useState<WorkoutPlanMode>(
    () => initialData?.plan_mode ?? 'detailed'
  );
  const [focusSessions, setFocusSessions] = useState<WorkoutPlanFocusSession[]>(
    () => buildDefaultFocusSessions(initialData?.focus_sessions)
  );
  const [customFocusDrafts, setCustomFocusDrafts] = useState<
    Record<string, string>
  >({});

  const trainingFocusOptions = useMemo(
    () => buildTrainingFocusOptionsFromTemplates(existingPlans, focusSessions),
    [existingPlans, focusSessions]
  );

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleSave = () => {
    if (planName.trim() === '' || startDate?.trim() === '') {
      toast({
        title: t(
          'addWorkoutPlanDialog.validationErrorTitle',
          'Validation Error'
        ),
        description: t(
          'addWorkoutPlanDialog.validationErrorDescription',
          'Plan Name and Start Date are required.'
        ),
        variant: 'destructive',
      });
      return;
    }

    const resolvedFocusSessions =
      planMode === 'training_focus'
        ? focusSessions.map((session) => {
            const trainingFocus = resolveTrainingFocusValue(
              session.training_focus,
              customFocusDrafts[
                `${session.day_of_week}-${session.time_slot}`
              ] ?? ''
            );
            return {
              ...session,
              training_focus: trainingFocus,
              is_primary: trainingFocus !== 'rest' && session.is_primary,
            };
          })
        : [];

    if (planMode === 'training_focus') {
      for (const day of DAYS_OF_WEEK) {
        const daySessions = resolvedFocusSessions.filter(
          (session) => session.day_of_week === day.id
        );
        const activeSessions = daySessions.filter(
          (session) => session.training_focus !== 'rest'
        );
        const primarySessions = daySessions.filter(
          (session) => session.is_primary
        );
        if (activeSessions.length > 0 && primarySessions.length !== 1) {
          toast({
            title: t(
              'addWorkoutPlanDialog.validationErrorTitle',
              'Validation Error'
            ),
            description: `${day.name} must have exactly one main training session.`,
            variant: 'destructive',
          });
          return;
        }
      }
    }

    const planData = {
      plan_name: planName,
      description,
      plan_mode: planMode,
      start_date: startDate,
      end_date: endDate || null,
      is_active: isActive,
      schedule_type: planMode === 'training_focus' ? 'weekly' : scheduleType,
      entry_mode:
        planMode === 'training_focus' || scheduleType === 'sequential'
          ? 'prompt'
          : entryMode,
      assignments: planMode === 'detailed' ? buildAssignmentsForSave() : [],
      focus_sessions: resolvedFocusSessions,
    };

    if (initialData && onUpdate) {
      onUpdate(initialData.id, planData);
    } else {
      onSave(planData);
    }
    onClose();
  };

  const setPrimaryFocusSession = (
    dayOfWeek: number,
    timeSlot: TrainingFocusTimeSlot
  ) => {
    setFocusSessions((current) =>
      setPrimaryTrainingFocusSession(current, dayOfWeek, timeSlot)
    );
  };

  const displayDays = orderItemsByFirstDay(DAYS_OF_WEEK, firstDayOfWeek);
  const focusSessionKey = (
    dayOfWeek: number,
    timeSlot: TrainingFocusTimeSlot
  ) => `${dayOfWeek}-${timeSlot}`;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <TooltipProvider>
        <DialogContent
          requireConfirmation
          className="sm:max-w-[1200px] max-h-[90vh] overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>
              {initialData
                ? t('addWorkoutPlanDialog.editTitle', 'Edit Workout Plan')
                : t('addWorkoutPlanDialog.addTitle', 'Add New Workout Plan')}
            </DialogTitle>
            <DialogDescription>
              {initialData
                ? t(
                    'addWorkoutPlanDialog.editDescription',
                    'Edit the details for your workout plan and its assignments.'
                  )
                : t(
                    'addWorkoutPlanDialog.addDescription',
                    'Enter the details for your new workout plan and assign workouts to days.'
                  )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="planName">
                {t('addWorkoutPlanDialog.planNameLabel', 'Plan Name')}
              </Label>
              <Input
                id="planName"
                value={planName}
                onChange={(e) => setPlanName(e.target.value)}
                placeholder={t(
                  'addWorkoutPlanDialog.planNamePlaceholder',
                  'e.g., Summer Shred'
                )}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">
                {t('addWorkoutPlanDialog.descriptionLabel', 'Description')}
              </Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t(
                  'addWorkoutPlanDialog.descriptionPlaceholder',
                  'Optional plan description...'
                )}
              />
            </div>

            {planMode === 'detailed' && (
              <>
                <div className="space-y-2">
                  <Label>
                    {t(
                      'addWorkoutPlanDialog.scheduleTypeLabel',
                      'Schedule Mode'
                    )}
                  </Label>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      className={`w-full flex flex-col h-auto py-2.5 px-3.5 text-left rounded-lg border transition-all ${
                        scheduleType === 'sequential'
                          ? 'border-primary bg-primary/10 ring-1 ring-primary shadow-xs'
                          : 'border-border/70 bg-card hover:bg-accent/40 text-muted-foreground hover:text-foreground'
                      }`}
                      onClick={() => setScheduleType('sequential')}
                    >
                      <div className="flex items-center gap-1.5 font-semibold text-sm text-foreground">
                        <Repeat
                          className={`h-4 w-4 ${
                            scheduleType === 'sequential'
                              ? 'text-primary'
                              : 'text-muted-foreground'
                          }`}
                        />
                        <span>
                          {t(
                            'addWorkoutPlanDialog.sequentialModeTitle',
                            'Sequential (Cycle)'
                          )}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground mt-0.5">
                        {t(
                          'addWorkoutPlanDialog.sequentialModeSubtitle',
                          'Continuous sequence; pauses on missed days'
                        )}
                      </span>
                    </button>
                    <button
                      type="button"
                      className={`w-full flex flex-col h-auto py-2.5 px-3.5 text-left rounded-lg border transition-all ${
                        scheduleType === 'weekly'
                          ? 'border-primary bg-primary/10 ring-1 ring-primary shadow-xs'
                          : 'border-border/70 bg-card hover:bg-accent/40 text-muted-foreground hover:text-foreground'
                      }`}
                      onClick={() => setScheduleType('weekly')}
                    >
                      <div className="flex items-center gap-1.5 font-semibold text-sm text-foreground">
                        <CalendarDays
                          className={`h-4 w-4 ${
                            scheduleType === 'weekly'
                              ? 'text-primary'
                              : 'text-muted-foreground'
                          }`}
                        />
                        <span>
                          {t(
                            'addWorkoutPlanDialog.weeklyModeTitle',
                            'Weekly (Fixed Days)'
                          )}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground mt-0.5">
                        {t(
                          'addWorkoutPlanDialog.weeklyModeSubtitle',
                          'Workouts assigned to specific weekdays (Mon-Sun)'
                        )}
                      </span>
                    </button>
                  </div>
                </div>

                {scheduleType === 'weekly' && (
                  <div className="space-y-2">
                    <Label>
                      {t(
                        'addWorkoutPlanDialog.entryModeLabel',
                        'Diary Behavior'
                      )}
                    </Label>
                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        className={`w-full flex flex-col h-auto py-2.5 px-3.5 text-left rounded-lg border transition-all ${
                          entryMode === 'prompt'
                            ? 'border-primary bg-primary/10 ring-1 ring-primary shadow-xs'
                            : 'border-border/70 bg-card hover:bg-accent/40 text-muted-foreground hover:text-foreground'
                        }`}
                        onClick={() => setEntryMode('prompt')}
                      >
                        <span className="font-semibold text-sm text-foreground">
                          {t(
                            'addWorkoutPlanDialog.promptModeTitle',
                            'Prompt on Day (Recommended)'
                          )}
                        </span>
                        <span className="text-xs text-muted-foreground mt-0.5">
                          {t(
                            'addWorkoutPlanDialog.promptModeSubtitle',
                            'Clean diary; shows workout prompt on scheduled weekdays'
                          )}
                        </span>
                      </button>
                      <button
                        type="button"
                        className={`w-full flex flex-col h-auto py-2.5 px-3.5 text-left rounded-lg border transition-all ${
                          entryMode === 'prefill'
                            ? 'border-primary bg-primary/10 ring-1 ring-primary shadow-xs'
                            : 'border-border/70 bg-card hover:bg-accent/40 text-muted-foreground hover:text-foreground'
                        }`}
                        onClick={() => setEntryMode('prefill')}
                      >
                        <span className="font-semibold text-sm text-foreground">
                          {t(
                            'addWorkoutPlanDialog.prefillModeTitle',
                            'Pre-fill Calendar'
                          )}
                        </span>
                        <span className="text-xs text-muted-foreground mt-0.5">
                          {t(
                            'addWorkoutPlanDialog.prefillModeSubtitle',
                            'Pre-fills pending workout entries across all upcoming weekdays'
                          )}
                        </span>
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startDate">
                  {t('addWorkoutPlanDialog.startDateLabel', 'Start Date')}
                </Label>
                <div className="relative">
                  <Input
                    id="startDate"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="pr-8"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate">
                  {t(
                    'addWorkoutPlanDialog.endDateLabel',
                    'End Date (Optional)'
                  )}
                </Label>
                <div className="relative">
                  <Input
                    id="endDate"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="pr-8"
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="isActive"
                checked={isActive}
                onCheckedChange={(checked) => setIsActive(checked as boolean)}
              />
              <Label htmlFor="isActive">
                {t('addWorkoutPlanDialog.setActiveLabel', 'Set as active plan')}
              </Label>
            </div>
            <div className="space-y-2">
              <Label>{t('addWorkoutPlanDialog.planType', 'Plan Type')}</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  type="button"
                  variant={planMode === 'detailed' ? 'default' : 'outline'}
                  onClick={() => setPlanMode('detailed')}
                >
                  Detailed Workout Plan
                </Button>
                <Button
                  type="button"
                  variant={
                    planMode === 'training_focus' ? 'default' : 'outline'
                  }
                  onClick={() => setPlanMode('training_focus')}
                >
                  Training Focus Plan
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                {planMode === 'training_focus'
                  ? 'Plan training body parts by time slot without choosing specific exercises.'
                  : 'Plan exact workouts by assigning exercises or presets to each day.'}
              </p>
            </div>
            <p
              className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mt-2 text-sm"
              role="alert"
            >
              <span className="font-bold">
                {t('addWorkoutPlanDialog.noteTitle', 'Note:')}
              </span>{' '}
              {scheduleType === 'sequential'
                ? t(
                    'addWorkoutPlanDialog.sequentialNoteDescription',
                    'Sequential plans do not pre-fill calendar days. The sequence automatically advances to the next session whenever you complete a workout.'
                  )
                : t(
                    'addWorkoutPlanDialog.noteDescription',
                    'Updating an active plan adjusts upcoming exercise entries. Deleting a plan clears future ones, while previous entries stay in your log.'
                  )}
            </p>

            {planMode === 'training_focus' ? (
              <div className="space-y-4">
                <h4 className="mb-2 text-lg font-medium">
                  Training Focus Sessions
                </h4>
                {displayDays.map((day) => {
                  const daySessions = focusSessions.filter(
                    (session) => session.day_of_week === day.id
                  );
                  return (
                    <Card key={day.name} className="p-4 bg-muted/30">
                      <div className="space-y-3">
                        <h3 className="font-semibold text-primary">
                          {day.name}
                        </h3>
                        <div className="grid gap-3 md:grid-cols-4">
                          {TRAINING_FOCUS_TIME_SLOTS.map(({ value, label }) => {
                            const session = daySessions.find(
                              (item) => item.time_slot === value
                            )!;
                            const sessionKey = focusSessionKey(day.id, value);
                            return (
                              <div
                                key={value}
                                className="rounded-md border bg-background p-3 space-y-2"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <Label className="text-xs font-semibold uppercase text-muted-foreground">
                                    {label}
                                  </Label>
                                  <label className="flex items-center gap-1 text-xs">
                                    <input
                                      type="radio"
                                      name={`primary-focus-${day.id}`}
                                      checked={session.is_primary}
                                      disabled={
                                        session.training_focus === 'rest'
                                      }
                                      onChange={() =>
                                        setPrimaryFocusSession(day.id, value)
                                      }
                                    />
                                    Main
                                  </label>
                                </div>
                                <select
                                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                                  value={session.training_focus}
                                  onChange={(event) => {
                                    const nextValue = event.target.value;
                                    setFocusSessions((current) =>
                                      updateTrainingFocusSession(
                                        current,
                                        day.id,
                                        value,
                                        nextValue
                                      )
                                    );
                                    if (
                                      nextValue !== CUSTOM_TRAINING_FOCUS_VALUE
                                    ) {
                                      setCustomFocusDrafts((current) => {
                                        const nextDrafts = { ...current };
                                        delete nextDrafts[sessionKey];
                                        return nextDrafts;
                                      });
                                    }
                                  }}
                                >
                                  {trainingFocusOptions.map((option) => (
                                    <option
                                      key={option.value}
                                      value={option.value}
                                    >
                                      {isBuiltInTrainingFocus(option.value) ||
                                      option.value ===
                                        CUSTOM_TRAINING_FOCUS_VALUE
                                        ? t(
                                            `workoutPlan.trainingFocus.${option.value}`,
                                            {
                                              defaultValue: option.label,
                                            }
                                          )
                                        : option.label}
                                    </option>
                                  ))}
                                </select>
                                {session.training_focus ===
                                  CUSTOM_TRAINING_FOCUS_VALUE && (
                                  <Input
                                    value={customFocusDrafts[sessionKey] ?? ''}
                                    onChange={(event) =>
                                      setCustomFocusDrafts((current) => ({
                                        ...current,
                                        [sessionKey]: event.target.value,
                                      }))
                                    }
                                    placeholder="Custom focus"
                                    className="h-9 text-sm"
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-4">
                <h4 className="mb-2 text-lg font-medium">
                  {t('addWorkoutPlanDialog.assignmentsTitle', 'Assignments')}
                </h4>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  {scheduleType === 'weekly' ? (
                    displayDays.map((day) => {
                      const dayAssignments = assignments.filter(
                        (assignment) => assignment.day_of_week === day.id
                      );
                      return (
                        <Card key={day.name} className="p-4 bg-muted/30">
                          <SortableContext
                            items={dayAssignments.map((a) => a.id as string)}
                          >
                            <div className="space-y-4">
                              <div className="flex items-center justify-between">
                                <h3 className="font-semibold text-primary">
                                  {day.name}
                                </h3>
                                <div className="flex items-center space-x-2">
                                  {copiedAssignment && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() =>
                                        handlePasteAssignment(day.id)
                                      }
                                    >
                                      <Clipboard className="h-4 w-4 mr-2" />{' '}
                                      {t(
                                        'addWorkoutPlanDialog.pasteButton',
                                        'Paste'
                                      )}
                                    </Button>
                                  )}
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      setSelectedDayForAssignment(day.id);
                                      setIsAddExerciseDialogOpen(true);
                                    }}
                                  >
                                    <Plus className="h-4 w-4 mr-2" />{' '}
                                    {t(
                                      'addWorkoutPlanDialog.addExerciseButtonInDay',
                                      'Add Exercise'
                                    )}
                                  </Button>
                                </div>
                              </div>
                              {dayAssignments.map((assignment) => {
                                const originalIndex = assignments.findIndex(
                                  (a) => a.id === assignment.id
                                );
                                return (
                                  <SortableExerciseItem
                                    key={assignment.id}
                                    ex={assignment}
                                    exerciseIndex={originalIndex}
                                    weightUnit={weightUnit}
                                    workoutPresets={workoutPresets}
                                    onRemoveExercise={handleRemoveAssignment}
                                    onSetChange={handleSetChangeInPlan}
                                    onDuplicateSet={handleDuplicateSetInPlan}
                                    onRemoveSet={handleRemoveSetInPlan}
                                    onAddSet={handleAddSetInPlan}
                                    onCopyExercise={
                                      handleCopyAssignment as (
                                        ex: SortableExerciseItemData
                                      ) => void
                                    }
                                  />
                                );
                              })}
                            </div>
                          </SortableContext>
                        </Card>
                      );
                    })
                  ) : (
                    <div className="space-y-4">
                      {sessionList.map((sessionNum, sessionIdx) => {
                        const sessionAssignments = assignments.filter(
                          (assignment) =>
                            (assignment.session_index ?? 1) === sessionNum
                        );
                        return (
                          <Card
                            key={`session-${sessionNum}`}
                            className="p-4 bg-muted/30"
                          >
                            <SortableContext
                              items={sessionAssignments.map(
                                (assignment) => assignment.id as string
                              )}
                            >
                              <div className="space-y-4">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    disabled={sessionIdx === 0}
                                    onClick={() =>
                                      moveSession(sessionNum, 'up')
                                    }
                                    title={t(
                                      'addWorkoutPlanDialog.moveSessionUp',
                                      'Move session up'
                                    )}
                                  >
                                    <ChevronUp className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    disabled={
                                      sessionIdx === sessionList.length - 1
                                    }
                                    onClick={() =>
                                      moveSession(sessionNum, 'down')
                                    }
                                    title={t(
                                      'addWorkoutPlanDialog.moveSessionDown',
                                      'Move session down'
                                    )}
                                  >
                                    <ChevronDown className="h-4 w-4" />
                                  </Button>
                                  <span className="font-semibold text-primary">
                                    {t(
                                      'addWorkoutPlanDialog.sessionNumber',
                                      'Session {{number}}',
                                      {
                                        number: sessionNum,
                                      }
                                    )}
                                  </span>
                                  <Input
                                    value={sessionNames[sessionNum] ?? ''}
                                    onChange={(event) =>
                                      setSessionName(
                                        sessionNum,
                                        event.target.value
                                      )
                                    }
                                    placeholder={t(
                                      'addWorkoutPlanDialog.sessionNamePlaceholder',
                                      'Custom name (e.g., Push Day, Legs)'
                                    )}
                                    className="h-8 w-44 sm:w-60"
                                  />
                                  {copiedAssignment && (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() =>
                                        handlePasteAssignment(sessionNum)
                                      }
                                    >
                                      <Clipboard className="mr-2 h-4 w-4" />
                                      {t(
                                        'addWorkoutPlanDialog.pasteButton',
                                        'Paste'
                                      )}
                                    </Button>
                                  )}
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      setSelectedSessionForAssignment(
                                        sessionNum
                                      );
                                      setSelectedDayForAssignment(null);
                                      setIsAddExerciseDialogOpen(true);
                                    }}
                                  >
                                    <Plus className="mr-2 h-4 w-4" />
                                    {t(
                                      'addWorkoutPlanDialog.addExerciseButtonInDay',
                                      'Add Exercise'
                                    )}
                                  </Button>
                                  {sessionList.length > 1 && (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => removeSession(sessionNum)}
                                      title={t(
                                        'addWorkoutPlanDialog.removeSession',
                                        'Remove session'
                                      )}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>
                                {sessionAssignments.map((assignment) => (
                                  <SortableExerciseItem
                                    key={assignment.id}
                                    ex={assignment}
                                    exerciseIndex={assignments.findIndex(
                                      (item) => item.id === assignment.id
                                    )}
                                    weightUnit={weightUnit}
                                    workoutPresets={workoutPresets}
                                    onRemoveExercise={handleRemoveAssignment}
                                    onSetChange={handleSetChangeInPlan}
                                    onDuplicateSet={handleDuplicateSetInPlan}
                                    onRemoveSet={handleRemoveSetInPlan}
                                    onAddSet={handleAddSetInPlan}
                                    onCopyExercise={
                                      handleCopyAssignment as (
                                        ex: SortableExerciseItemData
                                      ) => void
                                    }
                                  />
                                ))}
                              </div>
                            </SortableContext>
                          </Card>
                        );
                      })}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={addSession}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        {t('addWorkoutPlanDialog.addSession', 'Add session')}
                      </Button>
                    </div>
                  )}
                </DndContext>
              </div>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" onClick={onClose}>
                {t('addWorkoutPlanDialog.cancelButton', 'Cancel')}
              </Button>
            </DialogClose>
            <Button onClick={handleSave}>
              {t('addWorkoutPlanDialog.saveButton', 'Save Plan')}
            </Button>
          </DialogFooter>
        </DialogContent>

        <Dialog
          open={isAddExerciseDialogOpen}
          onOpenChange={setIsAddExerciseDialogOpen}
        >
          <DialogContent
            requireConfirmation
            className="max-w-2xl max-h-[90vh] overflow-y-auto"
          >
            <DialogHeader>
              <DialogTitle>
                {t(
                  'addWorkoutPlanDialog.addExerciseOrPresetTitle',
                  'Add Exercise or Preset'
                )}
              </DialogTitle>
              <DialogDescription>
                {t(
                  'addWorkoutPlanDialog.addExerciseOrPresetDescription',
                  'Select an exercise or a preset to add to the selected day.'
                )}
              </DialogDescription>
            </DialogHeader>
            <AddExerciseDialog
              open={isAddExerciseDialogOpen}
              onOpenChange={setIsAddExerciseDialogOpen}
              onExerciseAdded={(exercise, sourceMode) => {
                if (exercise && sourceMode) {
                  handleAddExerciseOrPreset(
                    exercise,
                    sourceMode,
                    selectedSessionForAssignment
                  );
                }
              }}
              onWorkoutPresetSelected={(preset) =>
                handleAddExerciseOrPreset(
                  preset,
                  'preset',
                  selectedSessionForAssignment
                )
              }
              mode="workout-plan"
            />
          </DialogContent>
        </Dialog>
      </TooltipProvider>
    </Dialog>
  );
};

export default AddWorkoutPlanDialog;
