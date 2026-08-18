import { beforeEach, describe, expect, it, vi } from 'vitest';
import measurementRepository from '../models/measurementRepository.js';
import measurementService from '../services/measurementService.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';

vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn(),
}));
vi.mock('../models/measurementRepository');
vi.mock('../models/userRepository');
vi.mock('../models/exerciseRepository');
vi.mock('../models/exerciseEntry');
vi.mock('../models/sleepRepository');
vi.mock('../models/waterContainerRepository');
vi.mock('../models/activityDetailsRepository');

describe('processHealthData body_circumference smart tape ingestion', () => {
  const userId = 'user-123';
  const actingUserId = 'user-123';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadUserTimezone).mockResolvedValue('UTC');
    measurementRepository.getCustomCategories = vi.fn().mockResolvedValue([]);
    measurementRepository.createCustomCategory = vi
      .fn()
      .mockResolvedValue({ id: 'cat-chest' });
    measurementRepository.bulkUpsertCustomMeasurements = vi
      .fn()
      .mockResolvedValue([{ id: 'custom-entry-1' }]);
    measurementRepository.bulkUpsertCheckInMeasurements = vi
      .fn()
      .mockResolvedValue([{ id: 'checkin-1' }]);
  });

  it('routes built-in circumference parts to check-in measurements', async () => {
    const result = await measurementService.processHealthData(
      [
        {
          type: 'body_circumference',
          part: 'waist',
          value: 82.4,
          unit: 'cm',
          date: '2026-08-18',
          source: 'smart_tape',
        },
      ],
      userId,
      actingUserId
    );

    expect(result.errors).toEqual([]);
    expect(
      measurementRepository.bulkUpsertCheckInMeasurements
    ).toHaveBeenCalledWith(userId, actingUserId, [
      { entryDate: '2026-08-18', measurements: { waist: 82.4 } },
    ]);
    expect(measurementRepository.createCustomCategory).not.toHaveBeenCalled();
    expect(
      measurementRepository.bulkUpsertCustomMeasurements
    ).not.toHaveBeenCalled();
  });

  it('routes extra standard circumference parts to check-in measurements', async () => {
    const result = await measurementService.processHealthData(
      [
        {
          type: 'body_circumference',
          part: 'abdomen',
          value: 88.2,
          unit: 'cm',
          date: '2026-08-18',
          source: 'smart_tape',
        },
      ],
      userId,
      actingUserId
    );

    expect(result.errors).toEqual([]);
    expect(
      measurementRepository.bulkUpsertCheckInMeasurements
    ).toHaveBeenCalledWith(userId, actingUserId, [
      { entryDate: '2026-08-18', measurements: { abdomen: 88.2 } },
    ]);
    expect(measurementRepository.createCustomCategory).not.toHaveBeenCalled();
    expect(
      measurementRepository.bulkUpsertCustomMeasurements
    ).not.toHaveBeenCalled();
  });

  it('normalizes inch circumference readings to centimeters', async () => {
    await measurementService.processHealthData(
      [
        {
          type: 'BodyCircumference',
          part: 'right_biceps',
          value: 14,
          measurementType: 'in',
          date: '2026-08-18',
          source: 'smart_tape',
        },
      ],
      userId,
      actingUserId
    );

    expect(
      measurementRepository.bulkUpsertCheckInMeasurements
    ).toHaveBeenCalledWith(userId, actingUserId, [
      { entryDate: '2026-08-18', measurements: { right_biceps: 35.56 } },
    ]);
    expect(
      measurementRepository.bulkUpsertCustomMeasurements
    ).not.toHaveBeenCalled();
  });

  it('accepts direct built-in circumference field types from imports', async () => {
    await measurementService.processHealthData(
      [
        {
          type: 'shoulders',
          value: 112.3,
          unit: 'cm',
          date: '2026-08-18',
          source: 'CSV_Import',
        },
      ],
      userId,
      actingUserId
    );

    expect(
      measurementRepository.bulkUpsertCheckInMeasurements
    ).toHaveBeenCalledWith(userId, actingUserId, [
      { entryDate: '2026-08-18', measurements: { shoulders: 112.3 } },
    ]);
    expect(measurementRepository.createCustomCategory).not.toHaveBeenCalled();
  });

  it('rejects unknown circumference parts without writing anything', async () => {
    const result = await measurementService.processHealthData(
      [
        {
          type: 'body_circumference',
          part: 'wrist',
          value: 18,
          unit: 'cm',
          date: '2026-08-18',
          source: 'smart_tape',
        },
      ],
      userId,
      actingUserId
    );

    expect(result.processed).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toContain(
      'Unsupported body circumference part'
    );
    expect(
      measurementRepository.bulkUpsertCheckInMeasurements
    ).not.toHaveBeenCalled();
    expect(
      measurementRepository.bulkUpsertCustomMeasurements
    ).not.toHaveBeenCalled();
  });
});
