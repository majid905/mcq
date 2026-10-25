import { missingPartitions, reorganizeSql } from './partitions';

describe('missingPartitions', () => {
  const seeded = ['p2026_11', 'p2026_12', 'p2027_01', 'p2027_02', 'p2027_03', 'pmax'];

  it('adds nothing while three future months exist', () => {
    expect(missingPartitions(seeded, new Date('2026-12-10T00:00:00Z'))).toEqual([]);
  });

  it('appends only months beyond the last existing partition', () => {
    const r = missingPartitions(seeded, new Date('2027-01-20T00:00:00Z'));
    expect(r).toEqual([{ name: 'p2027_04', lessThan: '2027-05-01' }]);
  });

  it('never tries to insert below an existing bound (current month before the first partition)', () => {
    expect(missingPartitions(seeded, new Date('2026-10-25T00:00:00Z'))).toEqual([]);
  });

  it('crosses the year end', () => {
    const r = missingPartitions(['p2027_12', 'pmax'], new Date('2027-12-05T00:00:00Z'));
    expect(r.map((p) => p.name)).toEqual(['p2028_01', 'p2028_02', 'p2028_03']);
    expect(r[0]?.lessThan).toBe('2028-02-01');
  });

  it('renders the ALTER with pmax kept last', () => {
    const sql = reorganizeSql([{ name: 'p2027_04', lessThan: '2027-05-01' }]);
    expect(sql).toBe(
      "ALTER TABLE attempts REORGANIZE PARTITION pmax INTO (PARTITION p2027_04 VALUES LESS THAN ('2027-05-01'), PARTITION pmax VALUES LESS THAN (MAXVALUE))",
    );
  });
});
