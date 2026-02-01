// IndexedDB asset store for audio files

const DB_NAME = "toy-midi";
const DB_VERSION = 1;
const STORE_NAME = "assets";

export interface StoredAsset {
  key: string;
  blob: Blob;
  name: string;
  size: number;
  type: string;
  addedAt: number; // timestamp
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onblocked = () => {
      console.warn("IndexedDB blocked - close other tabs?");
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
  });

  return dbPromise;
}

// Generate a simple hash key from file name + size + last modified
function generateAssetKey(file: File): string {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

export async function saveAsset(file: File): Promise<string> {
  const db = await openDB();
  const key = generateAssetKey(file);

  const asset: StoredAsset = {
    key,
    blob: file,
    name: file.name,
    size: file.size,
    type: file.type,
    addedAt: Date.now(),
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(asset);

    request.onsuccess = () => resolve(key);
    request.onerror = () => reject(request.error);
  });
}

export async function loadAsset(key: string): Promise<StoredAsset | null> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(key);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteAsset(key: string): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(key);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
