import { isOpenGymOwned } from '@/utils/openGymSource';
describe('openGym authority', () => {
  it('locks source-owned entries and exercises', () => {
    expect(isOpenGymOwned({ source: 'opengym' })).toBe(true);
    expect(isOpenGymOwned({ exercise_snapshot: { source: 'opengym' } })).toBe(
      true
    );
  });
  it('preserves manual and Hevy behavior', () => {
    expect(isOpenGymOwned({ source: 'manual' })).toBe(false);
    expect(isOpenGymOwned({ source: 'hevy' })).toBe(false);
    expect(
      isOpenGymOwned({
        source: 'manual',
        exercise_snapshot: { source: 'opengym' },
      })
    ).toBe(false);
  });
});
