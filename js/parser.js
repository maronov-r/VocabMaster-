// parser.js — turn raw OCR text into candidate {word, definition} entries.
// Handles a MIX of formats: bare highlighted words, and "word: definition"
// / "word - definition" glossary lines. The result is always shown to the
// user for editing, so heuristics only need to be reasonable, not perfect.

// Separators that divide a term from its definition on one line.
const SEP_RE = /\s*[:–—\-→=]\s+|\t+|\s{3,}/; // colon, en/em dash, hyphen, arrow, tab, big gap
const POS_RE = /\((?:n|v|adj|adv|prep|conj|pron|interj|noun|verb|adjective|adverb)\.?\)/i;

function cleanLine(line) {
  return line
    .replace(/^[\s•\-\*•●▪\d\.\)\]]+/, '') // leading bullets / numbering
    .replace(/\s+/g, ' ')
    .trim();
}

function looksLikeTerm(text) {
  const t = text.trim();
  if (!t) return false;
  const words = t.split(/\s+/);
  // A term is short (1–3 words) and mostly letters.
  if (words.length > 3) return false;
  return /[A-Za-z]/.test(t) && !/[.!?]$/.test(t);
}

// Lines that read like the continuation/definition of the word above them:
// they start lowercase, or with an article/function word a highlighted term
// would rarely begin with.
const DEF_LEAD_RE = /^(a|an|the|to|of|in|for|used|having|relating|characterized|being|not|when|someone|something|marked)\b/i;
function looksLikeDefinition(text) {
  const t = text.trim();
  if (!t) return false;
  const multiWord = /\s/.test(t);
  // A phrase that starts lowercase reads like a definition; a lone lowercase
  // word is more likely just the next item in a highlighted word list.
  if (multiWord && /^[a-z]/.test(t)) return true;
  return DEF_LEAD_RE.test(t);
}

// Split one line into {word, definition} if it contains a separator.
function splitLine(line) {
  const m = line.match(SEP_RE);
  if (!m) return null;
  const idx = line.indexOf(m[0]);
  const left = cleanLine(line.slice(0, idx));
  const right = line.slice(idx + m[0].length).trim();
  if (!left || !right) return null;
  if (!looksLikeTerm(left)) return null;
  return { word: left.replace(POS_RE, '').trim(), definition: right, source: 'ocr' };
}

export function parseText(raw) {
  if (!raw) return [];
  const lines = raw
    .split(/\r?\n/)
    .map(cleanLine)
    .filter(Boolean);

  const entries = [];
  let pending = null; // a word awaiting a definition on following line(s)

  const flushPending = () => {
    if (pending) { entries.push(pending); pending = null; }
  };

  for (const line of lines) {
    const split = splitLine(line);
    if (split) {
      flushPending();
      entries.push(split);
      continue;
    }

    // A short line right after a bare term that reads like a definition
    // belongs to that term, not a new one.
    if (pending && !pending.definition && looksLikeDefinition(line)) {
      pending.definition = line;
      flushPending();
      continue;
    }

    if (looksLikeTerm(line)) {
      // A standalone term. Keep it pending in case the next line defines it.
      flushPending();
      pending = { word: line.replace(POS_RE, '').trim(), definition: '', source: 'ocr' };
      continue;
    }

    // A longer prose line with no separator.
    if (pending) {
      // Treat it as the definition of the pending term.
      pending.definition = line;
      flushPending();
    } else {
      // Orphan prose — could be a highlighted phrase worth keeping as a term.
      entries.push({ word: line, definition: '', source: 'ocr' });
    }
  }
  flushPending();

  // De-dupe by lowercased word, keep the one that has a definition.
  const map = new Map();
  for (const e of entries) {
    const key = e.word.toLowerCase();
    if (!key) continue;
    const prev = map.get(key);
    if (!prev || (!prev.definition && e.definition)) map.set(key, e);
  }
  return [...map.values()];
}
