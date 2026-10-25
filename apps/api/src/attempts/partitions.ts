/** Monthly RANGE partitions on `attempts` (docs/03 section 4). Names are `pYYYY_MM`, bounds are UTC. */
export const partitionName = (year: number, month: number) =>
  `p${year}_${String(month).padStart(2, '0')}`;

const bound = (year: number, month: number) => {
  const d = new Date(Date.UTC(year, month, 1)); // month is 1-based, so this is the NEXT month
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
};

/** Partitions to add so the current month and `monthsAhead` more exist. Oldest first. */
export function missingPartitions(
  existing: string[],
  now: Date,
  monthsAhead = 3,
): { name: string; lessThan: string }[] {
  // REORGANIZE pmax can only append: bounds must stay above the last real partition.
  const last =
    existing
      .filter((n) => /^p\d{4}_\d{2}$/.test(n))
      .sort()
      .pop() ?? '';
  const have = new Set(existing);
  const out: { name: string; lessThan: string }[] = [];
  for (let i = 0; i <= monthsAhead; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth() + 1;
    const name = partitionName(year, month);
    if (!have.has(name) && name > last) out.push({ name, lessThan: bound(year, month) });
  }
  return out;
}

/** The ALTER that splits the catch-all partition. Identifiers come from `partitionName`, never user input. */
export function reorganizeSql(parts: { name: string; lessThan: string }[]): string {
  const list = parts.map((p) => `PARTITION ${p.name} VALUES LESS THAN ('${p.lessThan}')`);
  list.push('PARTITION pmax VALUES LESS THAN (MAXVALUE)');
  return `ALTER TABLE attempts REORGANIZE PARTITION pmax INTO (${list.join(', ')})`;
}
