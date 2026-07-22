// dictionary.js — auto-define words using the free dictionaryapi.dev service.
// No API key required. Captures EVERY part of speech (noun, verb, adjective…)
// with a definition and example sentence. Fails soft when offline.

const ENDPOINT = 'https://api.dictionaryapi.dev/api/v2/entries/en/';

// Returns { phonetic, audio, meanings:[{partOfSpeech, definition, example}] }
// or null if nothing was found. One meaning per part of speech.
export async function lookup(word) {
  const term = (word || '').trim();
  if (!term) return null;
  try {
    const res = await fetch(ENDPOINT + encodeURIComponent(term.toLowerCase()));
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) return null;

    let phonetic = '';
    let audio = '';
    const byPos = new Map(); // partOfSpeech -> {partOfSpeech, definition, example}

    for (const entry of data) {
      if (!phonetic && entry.phonetic) phonetic = entry.phonetic;
      for (const p of entry.phonetics || []) {
        if (!phonetic && p.text) phonetic = p.text;
        if (!audio && p.audio) audio = p.audio;
      }
      for (const m of entry.meanings || []) {
        const pos = m.partOfSpeech || '';
        if (byPos.has(pos)) continue; // first sense of each part of speech
        const def = (m.definitions || []).find((d) => d.definition);
        if (!def) continue;
        byPos.set(pos, {
          partOfSpeech: pos,
          definition: def.definition,
          example: def.example || '',
        });
      }
    }

    const meanings = [...byPos.values()];
    if (!meanings.length) return null;
    if (audio && audio.startsWith('//')) audio = 'https:' + audio;
    return { phonetic, audio, meanings };
  } catch (_) {
    return null; // offline / blocked — caller keeps the word without definitions
  }
}

// Short label for a part of speech, e.g. "noun" -> "n."
export function posShort(pos) {
  const map = {
    noun: 'n.', verb: 'v.', adjective: 'adj.', adverb: 'adv.',
    pronoun: 'pron.', preposition: 'prep.', conjunction: 'conj.',
    interjection: 'interj.', determiner: 'det.', numeral: 'num.',
  };
  return map[(pos || '').toLowerCase()] || (pos ? pos + '.' : '');
}

// Fill in meanings for a batch of entries that are missing them.
// entries: [{word, definition?, meanings?}]. Mutates and returns them.
// onProgress(done, total) is called as it goes.
export async function autoDefineMissing(entries, onProgress) {
  const targets = entries.filter((e) => e.word && !hasMeanings(e));
  let done = 0;
  for (const e of targets) {
    const info = await lookup(e.word);
    if (info) {
      // If the user already typed a definition, keep it as the first meaning
      // and append the dictionary's other parts of speech.
      if (e.definition && !e.meanings) {
        e.meanings = [{ partOfSpeech: e.partOfSpeech || '', definition: e.definition, example: e.example || '' }];
        for (const m of info.meanings) {
          if (!e.meanings.some((x) => x.partOfSpeech === m.partOfSpeech)) e.meanings.push(m);
        }
      } else {
        e.meanings = info.meanings;
      }
      e.phonetic = e.phonetic || info.phonetic;
      e.audio = e.audio || info.audio;
      // primary fields for search / quiz
      e.definition = e.meanings[0].definition;
      e.example = e.meanings[0].example;
      e.partOfSpeech = e.meanings[0].partOfSpeech;
    }
    done++;
    if (onProgress) onProgress(done, targets.length);
  }
  return entries;
}

function hasMeanings(e) {
  return (Array.isArray(e.meanings) && e.meanings.length) || !!e.definition;
}
