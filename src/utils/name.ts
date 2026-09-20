/** Find an unused numbered name, starting at one more than the existing name count. */
export function createNumberedName({
  names,
  prefix,
}: {
  names: readonly string[];
  prefix: string;
}): string {
  const existingNames = new Set(names);
  let number = names.length + 1;
  while (existingNames.has(`${prefix} ${number}`)) {
    number += 1;
  }
  return `${prefix} ${number}`;
}
