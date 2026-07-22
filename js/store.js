// store.js — durable local storage for vocab words using IndexedDB.
// Falls back gracefully and requests persistent storage so words survive.

const DB_NAME = 'vocabmaster';
const DB_VERSION = 1;
const STORE = 'words';
const META = 'meta';

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: 'id' });
        os.createIndex('word', 'word', { unique: false });
        os.createIndex('status', 'status', { unique: false });
        os.createIndex('createdAt', 'createdAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(META)) {
        db.createObjectStore(META, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(storeName, mode) {
  return openDB().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      const already = await navigator.storage.persisted();
      if (!already) await navigator.storage.persist();
    }
  } catch (_) { /* ignore */ }
}

export function uid() {
  return 'w_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

export async function getAllWords() {
  const store = await tx(STORE, 'readonly');
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function getWord(id) {
  const store = await tx(STORE, 'readonly');
  return new Promise((resolve, reject) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function putWord(word) {
  word.updatedAt = Date.now();
  const store = await tx(STORE, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.put(word);
    req.onsuccess = () => resolve(word);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteWord(id) {
  const store = await tx(STORE, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// Create a normalized word record from partial data.
export function makeWord(data) {
  const now = Date.now();
  return {
    id: uid(),
    word: (data.word || '').trim(),
    definition: (data.definition || '').trim(),
    example: (data.example || '').trim(),
    phonetic: (data.phonetic || '').trim(),
    partOfSpeech: (data.partOfSpeech || '').trim(),
    status: 'new',       // new | learning | mastered
    correct: 0,          // total correct recalls
    wrong: 0,            // total misses
    streak: 0,           // consecutive correct
    seen: 0,             // times reviewed
    createdAt: now,
    updatedAt: now,
    source: data.source || 'manual',
  };
}

// Apply a review result and recompute mastery status.
export function applyReview(word, gotIt) {
  word.seen = (word.seen || 0) + 1;
  if (gotIt) {
    word.correct = (word.correct || 0) + 1;
    word.streak = (word.streak || 0) + 1;
  } else {
    word.wrong = (word.wrong || 0) + 1;
    word.streak = 0;
  }
  if (word.seen === 0) word.status = 'new';
  else if (word.streak >= 3) word.status = 'mastered';
  else word.status = 'learning';
  return word;
}

// De-dupe helper: does a word with this text already exist?
export async function findByWord(text) {
  const t = (text || '').trim().toLowerCase();
  if (!t) return null;
  const all = await getAllWords();
  return all.find((w) => w.word.trim().toLowerCase() === t) || null;
}

// --- Meta / streak tracking ---

export async function getMeta(key, fallback) {
  const store = await tx(META, 'readonly');
  return new Promise((resolve) => {
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : fallback);
    req.onerror = () => resolve(fallback);
  });
}

export async function setMeta(key, value) {
  const store = await tx(META, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.put({ key, value });
    req.onsuccess = () => resolve(value);
    req.onerror = () => reject(req.error);
  });
}

function dayStamp(d = new Date()) {
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}

// Record activity today and return the current streak count.
export async function touchStreak() {
  const today = dayStamp();
  const last = await getMeta('lastActiveDay', null);
  let streak = await getMeta('dayStreak', 0);
  if (last === today) return streak;
  const yest = dayStamp(new Date(Date.now() - 86400000));
  streak = last === yest ? streak + 1 : 1;
  await setMeta('lastActiveDay', today);
  await setMeta('dayStreak', streak);
  return streak;
}

export async function getStreak() {
  const today = dayStamp();
  const yest = dayStamp(new Date(Date.now() - 86400000));
  const last = await getMeta('lastActiveDay', null);
  const streak = await getMeta('dayStreak', 0);
  if (last === today || last === yest) return streak;
  return 0; // streak broken
}

// --- Backup: export / import ---

export async function exportAll() {
  const words = await getAllWords();
  return {
    app: 'VocabMaster',
    version: 1,
    exportedAt: new Date().toISOString(),
    count: words.length,
    words,
  };
}

// Import words from a backup object. Merges by word text (skips duplicates
// unless replace=true). Returns {added, skipped}.
export async function importAll(data, { replace = false } = {}) {
  if (!data || !Array.isArray(data.words)) throw new Error('Invalid backup file');
  let added = 0, skipped = 0;
  for (const w of data.words) {
    if (!w || !w.word) { skipped++; continue; }
    const existing = await findByWord(w.word);
    if (existing && !replace) { skipped++; continue; }
    const rec = existing && replace
      ? { ...existing, ...w, id: existing.id }
      : { ...makeWord(w), ...w, id: uid() };
    await putWord(rec);
    added++;
  }
  return { added, skipped };
}
