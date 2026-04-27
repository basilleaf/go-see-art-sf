export function sortExhibitions<T extends { startDate: string | null; endDate: string | null }>(
  rows: T[],
  today: string,
): T[] {
  const current = rows
    .filter((ex) => !ex.startDate || ex.startDate <= today)
    .sort((a, b) => {
      if (!a.endDate && !b.endDate) return 0;
      if (!a.endDate) return 1;
      if (!b.endDate) return -1;
      return a.endDate.localeCompare(b.endDate);
    });

  const upcoming = rows
    .filter((ex) => ex.startDate && ex.startDate > today)
    .sort((a, b) => a.startDate!.localeCompare(b.startDate!));

  return [...current, ...upcoming];
}
