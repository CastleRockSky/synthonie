// A tiny promise wrapper over IndexedDB, used for autosave (it can hold binary data).

const DB_NAME = 'zeke-synth';
const STORE = 'kv';

let dbPromise: Promise<IDBDatabase> | undefined;

function db(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(d.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const kvGet = <T>(key: string): Promise<T | undefined> =>
  run('readonly', (s) => s.get(key) as IDBRequest<T | undefined>);
export const kvSet = (key: string, value: unknown): Promise<IDBValidKey> => run('readwrite', (s) => s.put(value, key));
export const kvDel = (key: string): Promise<undefined> => run('readwrite', (s) => s.delete(key));
export const kvKeys = (): Promise<IDBValidKey[]> => run('readonly', (s) => s.getAllKeys());
