import { fireEvent, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CarbCyclePlannerCard } from '@/pages/Goals/CarbCyclePlannerCard';
import { renderWithClient } from '@/tests/test-utils';

describe('CarbCyclePlannerCard', () => {
  it('previews and applies a carb cycle week', async () => {
    const onPreview = jest.fn().mockResolvedValue({
      weekStartDate: '2026-07-06',
      weekTotals: { calories: 14210, carbs: 1470, protein: 980, fat: 490 },
      days: [
        {
          date: '2026-07-06',
          dayType: 'low',
          calories: 2104,
          carbs: 110.25,
          protein: 140,
          fat: 122.5,
          trainingSlot: 'rest',
          meals: [
            {
              slotKey: 'morning',
              label: 'Breakfast',
              calories: 526,
              carbs: 27.6,
              protein: 35,
              fat: 30.6,
            },
          ],
        },
        {
          date: '2026-07-07',
          dayType: 'medium',
          calories: 1761,
          carbs: 171.5,
          protein: 140,
          fat: 57.17,
          trainingSlot: 'rest',
          meals: [],
        },
        {
          date: '2026-07-09',
          dayType: 'high',
          calories: 2361,
          carbs: 367.5,
          protein: 140,
          fat: 36.75,
          trainingSlot: 'rest',
          meals: [],
        },
      ],
    });
    const onApply = jest.fn().mockResolvedValue(undefined);

    renderWithClient(
      <CarbCyclePlannerCard onPreview={onPreview} onApply={onApply} />
    );

    fireEvent.change(screen.getByLabelText(/week start date/i), {
      target: { value: '2026-07-06' },
    });
    fireEvent.change(screen.getByLabelText(/body weight/i), {
      target: { value: '70' },
    });
    fireEvent.click(screen.getByRole('button', { name: /preview/i }));

    await waitFor(() => expect(onPreview).toHaveBeenCalled());
    expect(await screen.findByText(/high/i)).toBeInTheDocument();
    expect(screen.getByText(/367.5g C/i)).toBeInTheDocument();
    expect(screen.getByText(/Breakfast/i)).toBeInTheDocument();
    expect(screen.getByText(/27.6C \/ 35P \/ 30.6F/i)).toBeInTheDocument();
    expect(screen.getByText(/14210 kcal weekly/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/body weight/i), {
      target: { value: '80' },
    });
    expect(
      screen.getByRole('button', { name: /apply to goals/i })
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /preview/i }));
    await waitFor(() => expect(onPreview).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: /apply to goals/i }));
    await waitFor(() => expect(onApply).toHaveBeenCalled());
    expect(onApply).toHaveBeenCalledWith({
      weekStartDate: '2026-07-06',
      bodyWeightKg: 80,
      carbsPerKg: 3,
      proteinPerKg: 2,
      fatPerKg: 1,
      trainingSlots: ['rest', 'rest', 'rest', 'rest', 'rest', 'rest', 'rest'],
    });
  });
});
