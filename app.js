// app.js — VocabMaster main controller (vanilla ES modules, no build step).
import {
  getAllWords, putWord, deleteWord, makeWord, applyReview, findByWord,
  requestPersistence, getStreak, touchStreak, exportAll, importAll,
} from './js/store.js';
import { recognize } from './js/ocr.js';
import { parseText } from './js/parser.js';
import { lookup, autoDefineMissing } from './js/dictionary.js';
import { burst } from './js/confetti.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const state = {
  words: [],
  view: 'review',
  reviewQueue: [],
  library: { search: '', filter: 'all' },
  quiz: { mode: null, questions: [], index: 0, score: 0 },
  pendingEntries: [],
};

// ---------- boot ----------
async function init() {
  registerSW();
  requestPersistence();
  state.words = await getAllWords();
  await refreshStreak();
  wireNav();
  wireReview();
  wireLibrary();
  wireUpload();
  wireQuiz();
  wireMenu();
  switchView('review');
}

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

async function refreshStreak() {
  const s = await getStreak();
  $('#streakCount').textContent = s;
}

// ---------- navigation ----------
function wireNav() {
  $$('#tabbar .tab').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
  $$('[data-goto]').forEach((el) => {
    el.addEventListener('click', () => switchView(el.dataset.goto));
  });
}

function switchView(view) {
  state.view = view;
  $$('.view').forEach((v) => v.classList.toggle('hidden', v.dataset.view !== view));
  $$('#tabbar .tab').forEach((t) => t.classList.toggle('active', t.dataset.view === view));
  window.scrollTo(0, 0);
  if (view === 'review') startReviewSession();
  if (view === 'library') renderLibrary();
  if (view === 'quiz') resetQuizPicker();
  if (view === 'upload') resetUpload();
}

// ---------- toast ----------
let toastTimer;
function toast(msg, ms = 2200) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.classList.add('hidden'), 300);
  }, ms);
}

// ================= REVIEW / SWIPE =================
function wireReview() {
  $('#btnMiss').addEventListener('click', () => resolveTop(false));
  $('#btnGot').addEventListener('click', () => resolveTop(true));
  $('#btnFlip').addEventListener('click', () => {
    const card = $('.flashcard.top');
    if (card) card.classList.toggle('flipped');
  });
}

function buildReviewQueue() {
  const rank = (w) => (w.status === 'new' ? 0 : w.status === 'learning' ? 1 : 2);
  const shuffled = [...state.words].sort(() => Math.random() - 0.5);
  return shuffled.sort((a, b) => rank(a) - rank(b));
}

function startReviewSession() {
  state.reviewQueue = buildReviewQueue();
  renderDeck();
}

function renderDeck() {
  const area = $('#deckArea');
  const empty = $('#reviewEmpty');
  const controls = $('#swipeControls');
  area.innerHTML = '';

  if (!state.words.length) {
    empty.classList.remove('hidden');
    empty.querySelector('h2').textContent = 'No cards yet';
    empty.querySelector('p').textContent = 'Upload a screenshot of highlighted words to build your first deck.';
    controls.classList.add('hidden');
    return;
  }
  if (!state.reviewQueue.length) {
    empty.classList.remove('hidden');
    empty.querySelector('h2').textContent = 'All caught up!';
    empty.querySelector('p').textContent = "You've reviewed every card. Take a quiz or add more words.";
    controls.classList.add('hidden');
    return;
  }
  empty.classList.add('hidden');
  controls.classList.remove('hidden');

  const top3 = state.reviewQueue.slice(0, 3).reverse(); // back-most first
  top3.forEach((w, i) => {
    const isTop = i === top3.length - 1;
    area.appendChild(makeCard(w, isTop, top3.length - 1 - i));
  });
  $('#reviewSub').textContent = `${state.reviewQueue.length} card${state.reviewQueue.length > 1 ? 's' : ''} to go`;
}

const STATUS_LABEL = { new: '✨ New', learning: '📚 Learning', mastered: '🏆 Mastered' };

function makeCard(w, isTop, depth) {
  const card = document.createElement('div');
  card.className = 'flashcard' + (isTop ? ' top' : '');
  card.style.setProperty('--depth', depth);
  card.innerHTML = `
    <div class="card-inner">
      <div class="card-face card-front">
        <div class="card-tag ${w.status}">${STATUS_LABEL[w.status] || ''}</div>
        <div class="card-word">${escapeHTML(w.word)}</div>
        ${w.phonetic ? `<div class="card-phonetic">${escapeHTML(w.phonetic)}</div>` : ''}
        ${w.partOfSpeech ? `<div class="card-pos">${escapeHTML(w.partOfSpeech)}</div>` : ''}
        <div class="card-hint">tap to flip</div>
      </div>
      <div class="card-face card-back">
        <div class="card-def">${escapeHTML(w.definition) || '<i>No definition yet</i>'}</div>
        ${w.example ? `<div class="card-example">“${escapeHTML(w.example)}”</div>` : ''}
        <div class="card-hint">tap to flip back</div>
      </div>
    </div>
    <div class="stamp got">GOT IT!</div>
    <div class="stamp miss">REVIEW</div>`;

  if (isTop) enableSwipe(card, w);
  return card;
}

function enableSwipe(card, w) {
  let startX = 0, startY = 0, dx = 0, dy = 0, dragging = false, moved = false;

  const onDown = (e) => {
    dragging = true; moved = false;
    const p = point(e);
    startX = p.x; startY = p.y;
    card.classList.add('dragging');
  };
  const onMove = (e) => {
    if (!dragging) return;
    const p = point(e);
    dx = p.x - startX; dy = p.y - startY;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) moved = true;
    const rot = dx / 18;
    card.style.transform = `translate(${dx}px, ${dy}px) rotate(${rot}deg)`;
    const t = Math.min(Math.abs(dx) / 120, 1);
    card.querySelector('.stamp.got').style.opacity = dx > 0 ? t : 0;
    card.querySelector('.stamp.miss').style.opacity = dx < 0 ? t : 0;
    if (e.cancelable) e.preventDefault();
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    card.classList.remove('dragging');
    if (Math.abs(dx) > 110) {
      resolveTop(dx > 0);
    } else if (!moved) {
      card.classList.toggle('flipped'); // tap = flip
      card.style.transform = '';
      resetStamps(card);
    } else {
      card.style.transform = '';
      resetStamps(card);
    }
    dx = 0; dy = 0;
  };

  card.addEventListener('pointerdown', onDown);
  card.addEventListener('pointermove', onMove);
  card.addEventListener('pointerup', onUp);
  card.addEventListener('pointercancel', onUp);
}

function resetStamps(card) {
  const g = card.querySelector('.stamp.got'), m = card.querySelector('.stamp.miss');
  if (g) g.style.opacity = 0;
  if (m) m.style.opacity = 0;
}

function point(e) {
  return { x: e.clientX, y: e.clientY };
}

async function resolveTop(gotIt) {
  const w = state.reviewQueue[0];
  if (!w) return;
  const card = $('.flashcard.top');
  if (card) {
    card.classList.add('flying');
    const flyX = (gotIt ? 1 : -1) * (innerWidth + 200);
    card.style.transform = `translate(${flyX}px, 40px) rotate(${gotIt ? 22 : -22}deg)`;
    const stamp = card.querySelector(gotIt ? '.stamp.got' : '.stamp.miss');
    if (stamp) stamp.style.opacity = 1;
  }

  applyReview(w, gotIt);
  await putWord(w);
  const wasMastered = w.status === 'mastered' && gotIt && w.streak === 3;
  await touchStreak();
  refreshStreak();

  state.reviewQueue.shift();
  setTimeout(() => {
    renderDeck();
    if (wasMastered) {
      burst({ count: 90 });
      toast(`🏆 “${w.word}” mastered!`);
    }
  }, 260);
}

// ================= LIBRARY =================
function wireLibrary() {
  $('#searchInput').addEventListener('input', (e) => {
    state.library.search = e.target.value.toLowerCase();
    renderLibrary();
  });
  $$('#filterChips .chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      state.library.filter = chip.dataset.filter;
      $$('#filterChips .chip').forEach((c) => c.classList.toggle('active', c === chip));
      renderLibrary();
    });
  });
}

function renderLibrary() {
  const list = $('#wordList');
  const empty = $('#libraryEmpty');
  const { search, filter } = state.library;
  $('#libraryCount').textContent = `${state.words.length} word${state.words.length === 1 ? '' : 's'}`;

  let items = [...state.words].sort((a, b) => b.createdAt - a.createdAt);
  if (filter !== 'all') items = items.filter((w) => w.status === filter);
  if (search) items = items.filter((w) =>
    w.word.toLowerCase().includes(search) || w.definition.toLowerCase().includes(search));

  if (!state.words.length) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  if (!items.length) {
    list.innerHTML = `<div class="no-results">No matching words.</div>`;
    return;
  }

  list.innerHTML = items.map((w) => {
    const pct = masteryPct(w);
    return `
    <div class="word-item" data-id="${w.id}">
      <div class="ring" style="--pct:${pct}"><span>${w.status === 'mastered' ? '🏆' : Math.round(pct)}</span></div>
      <div class="word-main">
        <div class="word-top"><span class="word-text">${escapeHTML(w.word)}</span>
          <span class="word-badge ${w.status}">${STATUS_LABEL[w.status]}</span></div>
        <div class="word-def">${escapeHTML(w.definition) || '<i>No definition — tap to add</i>'}</div>
      </div>
      <button class="word-del" data-del="${w.id}" aria-label="Delete">🗑️</button>
    </div>`;
  }).join('');

  $$('.word-item', list).forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-del]')) return;
      openEditor(el.dataset.id);
    });
  });
  $$('[data-del]', list).forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.del;
      const w = state.words.find((x) => x.id === id);
      if (!w) return;
      if (confirm(`Delete “${w.word}”?`)) {
        await deleteWord(id);
        state.words = state.words.filter((x) => x.id !== id);
        renderLibrary();
        toast('Deleted');
      }
    });
  });
}

function masteryPct(w) {
  if (w.status === 'mastered') return 100;
  const s = Math.min(w.streak || 0, 3);
  return Math.round((s / 3) * 100);
}

// Simple inline editor via prompt-based sheet
function openEditor(id) {
  const w = state.words.find((x) => x.id === id);
  if (!w) return;
  const word = prompt('Word:', w.word);
  if (word === null) return;
  const definition = prompt('Definition:', w.definition);
  if (definition === null) return;
  const example = prompt('Example (optional):', w.example || '');
  w.word = word.trim() || w.word;
  w.definition = (definition || '').trim();
  w.example = (example || '').trim();
  putWord(w).then(() => { renderLibrary(); toast('Saved'); });
}

// ================= UPLOAD =================
function wireUpload() {
  $('#fileInput').addEventListener('change', onFilePicked);
  $('#manualAddBtn').addEventListener('click', () => {
    state.pendingEntries = [{ word: '', definition: '', source: 'manual' }];
    showUploadReview();
  });
  $('#autoDefineBtn').addEventListener('click', runAutoDefine);
  $('#addRowBtn').addEventListener('click', () => {
    collectEntries();
    state.pendingEntries.push({ word: '', definition: '', source: 'manual' });
    renderFoundList();
  });
  $('#cancelReviewBtn').addEventListener('click', resetUpload);
  $('#saveWordsBtn').addEventListener('click', savePending);
}

function resetUpload() {
  $('#uploadIdle').classList.remove('hidden');
  $('#uploadProcessing').classList.add('hidden');
  $('#uploadReview').classList.add('hidden');
  $('#fileInput').value = '';
  state.pendingEntries = [];
}

async function onFilePicked(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  $('#uploadIdle').classList.add('hidden');
  $('#uploadReview').classList.add('hidden');
  $('#uploadProcessing').classList.remove('hidden');
  setProgress(0);
  $('#processingTitle').textContent = 'Reading your words…';

  try {
    const text = await recognize(file, (p) => setProgress(p));
    const entries = parseText(text);
    if (!entries.length) {
      toast("Couldn't find clear words — try a sharper screenshot.");
      resetUpload();
      return;
    }
    state.pendingEntries = entries;
    showUploadReview();
  } catch (err) {
    console.error(err);
    toast('Something went wrong reading that image.');
    resetUpload();
  }
}

function setProgress(p) {
  $('#ocrProgress').style.width = Math.round(p * 100) + '%';
}

function showUploadReview() {
  $('#uploadIdle').classList.add('hidden');
  $('#uploadProcessing').classList.add('hidden');
  $('#uploadReview').classList.remove('hidden');
  renderFoundList();
}

function renderFoundList() {
  const el = $('#foundList');
  $('#foundTitle').textContent = `Found ${state.pendingEntries.length} ${state.pendingEntries.length === 1 ? 'word' : 'words'}`;
  el.innerHTML = state.pendingEntries.map((e, i) => `
    <div class="found-item" data-i="${i}">
      <input class="found-word" data-i="${i}" placeholder="word" value="${escapeAttr(e.word)}" />
      <textarea class="found-def" data-i="${i}" placeholder="definition (leave blank to auto-define)" rows="2">${escapeHTML(e.definition)}</textarea>
      <button class="found-del" data-del="${i}" aria-label="Remove">✕</button>
    </div>`).join('');

  $$('.found-del', el).forEach((btn) => btn.addEventListener('click', () => {
    collectEntries();
    state.pendingEntries.splice(Number(btn.dataset.del), 1);
    renderFoundList();
  }));
}

function collectEntries() {
  $$('.found-word').forEach((inp) => {
    state.pendingEntries[Number(inp.dataset.i)].word = inp.value.trim();
  });
  $$('.found-def').forEach((inp) => {
    state.pendingEntries[Number(inp.dataset.i)].definition = inp.value.trim();
  });
}

async function runAutoDefine() {
  collectEntries();
  const missing = state.pendingEntries.filter((e) => e.word && !e.definition);
  if (!missing.length) { toast('Every word already has a definition.'); return; }
  const btn = $('#autoDefineBtn');
  btn.disabled = true;
  btn.textContent = 'Defining…';
  await autoDefineMissing(state.pendingEntries, (done, total) => {
    btn.textContent = `Defining ${done}/${total}…`;
  });
  renderFoundList();
  btn.disabled = false;
  btn.textContent = '✨ Auto-define';
  toast('Definitions added where found.');
}

async function savePending() {
  collectEntries();
  const valid = state.pendingEntries.filter((e) => e.word.trim());
  if (!valid.length) { toast('Add at least one word.'); return; }

  const btn = $('#saveWordsBtn');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  // auto-define any still missing, quietly
  await autoDefineMissing(valid, () => {});

  let added = 0, updated = 0;
  for (const e of valid) {
    const existing = await findByWord(e.word);
    if (existing) {
      existing.definition = e.definition || existing.definition;
      existing.example = e.example || existing.example;
      existing.phonetic = e.phonetic || existing.phonetic;
      existing.partOfSpeech = e.partOfSpeech || existing.partOfSpeech;
      await putWord(existing);
      updated++;
    } else {
      const rec = makeWord(e);
      await putWord(rec);
      added++;
    }
  }
  state.words = await getAllWords();
  await touchStreak();
  refreshStreak();

  btn.disabled = false;
  btn.textContent = 'Save words';
  resetUpload();
  burst({ count: 70 });
  toast(`Saved ${added} new${updated ? `, updated ${updated}` : ''} 🎉`);
  switchView('review');
}

// ================= QUIZ =================
function wireQuiz() {
  $$('#quizPicker .mode-card').forEach((card) => {
    card.addEventListener('click', () => startQuiz(card.dataset.mode));
  });
  $('#quizAgainBtn').addEventListener('click', () => startQuiz(state.quiz.mode));
}

function resetQuizPicker() {
  $('#quizPicker').classList.remove('hidden');
  $('#quizRun').classList.add('hidden');
  $('#quizResults').classList.add('hidden');
  const enough = state.words.filter((w) => w.definition).length;
  const note = $('#quizNote');
  if (enough < 4) {
    note.textContent = `Add at least 4 words with definitions to unlock quizzes (${enough}/4).`;
    $$('#quizPicker .mode-card').forEach((c) => { c.disabled = true; c.classList.add('disabled'); });
  } else {
    note.textContent = `${enough} words ready to quiz.`;
    $$('#quizPicker .mode-card').forEach((c) => { c.disabled = false; c.classList.remove('disabled'); });
  }
}

function buildQuestions(mode) {
  const pool = state.words.filter((w) => w.definition);
  const picked = [...pool].sort(() => Math.random() - 0.5).slice(0, Math.min(10, pool.length));
  return picked.map((w) => {
    if (mode === 'mc') {
      const distractors = pool.filter((x) => x.id !== w.id)
        .sort(() => Math.random() - 0.5).slice(0, 3).map((x) => x.definition);
      const options = [w.definition, ...distractors].sort(() => Math.random() - 0.5);
      return { word: w, type: 'mc', options, answer: w.definition };
    }
    return { word: w, type: 'type', answer: w.word };
  });
}

function startQuiz(mode) {
  state.quiz = { mode, questions: buildQuestions(mode), index: 0, score: 0 };
  $('#quizPicker').classList.add('hidden');
  $('#quizResults').classList.add('hidden');
  $('#quizRun').classList.remove('hidden');
  renderQuestion();
}

function renderQuestion() {
  const q = state.quiz.questions[state.quiz.index];
  const total = state.quiz.questions.length;
  $('#quizProgress').style.width = ((state.quiz.index) / total * 100) + '%';
  $('#quizScore').textContent = `${state.quiz.score}/${total}`;
  const box = $('#quizQuestion');

  if (q.type === 'mc') {
    box.innerHTML = `
      <div class="q-prompt">What does this mean?</div>
      <div class="q-word">${escapeHTML(q.word.word)}</div>
      <div class="q-options">
        ${q.options.map((o) => `<button class="q-option">${escapeHTML(o)}</button>`).join('')}
      </div>`;
    $$('.q-option', box).forEach((btn) => {
      btn.addEventListener('click', () => {
        const correct = btn.textContent === q.answer;
        $$('.q-option', box).forEach((b) => {
          b.disabled = true;
          if (b.textContent === q.answer) b.classList.add('correct');
          else if (b === btn) b.classList.add('wrong');
        });
        gradeAnswer(q.word, correct);
      });
    });
  } else {
    box.innerHTML = `
      <div class="q-prompt">Which word means…</div>
      <div class="q-def">${escapeHTML(q.word.definition)}</div>
      <form class="q-typeform" autocomplete="off">
        <input class="q-input" placeholder="type the word…" autocapitalize="none" autocomplete="off" />
        <button class="btn primary block" type="submit">Check</button>
      </form>
      <div class="q-feedback hidden"></div>`;
    const form = $('.q-typeform', box);
    const input = $('.q-input', box);
    input.focus();
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const guess = input.value.trim().toLowerCase();
      const correct = guess === q.answer.trim().toLowerCase();
      const fb = $('.q-feedback', box);
      fb.classList.remove('hidden');
      fb.classList.add(correct ? 'good' : 'bad');
      fb.textContent = correct ? '✓ Correct!' : `✗ It's “${q.answer}”`;
      input.disabled = true;
      form.querySelector('button').disabled = true;
      gradeAnswer(q.word, correct);
    });
  }
}

async function gradeAnswer(word, correct) {
  if (correct) state.quiz.score++;
  applyReview(word, correct);
  await putWord(word);
  // reflect updated status in memory
  const idx = state.words.findIndex((w) => w.id === word.id);
  if (idx >= 0) state.words[idx] = word;

  setTimeout(() => {
    state.quiz.index++;
    if (state.quiz.index >= state.quiz.questions.length) finishQuiz();
    else renderQuestion();
  }, correct ? 650 : 1100);
}

async function finishQuiz() {
  $('#quizRun').classList.add('hidden');
  $('#quizResults').classList.remove('hidden');
  const { score, questions } = state.quiz;
  const total = questions.length;
  const pct = total ? score / total : 0;
  $('#resultsScore').textContent = `${score}/${total}`;

  let emoji = '💪', title = 'Keep going!', sub = 'Every miss is a word you now know to practice.';
  if (pct === 1) { emoji = '🏆'; title = 'Perfect!'; sub = 'Flawless recall. Incredible.'; }
  else if (pct >= 0.8) { emoji = '🎉'; title = 'Brilliant!'; sub = 'You really know these.'; }
  else if (pct >= 0.5) { emoji = '👏'; title = 'Nice work!'; sub = 'Solid — a little more practice and you\'ve got it.'; }
  $('#resultsEmoji').textContent = emoji;
  $('#resultsTitle').textContent = title;
  $('#resultsSub').textContent = sub;

  await touchStreak();
  refreshStreak();
  if (pct >= 0.8) burst({ count: 140 });
}

// ================= MENU / BACKUP =================
function wireMenu() {
  $('#menuBtn').addEventListener('click', openSheet);
  $('#closeSheetBtn').addEventListener('click', closeSheet);
  $('#sheetBackdrop').addEventListener('click', closeSheet);
  $('#exportBtn').addEventListener('click', () => doExport(false));
  $('#shareBtn').addEventListener('click', () => doExport(true));
  $('#importInput').addEventListener('change', doImport);
  $('#wipeBtn').addEventListener('click', doWipe);
  updateStorageNote();
}

function openSheet() {
  $('#sheetBackdrop').classList.remove('hidden');
  $('#menuSheet').classList.remove('hidden');
  requestAnimationFrame(() => $('#menuSheet').classList.add('up'));
  updateStorageNote();
}
function closeSheet() {
  $('#menuSheet').classList.remove('up');
  $('#sheetBackdrop').classList.add('hidden');
  setTimeout(() => $('#menuSheet').classList.add('hidden'), 250);
}

async function updateStorageNote() {
  const note = $('#storageNote');
  let persisted = false;
  try { persisted = await navigator.storage.persisted(); } catch (_) {}
  note.textContent = `${state.words.length} words saved on this device` +
    (persisted ? ' · storage protected ✓' : '');
}

function backupBlob() {
  return exportAll().then((data) =>
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
}

async function doExport(share) {
  const blob = await backupBlob();
  const fname = `vocabmaster-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([blob], fname, { type: 'application/json' });

  if (share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'VocabMaster backup' });
      return;
    } catch (_) { /* fall through to download */ }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fname;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Backup saved ⬇️');
}

async function doImport(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const { added, skipped } = await importAll(data, { replace: false });
    state.words = await getAllWords();
    renderLibrary();
    closeSheet();
    toast(`Imported ${added} words${skipped ? `, skipped ${skipped} dupes` : ''} ✓`);
  } catch (err) {
    toast('That file didn\'t look like a VocabMaster backup.');
  } finally {
    e.target.value = '';
  }
}

async function doWipe() {
  if (!confirm('Delete ALL your words? Export a backup first if unsure.')) return;
  for (const w of state.words) await deleteWord(w.id);
  state.words = [];
  renderLibrary();
  updateStorageNote();
  closeSheet();
  toast('All words deleted.');
}

// ---------- utils ----------
function escapeHTML(s) {
  return String(s || '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(s) {
  return escapeHTML(s).replace(/"/g, '&quot;');
}

init();
