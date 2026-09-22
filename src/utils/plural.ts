export function plural({
  count,
  singular,
  plural = `${singular}s`,
}: {
  count: number;
  singular: string;
  plural?: string;
}): string {
  return count === 1 ? singular : plural;
}
