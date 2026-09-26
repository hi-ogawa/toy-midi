// Storage protection and estimates apply to this site's origin, including existing projects.
export async function readStoragePersistence(): Promise<boolean | undefined> {
  if (!navigator.storage?.persisted || !navigator.storage.persist) {
    return undefined;
  }
  return navigator.storage.persisted();
}

export async function readStorageEstimate(): Promise<
  StorageEstimate | undefined
> {
  return navigator.storage?.estimate?.();
}

export async function requestStoragePersistence(): Promise<boolean> {
  return navigator.storage.persist();
}
