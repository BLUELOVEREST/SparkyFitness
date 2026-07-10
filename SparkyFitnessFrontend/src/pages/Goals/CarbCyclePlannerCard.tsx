import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  useApplyCarbCycleMutation,
  usePreviewCarbCycleMutation,
} from '@/hooks/Goals/useGoals';
import type { CarbCycleInput, CarbCycleWeekResult } from '@/types/goals';

type CarbCyclePlannerCardProps = {
  onPreview?: (input: CarbCycleInput) => Promise<CarbCycleWeekResult>;
  onApply?: (input: CarbCycleInput) => Promise<unknown>;
};

const DAY_TYPE_LABELS = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function CarbCyclePlannerCard({
  onPreview,
  onApply,
}: CarbCyclePlannerCardProps) {
  const previewMutation = usePreviewCarbCycleMutation();
  const applyMutation = useApplyCarbCycleMutation();
  const [form, setForm] = useState({
    weekStartDate: toDateInputValue(new Date()),
    bodyWeightKg: '70',
    carbsPerKg: '3',
    proteinPerKg: '2',
    fatPerKg: '1',
  });
  const [preview, setPreview] = useState<CarbCycleWeekResult | null>(null);
  const [previewInput, setPreviewInput] = useState<CarbCycleInput | null>(null);

  const updateForm = (nextForm: typeof form) => {
    setForm(nextForm);
    setPreview(null);
    setPreviewInput(null);
  };

  const buildInput = (): CarbCycleInput => ({
    weekStartDate: form.weekStartDate,
    bodyWeightKg: Number(form.bodyWeightKg),
    carbsPerKg: Number(form.carbsPerKg),
    proteinPerKg: Number(form.proteinPerKg),
    fatPerKg: Number(form.fatPerKg),
  });

  const handlePreview = async () => {
    const input = buildInput();
    const result = onPreview
      ? await onPreview(input)
      : await previewMutation.mutateAsync(input);
    setPreview(result);
    setPreviewInput(input);
  };

  const handleApply = async () => {
    const input = previewInput;
    if (!input) return;
    if (onApply) {
      await onApply(input);
      return;
    }
    await applyMutation.mutateAsync(input);
  };

  const isBusy = previewMutation.isPending || applyMutation.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Carb Cycle Planner</CardTitle>
        <CardDescription>
          Generate a fixed low / medium / high carb week and apply it to daily
          goals.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-5">
          <div className="space-y-1.5">
            <Label htmlFor="carb-cycle-week-start">Week Start Date</Label>
            <Input
              id="carb-cycle-week-start"
              type="date"
              value={form.weekStartDate}
              onChange={(event) =>
                updateForm({ ...form, weekStartDate: event.target.value })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="carb-cycle-body-weight">Body Weight</Label>
            <Input
              id="carb-cycle-body-weight"
              type="number"
              inputMode="decimal"
              step="0.1"
              value={form.bodyWeightKg}
              onChange={(event) =>
                updateForm({ ...form, bodyWeightKg: event.target.value })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="carb-cycle-carbs">Carbs / kg</Label>
            <Input
              id="carb-cycle-carbs"
              type="number"
              inputMode="decimal"
              step="0.1"
              value={form.carbsPerKg}
              onChange={(event) =>
                updateForm({ ...form, carbsPerKg: event.target.value })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="carb-cycle-protein">Protein / kg</Label>
            <Input
              id="carb-cycle-protein"
              type="number"
              inputMode="decimal"
              step="0.1"
              value={form.proteinPerKg}
              onChange={(event) =>
                updateForm({ ...form, proteinPerKg: event.target.value })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="carb-cycle-fat">Fat / kg</Label>
            <Input
              id="carb-cycle-fat"
              type="number"
              inputMode="decimal"
              step="0.1"
              value={form.fatPerKg}
              onChange={(event) =>
                updateForm({ ...form, fatPerKg: event.target.value })
              }
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={handlePreview} disabled={isBusy}>
            Preview
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={handleApply}
            disabled={!preview || isBusy}
          >
            Apply to Goals
          </Button>
          {preview ? (
            <span className="text-sm text-muted-foreground">
              {preview.weekTotals.calories} kcal weekly
            </span>
          ) : null}
        </div>

        {preview ? (
          <div className="grid gap-2 md:grid-cols-7">
            {preview.days.map((day) => (
              <div key={day.date} className="rounded-lg border p-3 text-sm">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="font-medium">{day.date.slice(5)}</span>
                  <Badge variant="outline">
                    {DAY_TYPE_LABELS[day.dayType]}
                  </Badge>
                </div>
                <div>{day.carbs}g C</div>
                <div>{day.protein}g P</div>
                <div>{day.fat}g F</div>
                <div className="text-muted-foreground">{day.calories} kcal</div>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
