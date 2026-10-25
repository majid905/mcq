import { dhakaMonthStart } from './dhaka-time';

describe('dhakaMonthStart', () => {
  it('is Dhaka midnight of the 1st, expressed in UTC', () => {
    expect(dhakaMonthStart(new Date('2026-10-25T10:00:00Z')).toISOString()).toBe(
      '2026-09-30T18:00:00.000Z',
    );
  });

  it('rolls into the next Dhaka month when UTC is still the previous day', () => {
    // 2026-10-31 20:00 UTC is already 2026-11-01 02:00 in Dhaka.
    expect(dhakaMonthStart(new Date('2026-10-31T20:00:00Z')).toISOString()).toBe(
      '2026-10-31T18:00:00.000Z',
    );
  });

  it('shifts by months and across the year end', () => {
    expect(dhakaMonthStart(new Date('2026-12-15T00:00:00Z'), 1).toISOString()).toBe(
      '2026-12-31T18:00:00.000Z',
    );
  });
});
