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

/** Use the base name when available, otherwise find the first unused suffix from 2. */
export function createAvailableName({
  names,
  baseName,
}: {
  names: readonly string[];
  baseName: string;
}): string {
  const existingNames = new Set(names);
  let name = baseName;
  for (let suffix = 2; existingNames.has(name); suffix++) {
    name = `${baseName} ${suffix}`;
  }
  return name;
}
