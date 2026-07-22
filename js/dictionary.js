// dictionary.js — auto-define words using the free dictionaryapi.dev service.
// No API key required. Needs internet; fails soft so the app still works offline.

const ENDPOINT = 'https://api.dictionaryapi.dev/api/v2/entries/en/';

// Returns { definition, example, phonetic, partOfSpeech } or null if not found.
export async function lookup(word) {
  const term = (word || '').trim();
  if (!term) return null;
  try {
    const res = await fetch(ENDPOINT + encodeURIComponent(term.toLowerCase()));
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) return null;

    const entry = data[0];
    const phonetic = entry.phonetic
      || (entry.phonetics || []).map((p) => p.text).find(Boolean)
      || '';

    let definition = '', example = '', partOfSpeech = '';
    for (const m of entry.meanings || []) {
      for (const d of m.definitions || []) {
        if (d.definition) {
          definition = d.definition;
          partOfSpeech = m.partOfSpeech || '';
          if (d.example) example = d.example;
          break;
        }
      }
      if (definition) break;
    }
    if (!definition) return null;
    return { definition, example, phonetic, partOfSpeech };
  } catch (_) {
    return null; // offline or blocked — caller keeps the word without a definition
  }
}

// Fill in definitions for a batch of entries that are missing one.
// entries: [{word, definition, ...}]. Mutates and returns them.
// onProgress(done, total) is called as it goes.
export async function autoDefineMissing(entries, onProgress) {
  const targets = entries.filter((e) => e.word && !e.definition);
  let done = 0;
  for (const e of targets) {
    const info = await lookup(e.word);
    if (info) {
      e.definition = info.definition;
      if (!e.example) e.example = info.example;
      if (!e.phonetic) e.phonetic = info.phonetic;
      if (!e.partOfSpeech) e.partOfSpeech = info.partOfSpeech;
    }
    done++;
    if (onProgress) onProgress(done, targets.length);
  }
  return entries;
}
