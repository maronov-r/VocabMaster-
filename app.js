// app.js — VocabMaster main controller (vanilla ES modules, no build step).
import {
  getAllWords, putWord, deleteWord, makeWord, applyReview, setRank, upgradeWord,
  findByWord, requestPersistence, getStreak, touchStreak, getActiveDays, dayStamp,
  exportAll, importAll,
} from './js/store.js';
import { recognize } from './js/ocr.js';
import { parseText } from './js/parser.js';
import { lookup, autoDefineMissing, posShort } from './js/dictionary.js';
import { burst } from './js/confetti.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const state = {
  words: [],
  view: 'review',
  reviewQueue: [],
  sessionSize: 0,
  library: { search: '', filter: 'all' },
  quiz: { mode: null, questions: [], index: 0, score: 0 },
  pendingEntries: [],
  detailId: null,
};

const STATUS = {
  new: { label: 'New', dot: '', cls: '' },
  struggling: { label: 'Struggling', cls: 's-struggling' },
  learning: { label: 'Learning', cls: 's-learning' },
  mastered: { label: 'Locked in', cls: 's-mastered' },
};

// ---------- boot ----------
async function init() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  requestPersistence();
  state.words = (await getAllWords()).map(upgradeWord);
  await renderStreak();
  wireNav();
  wireReview();
  wireLibrary();
  wireUpload();
  wireQuiz();
  wireMenu();
  wireDetail();
  switchView('review');
}

// ---------- navigation ----------
function wireNav() {
  $$('#tabbar .tab').forEach((b) => b.addEventListener('click', () => switchView(b.dataset.view)));
  $$('[data-goto]').forEach((el) => el.addEventListener('click', () => switchView(el.dataset.goto)));
}
function switchView(view) {
  state.view = view;
  $$('.view').forEach((v) => v.classList.toggle('hidden', v.dataset.view !== view));
  $$('#tabbar .tab').forEach((t) => t.classList.toggle('active', t.dataset.view === view));
  $('#progressPill').style.visibility = view === 'review' ? 'visible' : 'hidden';
  $('#streakStrip').style.display = view === 'review' ? '' : 'none';
  window.scrollTo(0, 0);
  if (view === 'review') startReviewSession();
  if (view === 'library') renderLibrary();
  if (view === 'quiz') resetQuizPicker();
  if (view === 'upload') resetUpload();
}

// ---------- toast ----------
let toastTimer;
function toast(msg, ms = 2000) {
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

// ---------- speech ----------
function pronounce(word) {
  try {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(word);
    u.lang = 'en-US'; u.rate = 0.95;
    speechSynthesis.speak(u);
  } catch (_) {}
}

// ---------- streak ----------
async function renderStreak() {
  const streak = await getStreak();
  const active = await getActiveDays();
  $('#miniStreak').textContent = streak;
  $('#ssCount').textContent = streak;
  $('#ssTitle').textContent = streak > 0
    ? `Day ${streak} of your learning streak`
    : 'Start your learning streak today';

  const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const today = dayStamp();
  let html = '';
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const stamp = dayStamp(d);
    const isActive = active.includes(stamp);
    const isToday = stamp === today;
    html += `<div class="ss-day ${isActive ? 'active' : ''} ${isToday ? 'today' : ''}">
      <span class="ss-dow">${DOW[d.getDay()]}</span><span class="ss-dot"></span></div>`;
  }
  $('#ssWeek').innerHTML = html;
}

// ================= REVIEW / SWIPE =================
function wireReview() {
  $('#btnMiss').addEventListener('click', () => resolveTop(false));
  $('#btnGot').addEventListener('click', () => resolveTop(true));
  $('#btnPron').addEventListener('click', () => {
    const w = state.reviewQueue[0]; if (w) { pronounce(w.word); flashPill(); }
  });
  $('#btnFav').addEventListener('click', toggleTopFav);
}

function flashPill() {
  const p = $('.flashcard.top .phonetic-pill');
  if (p) { p.classList.add('playing'); setTimeout(() => p.classList.remove('playing'), 500); }
}

async function toggleTopFav() {
  const w = state.reviewQueue[0]; if (!w) return;
  w.favorite = !w.favorite;
  await putWord(w);
  $('#btnFav').classList.toggle('on', w.favorite);
  const mark = $('.flashcard.top .card-fav');
  if (mark) mark.textContent = w.favorite ? '♥' : '';
}

function buildReviewQueue() {
  const rank = (w) => ({ struggling: 0, new: 1, learning: 2, mastered: 3 }[w.status] ?? 1);
  return [...state.words].sort(() => Math.random() - 0.5).sort((a, b) => rank(a) - rank(b));
}
function startReviewSession() {
  state.reviewQueue = buildReviewQueue();
  state.sessionSize = state.reviewQueue.length;
  renderDeck();
}

function meaningsHTML(w) {
  const list = (w.meanings && w.meanings.length) ? w.meanings
    : (w.definition ? [{ partOfSpeech: w.partOfSpeech, definition: w.definition, example: w.example }] : []);
  if (!list.length) return `<div class="mean-def"><i>No definition yet</i></div>`;
  return list.map((m) => `
    <div class="meaning">
      <div class="mean-def">${m.partOfSpeech ? `<span class="pos">${posShort(m.partOfSpeech)}</span>` : ''}${escapeHTML(m.definition)}</div>
      ${m.example ? `<div class="mean-ex">“${escapeHTML(m.example)}”</div>` : ''}
    </div>`).join('');
}

function renderDeck() {
  const area = $('#deckArea');
  const empty = $('#reviewEmpty');
  const controls = $('#swipeControls');
  area.innerHTML = '';
  updateProgress();

  if (!state.words.length || !state.reviewQueue.length) {
    empty.classList.remove('hidden');
    controls.style.visibility = 'hidden';
    empty.querySelector('h2').textContent = state.words.length ? 'All caught up' : 'No cards yet';
    empty.querySelector('p').textContent = state.words.length
      ? "You've reviewed every card. Take a quiz or add more words."
      : 'Upload a screenshot of highlighted words to build your first deck.';
    return;
  }
  empty.classList.add('hidden');
  controls.style.visibility = 'visible';

  const top3 = state.reviewQueue.slice(0, 3).reverse();
  top3.forEach((w, i) => area.appendChild(makeCard(w, i === top3.length - 1, top3.length - 1 - i)));
  const w = state.reviewQueue[0];
  $('#btnFav').classList.toggle('on', !!w.favorite);
}

function updateProgress() {
  const total = state.sessionSize || 0;
  const done = total - state.reviewQueue.length;
  $('#progressText').textContent = `${Math.min(done + (state.reviewQueue.length ? 1 : 0), total)}/${total}`;
  $('#progressBar').style.width = total ? (done / total * 100) + '%' : '0%';
}

function makeCard(w, isTop, depth) {
  const st = STATUS[w.status] || STATUS.new;
  const card = document.createElement('div');
  card.className = 'flashcard' + (isTop ? ' top' : '');
  card.style.setProperty('--depth', depth);
  card.innerHTML = `
    <div class="card-inner">
      <div class="card-face card-front">
        <div class="card-status ${st.cls}">${st.label}</div>
        <div class="card-fav">${w.favorite ? '♥' : ''}</div>
        <div class="card-word">${escapeHTML(w.word)}</div>
        ${w.phonetic ? `<div class="phonetic-pill" data-pron="1">
          <svg viewBox="0 0 24 24" class="ic"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 8a5 5 0 010 8"/></svg>
          <span>${escapeHTML(w.phonetic)}</span></div>` : `<div class="phonetic-pill" data-pron="1">
          <svg viewBox="0 0 24 24" class="ic"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 8a5 5 0 010 8"/></svg>
          <span>Tap to hear</span></div>`}
        <div class="card-hint">tap card to flip</div>
      </div>
      <div class="card-face card-back">
        <div class="meanings">${meaningsHTML(w)}</div>
        <div class="card-hint">tap to flip back</div>
      </div>
    </div>
    <div class="stamp got">KNOW IT</div>
    <div class="stamp miss">STRUGGLING</div>`;

  const pill = card.querySelector('.phonetic-pill');
  if (pill) pill.addEventListener('click', (e) => { e.stopPropagation(); pronounce(w.word); pill.classList.add('playing'); setTimeout(() => pill.classList.remove('playing'), 500); });
  if (isTop) enableSwipe(card, w);
  return card;
}

function enableSwipe(card, w) {
  let startX = 0, startY = 0, dx = 0, dy = 0, dragging = false, moved = false;
  const onDown = (e) => { dragging = true; moved = false; startX = e.clientX; startY = e.clientY; card.classList.add('dragging'); };
  const onMove = (e) => {
    if (!dragging) return;
    dx = e.clientX - startX; dy = e.clientY - startY;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) moved = true;
    card.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx / 20}deg)`;
    const t = Math.min(Math.abs(dx) / 120, 1);
    card.querySelector('.stamp.got').style.opacity = dx > 0 ? t : 0;
    card.querySelector('.stamp.miss').style.opacity = dx < 0 ? t : 0;
    if (e.cancelable) e.preventDefault();
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false; card.classList.remove('dragging');
    if (Math.abs(dx) > 110) { resolveTop(dx > 0); }
    else if (!moved) { card.classList.toggle('flipped'); card.style.transform = ''; resetStamps(card); }
    else { card.style.transform = ''; resetStamps(card); }
    dx = 0; dy = 0;
  };
  card.addEventListener('pointerdown', onDown);
  card.addEventListener('pointermove', onMove);
  card.addEventListener('pointerup', onUp);
  card.addEventListener('pointercancel', onUp);
}
function resetStamps(card) {
  const g = card.querySelector('.stamp.got'), m = card.querySelector('.stamp.miss');
  if (g) g.style.opacity = 0; if (m) m.style.opacity = 0;
}

async function resolveTop(gotIt) {
  const w = state.reviewQueue[0];
  if (!w) return;
  const card = $('.flashcard.top');
  if (card) {
    card.classList.add('flying');
    const flyX = (gotIt ? 1 : -1) * (innerWidth + 200);
    card.style.transform = `translate(${flyX}px, 40px) rotate(${gotIt ? 18 : -18}deg)`;
    const stamp = card.querySelector(gotIt ? '.stamp.got' : '.stamp.miss');
    if (stamp) stamp.style.opacity = 1;
  }
  const justMastered = gotIt && w.streak === 2; // becomes mastered now
  applyReview(w, gotIt);
  await putWord(w);
  await touchStreak();
  renderStreak();
  state.reviewQueue.shift();
  setTimeout(() => {
    renderDeck();
    if (justMastered) toast(`✦ “${w.word}” locked in`);
  }, 240);
}

// ================= LIBRARY =================
function wireLibrary() {
  $('#searchInput').addEventListener('input', (e) => { state.library.search = e.target.value.toLowerCase(); renderLibrary(); });
  $$('#filterChips .chip').forEach((chip) => chip.addEventListener('click', () => {
    state.library.filter = chip.dataset.filter;
    $$('#filterChips .chip').forEach((c) => c.classList.toggle('active', c === chip));
    renderLibrary();
  }));
}

function renderLibrary() {
  const list = $('#wordList');
  const empty = $('#libraryEmpty');
  const { search, filter } = state.library;
  $('#libraryCount').textContent = `${state.words.length} word${state.words.length === 1 ? '' : 's'}`;

  let items = [...state.words].sort((a, b) => b.createdAt - a.createdAt);
  if (filter === 'favorite') items = items.filter((w) => w.favorite);
  else if (filter !== 'all') items = items.filter((w) => w.status === filter);
  if (search) items = items.filter((w) =>
    w.word.toLowerCase().includes(search) || (w.definition || '').toLowerCase().includes(search));

  if (!state.words.length) { list.innerHTML = ''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  if (!items.length) { list.innerHTML = `<div class="no-results">No matching words.</div>`; return; }

  list.innerHTML = items.map((w) => {
    const st = STATUS[w.status] || STATUS.new;
    return `<div class="word-item" data-id="${w.id}">
      <span class="wi-dot ${st.cls}"></span>
      <div class="wi-main">
        <div class="wi-top"><span class="wi-word">${escapeHTML(w.word)}</span>
          ${w.phonetic ? `<span class="wi-phon">${escapeHTML(w.phonetic)}</span>` : ''}</div>
        <div class="wi-def">${escapeHTML(w.definition) || '<i>No definition — tap to add</i>'}</div>
      </div>
      ${w.favorite ? '<span class="wi-fav">♥</span>' : ''}
    </div>`;
  }).join('');

  $$('.word-item', list).forEach((el) => el.addEventListener('click', () => openDetail(el.dataset.id)));
}

// ================= WORD DETAIL =================
function wireDetail() {
  $('#detailBackdrop').addEventListener('click', closeDetail);
}

function openDetail(id) {
  const w = state.words.find((x) => x.id === id);
  if (!w) return;
  state.detailId = id;
  renderDetail(w, false);
  $('#detailBackdrop').classList.remove('hidden');
  $('#detailSheet').classList.remove('hidden');
  requestAnimationFrame(() => $('#detailSheet').classList.add('up'));
}
function closeDetail() {
  $('#detailSheet').classList.remove('up');
  $('#detailBackdrop').classList.add('hidden');
  setTimeout(() => $('#detailSheet').classList.add('hidden'), 250);
  state.detailId = null;
}

function renderDetail(w, editing) {
  const body = $('#detailBody');
  if (editing) { renderDetailEdit(w); return; }
  const meanings = (w.meanings && w.meanings.length) ? w.meanings : [];
  body.innerHTML = `
    <button class="detail-fav" id="dFav">${w.favorite ? '♥' : '♡'}</button>
    <div class="detail-word">${escapeHTML(w.word)}</div>
    <div class="phonetic-pill" id="dPron" style="margin-top:12px">
      <svg viewBox="0 0 24 24" class="ic"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 8a5 5 0 010 8"/></svg>
      <span>${escapeHTML(w.phonetic) || 'Tap to hear'}</span></div>
    <div class="detail-meanings">
      ${meanings.length ? meanings.map((m) => `
        <div class="detail-meaning">
          ${m.partOfSpeech ? `<div class="detail-pos">${escapeHTML(m.partOfSpeech)}</div>` : ''}
          <div class="detail-def">${escapeHTML(m.definition)}</div>
          ${m.example ? `<div class="detail-ex">“${escapeHTML(m.example)}”</div>` : ''}
        </div>`).join('') : '<div class="detail-def" style="text-align:center;color:var(--ink-soft)">No definition yet — tap Edit to add one.</div>'}
    </div>
    <div class="rank-label">How well do you know it?</div>
    <div class="rank-row" id="rankRow">
      <button class="rank-choice struggling ${w.status === 'struggling' ? 'active' : ''}" data-rank="struggling"><span class="rc-emoji">😖</span>Struggling</button>
      <button class="rank-choice learning ${w.status === 'learning' ? 'active' : ''}" data-rank="learning"><span class="rc-emoji">📖</span>Learning</button>
      <button class="rank-choice mastered ${w.status === 'mastered' ? 'active' : ''}" data-rank="mastered"><span class="rc-emoji">🔒</span>Locked in</button>
    </div>
    <div class="detail-actions">
      <button class="btn ghost" id="dEdit">Edit</button>
      <button class="btn ghost detail-del" id="dDel">Delete</button>
    </div>`;

  $('#dFav').addEventListener('click', async () => {
    w.favorite = !w.favorite; await putWord(w);
    $('#dFav').textContent = w.favorite ? '♥' : '♡';
    if (state.view === 'library') renderLibrary();
  });
  $('#dPron').addEventListener('click', () => { pronounce(w.word); $('#dPron').classList.add('playing'); setTimeout(() => $('#dPron').classList.remove('playing'), 500); });
  $$('#rankRow .rank-choice').forEach((b) => b.addEventListener('click', async () => {
    setRank(w, b.dataset.rank); await putWord(w);
    $$('#rankRow .rank-choice').forEach((x) => x.classList.toggle('active', x === b));
    if (state.view === 'library') renderLibrary();
    toast(`Marked “${w.word}” as ${STATUS[w.status].label}`);
  }));
  $('#dEdit').addEventListener('click', () => renderDetail(w, true));
  $('#dDel').addEventListener('click', async () => {
    if (!confirm(`Delete “${w.word}”?`)) return;
    await deleteWord(w.id);
    state.words = state.words.filter((x) => x.id !== w.id);
    closeDetail(); renderLibrary(); toast('Deleted');
  });
}

function renderDetailEdit(w) {
  const body = $('#detailBody');
  const meanings = (w.meanings && w.meanings.length) ? w.meanings : [{ partOfSpeech: '', definition: '', example: '' }];
  body.innerHTML = `
    <div class="rank-label" style="margin-top:2px">Word</div>
    <input class="search-input" id="eWord" value="${escapeAttr(w.word)}" />
    <div class="rank-label">Pronunciation (optional)</div>
    <input class="search-input" id="ePhon" value="${escapeAttr(w.phonetic || '')}" placeholder="e.g. ˈkwɪksətɪk" />
    <div class="rank-label">Meanings</div>
    <div id="eMeanings">${meanings.map((m, i) => meaningEditRow(m, i)).join('')}</div>
    <button class="btn ghost block" id="eAdd">＋ Add a meaning</button>
    <div class="detail-actions">
      <button class="btn ghost" id="eCancel">Cancel</button>
      <button class="btn primary" id="eSave">Save</button>
    </div>`;

  const rebind = () => $$('#eMeanings .em-del').forEach((b) => b.onclick = () => {
    collectEdit(w); w._edit.splice(Number(b.dataset.i), 1);
    if (!w._edit.length) w._edit.push({ partOfSpeech: '', definition: '', example: '' });
    paintEdit(w);
  });
  w._edit = meanings.map((m) => ({ ...m }));
  rebind();
  $('#eAdd').addEventListener('click', () => { collectEdit(w); w._edit.push({ partOfSpeech: '', definition: '', example: '' }); paintEdit(w); });
  $('#eCancel').addEventListener('click', () => { delete w._edit; renderDetail(w, false); });
  $('#eSave').addEventListener('click', async () => {
    collectEdit(w);
    const word = $('#eWord').value.trim();
    if (!word) { toast('Give the word a name.'); return; }
    w.word = word;
    w.phonetic = $('#ePhon').value.trim();
    w.meanings = w._edit.filter((m) => m.definition.trim() || m.partOfSpeech.trim())
      .map((m) => ({ partOfSpeech: m.partOfSpeech.trim(), definition: m.definition.trim(), example: m.example.trim() }));
    const p = w.meanings[0] || { definition: '', example: '', partOfSpeech: '' };
    w.definition = p.definition; w.example = p.example; w.partOfSpeech = p.partOfSpeech;
    delete w._edit;
    await putWord(w);
    renderDetail(w, false);
    if (state.view === 'library') renderLibrary();
    toast('Saved');
  });
}
function meaningEditRow(m, i) {
  return `<div class="found-item" style="margin-bottom:10px">
    <input class="found-word" style="font-size:14px;font-family:var(--sans);font-style:italic;color:var(--sage-deep)" data-em-pos="${i}" placeholder="part of speech (noun, verb…)" value="${escapeAttr(m.partOfSpeech || '')}" />
    <textarea class="found-def" data-em-def="${i}" rows="2" placeholder="definition">${escapeHTML(m.definition || '')}</textarea>
    <textarea class="found-def" data-em-ex="${i}" rows="2" placeholder="example sentence (optional)" style="font-family:var(--serif);font-style:italic">${escapeHTML(m.example || '')}</textarea>
    <button class="found-del em-del" data-i="${i}">✕</button>
  </div>`;
}
function collectEdit(w) {
  if (!w._edit) return;
  $$('[data-em-pos]').forEach((el) => { w._edit[+el.dataset.emPos].partOfSpeech = el.value; });
  $$('[data-em-def]').forEach((el) => { w._edit[+el.dataset.emDef].definition = el.value; });
  $$('[data-em-ex]').forEach((el) => { w._edit[+el.dataset.emEx].example = el.value; });
}
function paintEdit(w) {
  const box = $('#eMeanings');
  box.innerHTML = w._edit.map((m, i) => meaningEditRow(m, i)).join('');
  $$('#eMeanings .em-del').forEach((b) => b.onclick = () => {
    collectEdit(w); w._edit.splice(Number(b.dataset.i), 1);
    if (!w._edit.length) w._edit.push({ partOfSpeech: '', definition: '', example: '' });
    paintEdit(w);
  });
}

// ================= UPLOAD =================
function wireUpload() {
  $('#fileInput').addEventListener('change', onFilePicked);
  $('#cameraInput').addEventListener('change', onFilePicked);
  $('#manualAddBtn').addEventListener('click', () => { state.pendingEntries = [{ word: '', definition: '', source: 'manual' }]; showUploadReview(); });
  $('#autoDefineBtn').addEventListener('click', runAutoDefine);
  $('#addRowBtn').addEventListener('click', () => { collectEntries(); state.pendingEntries.push({ word: '', definition: '', source: 'manual' }); renderFoundList(); });
  $('#cancelReviewBtn').addEventListener('click', resetUpload);
  $('#saveWordsBtn').addEventListener('click', savePending);
}
function resetUpload() {
  $('#uploadIdle').classList.remove('hidden');
  $('#uploadProcessing').classList.add('hidden');
  $('#uploadReview').classList.add('hidden');
  $('#fileInput').value = ''; $('#cameraInput').value = '';
  state.pendingEntries = [];
}
async function onFilePicked(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  $('#uploadIdle').classList.add('hidden');
  $('#uploadReview').classList.add('hidden');
  $('#uploadProcessing').classList.remove('hidden');
  setProgress(0);
  try {
    const text = await recognize(file, setProgress);
    const entries = parseText(text);
    if (!entries.length) { toast("Couldn't find clear words — try a sharper screenshot."); resetUpload(); return; }
    state.pendingEntries = entries;
    showUploadReview();
  } catch (err) { console.error(err); toast('Something went wrong reading that image.'); resetUpload(); }
}
function setProgress(p) { $('#ocrProgress').style.width = Math.round(p * 100) + '%'; }
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
      <textarea class="found-def" data-i="${i}" placeholder="definition (leave blank to auto-define)" rows="2">${escapeHTML(e.definition || '')}</textarea>
      <button class="found-del" data-del="${i}">✕</button>
    </div>`).join('');
  $$('.found-del', el).forEach((btn) => btn.addEventListener('click', () => {
    collectEntries(); state.pendingEntries.splice(Number(btn.dataset.del), 1); renderFoundList();
  }));
}
function collectEntries() {
  $$('#foundList .found-word').forEach((inp) => { state.pendingEntries[+inp.dataset.i].word = inp.value.trim(); });
  $$('#foundList .found-def').forEach((inp) => { state.pendingEntries[+inp.dataset.i].definition = inp.value.trim(); });
}
async function runAutoDefine() {
  collectEntries();
  const missing = state.pendingEntries.filter((e) => e.word && !e.definition && !(e.meanings && e.meanings.length));
  if (!missing.length) { toast('Every word already has a definition.'); return; }
  const btn = $('#autoDefineBtn'); btn.disabled = true; btn.textContent = 'Defining…';
  await autoDefineMissing(state.pendingEntries, (d, t) => { btn.textContent = `Defining ${d}/${t}…`; });
  renderFoundList();
  btn.disabled = false; btn.textContent = '✨ Auto-define';
  toast('Definitions added where found.');
}
async function savePending() {
  collectEntries();
  const valid = state.pendingEntries.filter((e) => e.word.trim());
  if (!valid.length) { toast('Add at least one word.'); return; }
  const btn = $('#saveWordsBtn'); btn.disabled = true; btn.textContent = 'Saving…';
  await autoDefineMissing(valid, () => {});
  let added = 0, updated = 0;
  for (const e of valid) {
    const existing = await findByWord(e.word);
    if (existing) {
      if (e.meanings && e.meanings.length) existing.meanings = e.meanings;
      else if (e.definition && !(existing.meanings || []).length) existing.meanings = [{ partOfSpeech: e.partOfSpeech || '', definition: e.definition, example: e.example || '' }];
      existing.phonetic = existing.phonetic || e.phonetic || '';
      existing.audio = existing.audio || e.audio || '';
      const p = (existing.meanings || [])[0] || {};
      existing.definition = p.definition || existing.definition;
      existing.example = p.example || existing.example;
      existing.partOfSpeech = p.partOfSpeech || existing.partOfSpeech;
      await putWord(upgradeWord(existing)); updated++;
    } else { await putWord(makeWord(e)); added++; }
  }
  state.words = (await getAllWords()).map(upgradeWord);
  await touchStreak(); renderStreak();
  btn.disabled = false; btn.textContent = 'Save words';
  resetUpload();
  toast(`Saved ${added} new${updated ? `, updated ${updated}` : ''} ✦`);
  switchView('review');
}

// ================= QUIZ =================
function wireQuiz() {
  $$('#quizPicker .mode-card').forEach((c) => c.addEventListener('click', () => startQuiz(c.dataset.mode)));
  $('#quizAgainBtn').addEventListener('click', () => startQuiz(state.quiz.mode));
}
function resetQuizPicker() {
  $('#quizPicker').classList.remove('hidden');
  $('#quizRun').classList.add('hidden');
  $('#quizResults').classList.add('hidden');
  const enough = state.words.filter((w) => w.definition).length;
  const note = $('#quizNote');
  const ok = enough >= 4;
  note.textContent = ok ? `${enough} words ready to quiz.` : `Add at least 4 words with definitions to unlock quizzes (${enough}/4).`;
  $$('#quizPicker .mode-card').forEach((c) => { c.disabled = !ok; c.classList.toggle('disabled', !ok); });
}
function buildQuestions(mode) {
  const pool = state.words.filter((w) => w.definition);
  const picked = [...pool].sort(() => Math.random() - 0.5).slice(0, Math.min(10, pool.length));
  return picked.map((w) => {
    if (mode === 'mc') {
      const distractors = pool.filter((x) => x.id !== w.id).sort(() => Math.random() - 0.5).slice(0, 3).map((x) => x.definition);
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
  $('#quizProgress').style.width = (state.quiz.index / total * 100) + '%';
  $('#quizScore').textContent = `${state.quiz.score}/${total}`;
  const box = $('#quizQuestion');
  if (q.type === 'mc') {
    box.innerHTML = `<div class="q-prompt">What does this mean?</div>
      <div class="q-word">${escapeHTML(q.word.word)}</div>
      <div class="q-options">${q.options.map((o) => `<button class="q-option">${escapeHTML(o)}</button>`).join('')}</div>`;
    $$('.q-option', box).forEach((btn) => btn.addEventListener('click', () => {
      const correct = btn.textContent === q.answer;
      $$('.q-option', box).forEach((b) => { b.disabled = true; if (b.textContent === q.answer) b.classList.add('correct'); else if (b === btn) b.classList.add('wrong'); });
      gradeAnswer(q.word, correct);
    }));
  } else {
    box.innerHTML = `<div class="q-prompt">Which word means…</div>
      <div class="q-def">${q.word.partOfSpeech ? `<span class="pos">${posShort(q.word.partOfSpeech)}</span>` : ''}${escapeHTML(q.word.definition)}</div>
      <form class="q-typeform" autocomplete="off"><input class="q-input" placeholder="type the word…" autocapitalize="none" autocomplete="off" /><button class="btn primary block" type="submit">Check</button></form>
      <div class="q-feedback hidden"></div>`;
    const form = $('.q-typeform', box), input = $('.q-input', box);
    input.focus();
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const correct = input.value.trim().toLowerCase() === q.answer.trim().toLowerCase();
      const fb = $('.q-feedback', box); fb.classList.remove('hidden'); fb.classList.add(correct ? 'good' : 'bad');
      fb.textContent = correct ? '✓ Correct!' : `✗ It's “${q.answer}”`;
      input.disabled = true; form.querySelector('button').disabled = true;
      gradeAnswer(q.word, correct);
    });
  }
}
async function gradeAnswer(word, correct) {
  if (correct) state.quiz.score++;
  applyReview(word, correct);
  await putWord(word);
  const idx = state.words.findIndex((w) => w.id === word.id);
  if (idx >= 0) state.words[idx] = word;
  setTimeout(() => {
    state.quiz.index++;
    if (state.quiz.index >= state.quiz.questions.length) finishQuiz(); else renderQuestion();
  }, correct ? 620 : 1050);
}
async function finishQuiz() {
  $('#quizRun').classList.add('hidden');
  $('#quizResults').classList.remove('hidden');
  const { score, questions } = state.quiz;
  const total = questions.length, pct = total ? score / total : 0;
  $('#resultsScore').textContent = `${score}/${total}`;
  let emoji = '📚', title = 'Keep going', sub = 'Every miss is a word you now know to practice.';
  if (pct === 1) { emoji = '✦'; title = 'Perfect'; sub = 'Flawless recall.'; }
  else if (pct >= 0.8) { emoji = '🌿'; title = 'Brilliant'; sub = 'You really know these.'; }
  else if (pct >= 0.5) { emoji = '👏'; title = 'Nice work'; sub = 'Solid — a little more practice.'; }
  $('#resultsEmoji').textContent = emoji; $('#resultsTitle').textContent = title; $('#resultsSub').textContent = sub;
  await touchStreak(); renderStreak();
  if (pct >= 0.8) burst({ count: 120, colors: ['#5E8B77', '#9DB8AC', '#C0913C', '#C4674E', '#EADFcf'] });
}

// ================= MENU / BACKUP =================
function wireMenu() {
  $('#menuBtn').addEventListener('click', openSheet);
  $('#statsBtn').addEventListener('click', () => { switchView('review'); });
  $('#closeSheetBtn').addEventListener('click', closeSheet);
  $('#sheetBackdrop').addEventListener('click', closeSheet);
  $('#exportBtn').addEventListener('click', () => doExport(false));
  $('#shareBtn').addEventListener('click', () => doExport(true));
  $('#importInput').addEventListener('change', doImport);
  $('#wipeBtn').addEventListener('click', doWipe);
}
function openSheet() { $('#sheetBackdrop').classList.remove('hidden'); $('#menuSheet').classList.remove('hidden'); requestAnimationFrame(() => $('#menuSheet').classList.add('up')); updateStorageNote(); }
function closeSheet() { $('#menuSheet').classList.remove('up'); $('#sheetBackdrop').classList.add('hidden'); setTimeout(() => $('#menuSheet').classList.add('hidden'), 250); }
async function updateStorageNote() {
  let persisted = false; try { persisted = await navigator.storage.persisted(); } catch (_) {}
  $('#storageNote').textContent = `${state.words.length} words saved on this device` + (persisted ? ' · storage protected ✓' : '');
}
function backupBlob() { return exportAll().then((d) => new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' })); }
async function doExport(share) {
  const blob = await backupBlob();
  const fname = `vocabmaster-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([blob], fname, { type: 'application/json' });
  if (share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'VocabMaster backup' }); return; } catch (_) {}
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = fname; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Backup saved ⬇️');
}
async function doImport(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const { added, skipped } = await importAll(data, { replace: false });
    state.words = (await getAllWords()).map(upgradeWord);
    renderLibrary(); closeSheet();
    toast(`Imported ${added} words${skipped ? `, skipped ${skipped} dupes` : ''} ✓`);
  } catch (err) { toast("That file didn't look like a VocabMaster backup."); }
  finally { e.target.value = ''; }
}
async function doWipe() {
  if (!confirm('Delete ALL your words? Export a backup first if unsure.')) return;
  for (const w of state.words) await deleteWord(w.id);
  state.words = []; renderLibrary(); updateStorageNote(); closeSheet(); toast('All words deleted.');
}

// ---------- utils ----------
function escapeHTML(s) { return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function escapeAttr(s) { return escapeHTML(s).replace(/"/g, '&quot;'); }

init();
