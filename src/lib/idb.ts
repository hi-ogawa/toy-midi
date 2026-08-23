// Generic promise wrapper for a single IndexedDB object store.
export class IdbStore<T> {
  private dbPromise: Promise<IDBDatabase> | undefined;

  constructor(
    private options: {
      dbName: string;
      storeName: string;
      version: number;
      keyPath: string;
      storeNames?: string[];
    },
  ) {}

  async get(key: string): Promise<T | undefined> {
    return await this.request("readonly", (store) => store.get(key));
  }

  async put(value: T): Promise<void> {
    await this.request("readwrite", (store) => store.put(value));
  }

  async delete(key: string): Promise<void> {
    await this.request("readwrite", (store) => store.delete(key));
  }

  async getAll(): Promise<T[]> {
    return await this.request("readonly", (store) => store.getAll());
  }

  private openDB(): Promise<IDBDatabase> {
    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.options.dbName, this.options.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onblocked = () => {
        console.warn("IndexedDB blocked - close other tabs?");
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const storeNames = this.options.storeNames ?? [this.options.storeName];
        for (const storeName of storeNames) {
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName, { keyPath: this.options.keyPath });
          }
        }
      };
    });

    return this.dbPromise;
  }

  private async request<R>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest<R>,
  ): Promise<R> {
    const db = await this.openDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.options.storeName, mode);
      const request = run(tx.objectStore(this.options.storeName));

      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
}
