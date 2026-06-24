/**
 * IndexedDB wrapper module.
 * Usage:
 *   import { openDB } from './db.js';
 *   const db = await openDB();
 *   await db.put('exercises', { id: 'bench-press', name: 'Bench Press', ... });
 *   const exercise = await db.get('exercises', 'bench-press');
 */

const DB_NAME = 'strength-tracker';
const DB_VERSION = 1;

const STORES = {
  exercises: { keyPath: 'id', indexes: [{ name: 'byPattern', keyPath: 'pattern' }, { name: 'byEquipment', keyPath: 'equipment' }] },
  muscles: { keyPath: 'id' },
  landmarks: { keyPath: 'muscleId' },
  programs: { keyPath: 'id' },
  sets: { keyPath: 'id', indexes: [{ name: 'byDate', keyPath: 'date' }, { name: 'byExercise', keyPath: 'exerciseId' }, { name: 'byProgram', keyPath: 'programId' }] },
  metrics: { keyPath: 'id', indexes: [{ name: 'byDate', keyPath: 'date' }, { name: 'byType', keyPath: 'type' }] },
};

function upgrade(db) {
  for (const [name, config] of Object.entries(STORES)) {
    if (!db.objectStoreNames.contains(name)) {
      const store = db.createObjectStore(name, { keyPath: config.keyPath });
      if (config.indexes) {
        for (const idx of config.indexes) {
          store.createIndex(idx.name, idx.keyPath, { unique: false });
        }
      }
    }
  }
}

function promisify(requestOrTx) {
  return new Promise((resolve, reject) => {
    if (requestOrTx instanceof IDBTransaction) {
      requestOrTx.oncomplete = () => resolve();
      requestOrTx.onerror = () => reject(requestOrTx.error);
      requestOrTx.onabort = () => reject(requestOrTx.error ?? new Error('Transaction aborted'));
    } else {
      requestOrTx.onsuccess = () => resolve(requestOrTx.result);
      requestOrTx.onerror = () => reject(requestOrTx.error);
    }
  });
}

function wrapDB(idb) {
  return {
    /** Get a single record by key. */
    get(storeName, key) {
      const tx = idb.transaction(storeName, 'readonly');
      return promisify(tx.objectStore(storeName).get(key));
    },

    /** Get all records in a store. */
    getAll(storeName) {
      const tx = idb.transaction(storeName, 'readonly');
      return promisify(tx.objectStore(storeName).getAll());
    },

    /** Get all records matching an index value. */
    getAllByIndex(storeName, indexName, value) {
      const tx = idb.transaction(storeName, 'readonly');
      const index = tx.objectStore(storeName).index(indexName);
      return promisify(index.getAll(value));
    },

    /** Get all records within an index range. */
    getAllByRange(storeName, indexName, lower, upper) {
      const tx = idb.transaction(storeName, 'readonly');
      const index = tx.objectStore(storeName).index(indexName);
      const range = IDBKeyRange.bound(lower, upper);
      return promisify(index.getAll(range));
    },

    /** Put (insert or update) a record. */
    put(storeName, record) {
      const tx = idb.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.put(record);
      return promisify(tx);
    },

    /** Put multiple records in a single transaction. */
    putAll(storeName, records) {
      const tx = idb.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      for (const record of records) {
        store.put(record);
      }
      return promisify(tx);
    },

    /** Delete a record by key. */
    delete(storeName, key) {
      const tx = idb.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).delete(key);
      return promisify(tx);
    },

    /** Clear all records in a store. */
    clear(storeName) {
      const tx = idb.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).clear();
      return promisify(tx);
    },

    /** Export all stores as JSON. */
    async exportAll() {
      const data = {};
      for (const name of Object.keys(STORES)) {
        data[name] = await this.getAll(name);
      }
      return data;
    },

    /** Import JSON data into stores, replacing existing data. */
    async importAll(data) {
      for (const [name, records] of Object.entries(data)) {
        if (STORES[name] && Array.isArray(records)) {
          await this.clear(name);
          await this.putAll(name, records);
        }
      }
    },

    /** Close the database connection. */
    close() {
      idb.close();
    },
  };
}

export function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => upgrade(request.result);
    request.onsuccess = () => resolve(wrapDB(request.result));
    request.onerror = () => reject(request.error);
  });
}
