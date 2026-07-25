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

// Normalize a meanings array; build one from a single definition if needed.
function normalizeMeanings(data) {
  if (Array.isArray(data.meanings) && data.meanings.length) {
    return data.meanings.map((m) => ({
      partOfSpeech: (m.partOfSpeech || '').trim(),
      definition: (m.definition || '').trim(),
      example: (m.example || '').trim(),
    }));
  }
  if ((data.definition || '').trim()) {
    return [{
      partOfSpeech: (data.partOfSpeech || '').trim(),
      definition: (data.definition || '').trim(),
      example: (data.example || '').trim(),
    }];
  }
  return [];
}

// Create a normalized word record from partial data.
export function makeWord(data) {
  const now = Date.now();
  const meanings = normalizeMeanings(data);
  const primary = meanings[0] || { definition: '', example: '', partOfSpeech: '' };
  return {
    id: uid(),
    word: (data.word || '').trim(),
    meanings,                              // [{partOfSpeech, definition, example}]
    definition: primary.definition,        // primary — used for search & quizzes
    example: primary.example,
    partOfSpeech: primary.partOfSpeech,
    phonetic: (data.phonetic || '').trim(),
    audio: (data.audio || '').trim(),
    status: 'new',       // new | struggling | learning | mastered
    favorite: !!data.favorite,
    folders: Array.isArray(data.folders) ? [...data.folders] : [],
    correct: 0,          // total correct recalls
    wrong: 0,            // total misses
    streak: 0,           // consecutive correct
    seen: 0,             // times reviewed
    createdAt: now,
    updatedAt: now,
    source: data.source || 'manual',
  };
}

// Ensure an older record has the fields the current UI expects.
export function upgradeWord(w) {
  if (!Array.isArray(w.meanings) || !w.meanings.length) {
    w.meanings = normalizeMeanings(w);
  }
  if (w.favorite === undefined) w.favorite = false;
  if (!Array.isArray(w.folders)) w.folders = [];
  const primary = w.meanings[0];
  if (primary) {
    w.definition = w.definition || primary.definition;
    w.example = w.example || primary.example;
    w.partOfSpeech = w.partOfSpeech || primary.partOfSpeech;
  }
  return w;
}

// Apply a swipe/quiz result and recompute mastery status.
// gotIt = true  -> "I know it"  (progress toward mastered)
// gotIt = false -> "struggling" (mark as hard)
export function applyReview(word, gotIt) {
  word.seen = (word.seen || 0) + 1;
  if (gotIt) {
    word.correct = (word.correct || 0) + 1;
    word.streak = (word.streak || 0) + 1;
    word.status = word.streak >= 3 ? 'mastered' : 'learning';
  } else {
    word.wrong = (word.wrong || 0) + 1;
    word.streak = 0;
    word.status = 'struggling';
  }
  return word;
}

// Manually rank a word. rank: 'struggling' | 'learning' | 'mastered'.
export function setRank(word, rank) {
  word.status = rank;
  if (rank === 'mastered') word.streak = Math.max(word.streak || 0, 3);
  else if (rank === 'learning') word.streak = Math.min(word.streak || 0, 2) || 1;
  else if (rank === 'struggling') word.streak = 0;
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

  // Track which days had activity (keep the last ~40 for the week strip).
  let active = await getMeta('activeDays', []);
  if (!active.includes(today)) {
    active = [...active, today].slice(-40);
    await setMeta('activeDays', active);
  }

  if (last === today) return streak;
  const yest = dayStamp(new Date(Date.now() - 86400000));
  streak = last === yest ? streak + 1 : 1;
  await setMeta('lastActiveDay', today);
  await setMeta('dayStreak', streak);
  return streak;
}

export async function getActiveDays() {
  return getMeta('activeDays', []);
}

// --- Folders (tag-style: a word may belong to several) ---

export async function getFolders() {
  return getMeta('folders', []);
}
export async function saveFolders(folders) {
  return setMeta('folders', folders);
}
export async function addFolder(name) {
  const folders = await getFolders();
  const folder = { id: 'f_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: name.trim(), createdAt: Date.now() };
  folders.push(folder);
  await saveFolders(folders);
  return folder;
}
export async function renameFolder(id, name) {
  const folders = await getFolders();
  const f = folders.find((x) => x.id === id);
  if (f) { f.name = name.trim(); await saveFolders(folders); }
  return f;
}
// Remove a folder and strip it from every word.
export async function deleteFolder(id) {
  const folders = (await getFolders()).filter((f) => f.id !== id);
  await saveFolders(folders);
  const words = await getAllWords();
  for (const w of words) {
    if (Array.isArray(w.folders) && w.folders.includes(id)) {
      w.folders = w.folders.filter((x) => x !== id);
      await putWord(w);
    }
  }
  return folders;
}

export { dayStamp };

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
