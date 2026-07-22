// app.js — VocabMaster main controller (vanilla ES modules, no build step).
import {
  getAllWords, putWord, deleteWord, makeWord, applyReview, setRank, upgradeWord,
  findByWord, requestPersistence, getStreak, touchStreak, getActiveDays, dayStamp,
  exportAll, importAll,
} from './js/store.js';
import { recognize } from './js/ocr.js';
import { parseText } from './js/parser.js';
import { lookup, autoDefineMissing, posShort } from './js/dictionary.js';
import { PACKS, getPack } from './js/packs.js';
import { burst } from './js/confetti.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const HEART = '<svg viewBox="0 0 24 24" class="ic heart"><path d="M12 21C12 21 4 14 4 8.7 4 6 6 4 8.6 4c1.5 0 2.8.7 3.4 1.9C12.6 4.7 13.9 4 15.4 4 18 4 20 6 20 8.7 20 14 12 21 12 21z"/></svg>';

const state = {
  words: [],
  view: 'review',
  reviewQueue: [],
  sessionSize: 0,
  library: { search: '', filter: 'all' },
  play: null,
  pendingEntries: [],
  topicId: null,
  deckScope: null, // null = all words; {title, words} = a focused topic
};

const shuffle = (arr) => arr.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(([, v]) => v);

const STATUS = {
  new: { label: 'New', cls: '' },
  struggling: { label: 'Struggling', cls: 's-struggling' },
  learning: { label: 'Learning', cls: 's-learning' },
  mastered: { label: 'Locked in', cls: 's-mastered' },
};

const PLAY = {
  mc:         { type: 'mc',   total: 10,  lives: 0, time: 0,  stopOnWrong: false, label: 'Multiple choice' },
  type:       { type: 'type', total: 10,  lives: 0, time: 0,  stopOnWrong: false, label: 'Type the answer' },
  rush:       { type: 'mc',   total: 200, lives: 3, time: 0,  stopOnWrong: false, label: 'Rush' },
  sprint:     { type: 'mc',   total: 200, lives: 0, time: 60, stopOnWrong: false, label: 'Sprint' },
  perfection: { type: 'mc',   total: 200, lives: 1, time: 0,  stopOnWrong: true,  label: 'Perfection' },
};

// ---------- boot ----------
async function init() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  requestPersistence();
  state.words = (await getAllWords()).map(upgradeWord);
  await renderStreak();
  wireNav(); wireReview(); wireLibrary(); wireUpload();
  wirePractice(); wireExplore(); wireMenu(); wireDetail();
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
  if (view === 'explore') renderExplore();
  if (view === 'practice') resetPractice();
  if (view === 'upload') resetUpload();
}

// ---------- toast ----------
let toastTimer;
function toast(msg, ms = 2000) {
  const el = $('#toast'); el.textContent = msg; el.classList.remove('hidden');
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.classList.add('hidden'), 300); }, ms);
}

// ---------- speech ----------
function pronounce(word) {
  try { if (!('speechSynthesis' in window)) return; speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(word); u.lang = 'en-US'; u.rate = 0.95; speechSynthesis.speak(u);
  } catch (_) {}
}

// ---------- streak ----------
async function renderStreak() {
  const streak = await getStreak();
  const active = await getActiveDays();
  $('#miniStreak').textContent = streak;
  $('#ssCount').textContent = streak;
  $('#ssTitle').textContent = streak > 0 ? `Day ${streak} of your learning streak` : 'Start your learning streak today';
  const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const today = dayStamp();
  let html = '';
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const stamp = dayStamp(d);
    html += `<div class="ss-day ${active.includes(stamp) ? 'active' : ''} ${stamp === today ? 'today' : ''}">
      <span class="ss-dow">${DOW[d.getDay()]}</span><span class="ss-dot"></span></div>`;
  }
  $('#ssWeek').innerHTML = html;
}

// ================= LEARN / SWIPE (all words) =================
function wireReview() {
  $('#btnMiss').addEventListener('click', () => resolveTop(false));
  $('#btnGot').addEventListener('click', () => resolveTop(true));
  $('#btnPron').addEventListener('click', () => { const w = state.reviewQueue[0]; if (w) pronounce(w.word); });
  $('#btnFav').addEventListener('click', toggleTopFav);
  $('#scopeClear').addEventListener('click', () => { state.deckScope = null; startReviewSession(); });
}

// The Learn deck draws from EVERY word in the app (built-in bank + your own),
// deduped, unless a topic scope is active. Your saved list lives on the Words tab.
function learnWords() {
  if (state.deckScope) return state.deckScope.words;
  const map = new Map();
  for (const wd of state.words) map.set(wd.word.toLowerCase(), wd);        // your words win
  for (const wd of allWords()) if (!map.has(wd.word.toLowerCase())) map.set(wd.word.toLowerCase(), wd);
  return [...map.values()];
}
async function toggleTopFav() {
  let w = state.reviewQueue[0]; if (!w) return;
  if (!haveWord(w.word)) { w = await addPackWord(w); state.reviewQueue[0] = w; }
  w.favorite = !w.favorite; await putWord(w);
  $('#btnFav').classList.toggle('on', w.favorite);
  const card = $('.flashcard.top');
  if (card) {
    const mark = card.querySelector('.card-fav'); if (mark) mark.innerHTML = w.favorite ? HEART : '';
    const tag = card.querySelector('.card-status'); if (tag) { tag.classList.add('s-saved'); tag.textContent = '✓ In your list'; }
  }
}
function buildReviewQueue() { return shuffle(learnWords()); } // fresh shuffle every visit
function startReviewSession() {
  state.reviewQueue = buildReviewQueue();
  state.sessionSize = state.reviewQueue.length;
  const scoped = !!state.deckScope;
  $('#scopeBar').classList.toggle('hidden', !scoped);
  $('#streakStrip').style.display = scoped ? 'none' : '';
  if (scoped) $('#scopeLabel').textContent = state.deckScope.title;
  renderDeck();
}

function meaningsHTML(w) {
  const list = (w.meanings && w.meanings.length) ? w.meanings
    : (w.definition ? [{ partOfSpeech: w.partOfSpeech, definition: w.definition, example: w.example }] : []);
  if (!list.length) return `<div class="mean-def"><i>No definition yet</i></div>`;
  return list.map((m) => `<div class="meaning">
    <div class="mean-def">${m.partOfSpeech ? `<span class="pos">${posShort(m.partOfSpeech)}</span>` : ''}${escapeHTML(m.definition)}</div>
    ${m.example ? `<div class="mean-ex">“${escapeHTML(m.example)}”</div>` : ''}</div>`).join('');
}

function renderDeck() {
  const area = $('#deckArea'), empty = $('#reviewEmpty'), controls = $('#swipeControls'), hint = $('#learnHint');
  area.innerHTML = ''; updateProgress();
  if (!state.reviewQueue.length) {
    empty.classList.remove('hidden'); controls.style.visibility = 'hidden'; hint.style.visibility = 'hidden';
    return;
  }
  empty.classList.add('hidden'); controls.style.visibility = 'visible'; hint.style.visibility = 'visible';
  const top3 = state.reviewQueue.slice(0, 3).reverse();
  top3.forEach((w, i) => area.appendChild(makeCard(w, i === top3.length - 1, top3.length - 1 - i)));
  refreshTopCardTag();
}
function refreshTopCardTag() {
  const w = state.reviewQueue[0]; if (!w) return;
  const rec = state.words.find((x) => x.word.toLowerCase() === w.word.toLowerCase());
  $('#btnFav').classList.toggle('on', !!(rec && rec.favorite));
}
function updateProgress() {
  const total = state.sessionSize || 0, done = total - state.reviewQueue.length;
  $('#progressText').textContent = `${Math.min(done + (state.reviewQueue.length ? 1 : 0), total)}/${total}`;
  $('#progressBar').style.width = total ? (done / total * 100) + '%' : '0%';
}
function makeCard(w, isTop, depth) {
  const rec = state.words.find((x) => x.word.toLowerCase() === w.word.toLowerCase());
  const saved = !!rec;
  const card = document.createElement('div');
  card.className = 'flashcard' + (isTop ? ' top' : '');
  card.style.setProperty('--depth', depth);
  card.innerHTML = `
    <div class="card-inner">
      <div class="card-face card-front">
        <div class="card-status ${saved ? 's-saved' : ''}">${saved ? '✓ In your list' : 'New word'}</div>
        <div class="card-fav">${saved && rec.favorite ? HEART : ''}</div>
        <div class="card-word">${escapeHTML(w.word)}</div>
        <div class="phonetic-pill" data-pron="1">
          <svg viewBox="0 0 24 24" class="ic"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 8a5 5 0 010 8"/></svg>
          <span>${escapeHTML(w.phonetic) || 'Tap to hear'}</span></div>
        <div class="card-hint">tap card to flip</div>
      </div>
      <div class="card-face card-back">
        <div class="meanings">${meaningsHTML(w)}</div>
        <div class="card-hint">tap to flip back</div>
      </div>
    </div>
    <div class="stamp got">SAVE</div>
    <div class="stamp miss">SKIP</div>`;
  const pill = card.querySelector('.phonetic-pill');
  pill.addEventListener('click', (e) => { e.stopPropagation(); pronounce(w.word); pill.classList.add('playing'); setTimeout(() => pill.classList.remove('playing'), 500); });
  if (isTop) enableSwipe(card, resolveTop);
  return card;
}

// Smooth pointer-driven swipe: pointer capture + rAF-batched GPU transforms.
// onResolve(dir) is called when a card is flung off (dir = true for right).
function enableSwipe(card, onResolve) {
  let startX = 0, startY = 0, dx = 0, dy = 0, dragging = false, moved = false, raf = 0;
  const gotStamp = card.querySelector('.stamp.got'), missStamp = card.querySelector('.stamp.miss');
  const render = () => {
    raf = 0;
    card.style.transform = `translate3d(${dx}px, ${dy}px, 0) rotate(${dx / 22}deg)`;
    const t = Math.min(Math.abs(dx) / 110, 1);
    gotStamp.style.opacity = dx > 0 ? t : 0;
    missStamp.style.opacity = dx < 0 ? t : 0;
  };
  const schedule = () => { if (!raf) raf = requestAnimationFrame(render); };
  const onDown = (e) => {
    dragging = true; moved = false; startX = e.clientX; startY = e.clientY;
    try { card.setPointerCapture(e.pointerId); } catch (_) {}
    card.classList.add('dragging');
  };
  const onMove = (e) => {
    if (!dragging) return;
    dx = e.clientX - startX; dy = (e.clientY - startY) * 0.35;
    if (Math.abs(dx) > 5 || Math.abs(e.clientY - startY) > 5) moved = true;
    schedule();
    if (e.cancelable) e.preventDefault();
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false; card.classList.remove('dragging');
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    if (Math.abs(dx) > 100) { onResolve(dx > 0); }
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
// Right = save to your list, left = skip. (Your list lives on the Words tab.)
async function resolveTop(save) {
  const w = state.reviewQueue[0]; if (!w) return;
  const card = $('.flashcard.top');
  if (card) {
    card.classList.add('flying');
    const flyX = (save ? 1 : -1) * (innerWidth + 200);
    card.style.transform = `translate3d(${flyX}px, 40px, 0) rotate(${save ? 18 : -18}deg)`;
    const stamp = card.querySelector(save ? '.stamp.got' : '.stamp.miss'); if (stamp) stamp.style.opacity = 1;
  }
  if (save && !haveWord(w.word)) {
    await addPackWord(w);
    await touchStreak(); renderStreak();
    toast(`Saved “${w.word}” ✦`);
  }
  state.reviewQueue.shift();
  if (!state.reviewQueue.length) { state.reviewQueue = buildReviewQueue(); state.sessionSize = state.reviewQueue.length; }
  setTimeout(renderDeck, 230);
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
  const list = $('#wordList'), empty = $('#libraryEmpty');
  const { search, filter } = state.library;
  $('#libraryCount').textContent = `${state.words.length} word${state.words.length === 1 ? '' : 's'}`;
  let items = [...state.words];
  if (filter === 'history') items = items.filter((w) => w.seen > 0).sort((a, b) => b.updatedAt - a.updatedAt);
  else items.sort((a, b) => b.createdAt - a.createdAt);
  if (filter === 'favorite') items = items.filter((w) => w.favorite);
  else if (filter !== 'all' && filter !== 'history') items = items.filter((w) => w.status === filter);
  if (search) items = items.filter((w) => w.word.toLowerCase().includes(search) || (w.definition || '').toLowerCase().includes(search));

  if (!state.words.length) { list.innerHTML = ''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  if (!items.length) { list.innerHTML = `<div class="no-results">No matching words.</div>`; return; }
  list.innerHTML = items.map((w) => {
    const st = STATUS[w.status] || STATUS.new;
    return `<div class="word-item" data-id="${w.id}">
      <span class="wi-dot ${st.cls}"></span>
      <div class="wi-main"><div class="wi-top"><span class="wi-word">${escapeHTML(w.word)}</span>
        ${w.phonetic ? `<span class="wi-phon">${escapeHTML(w.phonetic)}</span>` : ''}</div>
        <div class="wi-def">${escapeHTML(w.definition) || '<i>No definition — tap to add</i>'}</div></div>
      ${w.favorite ? '<span class="wi-fav">♥</span>' : ''}</div>`;
  }).join('');
  $$('.word-item', list).forEach((el) => el.addEventListener('click', () => openDetail(el.dataset.id)));
}

// ================= WORD DETAIL =================
function wireDetail() { $('#detailBackdrop').addEventListener('click', closeDetail); }
function openDetail(id) {
  const w = state.words.find((x) => x.id === id); if (!w) return;
  renderDetail(w, false);
  document.body.classList.add('modal-open');
  $('#detailBackdrop').classList.remove('hidden'); $('#detailSheet').classList.remove('hidden');
  $('#detailSheet').scrollTop = 0;
  requestAnimationFrame(() => $('#detailSheet').classList.add('up'));
}
function closeDetail() {
  document.body.classList.remove('modal-open');
  $('#detailSheet').classList.remove('up'); $('#detailBackdrop').classList.add('hidden');
  setTimeout(() => $('#detailSheet').classList.add('hidden'), 250);
}
function renderDetail(w, editing) {
  const body = $('#detailBody');
  if (editing) return renderDetailEdit(w);
  const meanings = (w.meanings && w.meanings.length) ? w.meanings : [];
  body.innerHTML = `
    <button class="detail-fav" id="dFav">${w.favorite ? '♥' : '♡'}</button>
    <div class="detail-word" style="text-align:center">${escapeHTML(w.word)}</div>
    <div style="text-align:center"><span class="phonetic-pill" id="dPron" style="margin-top:12px">
      <svg viewBox="0 0 24 24" class="ic"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 8a5 5 0 010 8"/></svg>
      <span>${escapeHTML(w.phonetic) || 'Tap to hear'}</span></span></div>
    <div class="detail-meanings">
      ${meanings.length ? meanings.map((m) => `<div class="detail-meaning">
        ${m.partOfSpeech ? `<div class="detail-pos">${escapeHTML(m.partOfSpeech)}</div>` : ''}
        <div class="detail-def">${escapeHTML(m.definition)}</div>
        ${m.example ? `<div class="detail-ex">“${escapeHTML(m.example)}”</div>` : ''}</div>`).join('')
      : '<div class="detail-def" style="text-align:center;color:var(--ink-soft)">No definition yet — tap Edit to add one.</div>'}
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
  $('#dFav').addEventListener('click', async () => { w.favorite = !w.favorite; await putWord(w); $('#dFav').textContent = w.favorite ? '♥' : '♡'; if (state.view === 'library') renderLibrary(); });
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
    await deleteWord(w.id); state.words = state.words.filter((x) => x.id !== w.id);
    closeDetail(); renderLibrary(); toast('Deleted');
  });
}
function renderDetailEdit(w) {
  const body = $('#detailBody');
  const meanings = (w.meanings && w.meanings.length) ? w.meanings : [{ partOfSpeech: '', definition: '', example: '' }];
  w._edit = meanings.map((m) => ({ ...m }));
  body.innerHTML = `
    <div class="rank-label" style="margin-top:2px">Word</div>
    <input class="search-input" id="eWord" value="${escapeAttr(w.word)}" />
    <div class="rank-label">Pronunciation (optional)</div>
    <input class="search-input" id="ePhon" value="${escapeAttr(w.phonetic || '')}" placeholder="e.g. ˈkwɪksətɪk" />
    <div class="rank-label">Meanings</div>
    <div id="eMeanings"></div>
    <button class="btn ghost block" id="eAdd">＋ Add a meaning</button>
    <div class="detail-actions"><button class="btn ghost" id="eCancel">Cancel</button><button class="btn primary" id="eSave">Save</button></div>`;
  paintEdit(w);
  $('#eAdd').addEventListener('click', () => { collectEdit(w); w._edit.push({ partOfSpeech: '', definition: '', example: '' }); paintEdit(w); });
  $('#eCancel').addEventListener('click', () => { delete w._edit; renderDetail(w, false); });
  $('#eSave').addEventListener('click', async () => {
    collectEdit(w);
    const word = $('#eWord').value.trim(); if (!word) { toast('Give the word a name.'); return; }
    w.word = word; w.phonetic = $('#ePhon').value.trim();
    w.meanings = w._edit.filter((m) => m.definition.trim() || m.partOfSpeech.trim())
      .map((m) => ({ partOfSpeech: m.partOfSpeech.trim(), definition: m.definition.trim(), example: m.example.trim() }));
    const p = w.meanings[0] || { definition: '', example: '', partOfSpeech: '' };
    w.definition = p.definition; w.example = p.example; w.partOfSpeech = p.partOfSpeech;
    delete w._edit; await putWord(w); renderDetail(w, false);
    if (state.view === 'library') renderLibrary(); toast('Saved');
  });
}
function meaningEditRow(m, i) {
  return `<div class="found-item" style="margin-bottom:10px">
    <input class="found-word" style="font-size:14px;font-family:var(--sans);font-style:italic;color:var(--sage-deep)" data-em-pos="${i}" placeholder="part of speech (noun, verb…)" value="${escapeAttr(m.partOfSpeech || '')}" />
    <textarea class="found-def" data-em-def="${i}" rows="2" placeholder="definition">${escapeHTML(m.definition || '')}</textarea>
    <textarea class="found-def" data-em-ex="${i}" rows="2" placeholder="example sentence (optional)" style="font-family:var(--serif);font-style:italic">${escapeHTML(m.example || '')}</textarea>
    <button class="found-del em-del" data-i="${i}">✕</button></div>`;
}
function collectEdit(w) {
  if (!w._edit) return;
  $$('[data-em-pos]').forEach((el) => { w._edit[+el.dataset.emPos].partOfSpeech = el.value; });
  $$('[data-em-def]').forEach((el) => { w._edit[+el.dataset.emDef].definition = el.value; });
  $$('[data-em-ex]').forEach((el) => { w._edit[+el.dataset.emEx].example = el.value; });
}
function paintEdit(w) {
  $('#eMeanings').innerHTML = w._edit.map((m, i) => meaningEditRow(m, i)).join('');
  $$('#eMeanings .em-del').forEach((b) => b.onclick = () => {
    collectEdit(w); w._edit.splice(Number(b.dataset.i), 1);
    if (!w._edit.length) w._edit.push({ partOfSpeech: '', definition: '', example: '' });
    paintEdit(w);
  });
}

// ================= EXPLORE =================
function wireExplore() {
  $('#topicBackdrop').addEventListener('click', closeTopic);
  $$('#quickTiles .tile').forEach((t) => t.addEventListener('click', () => onTile(t.dataset.tile)));
}
function renderExplore() {
  $('#tileFav').textContent = state.words.filter((w) => w.favorite).length;
  $('#tileMine').textContent = state.words.length;
  $('#tileHist').textContent = state.words.filter((w) => w.seen > 0).length;
  $('#topicGrid').innerHTML = PACKS.map((p) => `
    <button class="topic-card" data-pack="${p.id}">
      <span class="tc-emoji">${p.emoji}</span>
      <span class="tc-title">${escapeHTML(p.title)}</span>
      <span class="tc-count">${p.words.length} words</span>
    </button>`).join('');
  $$('#topicGrid .topic-card').forEach((c) => c.addEventListener('click', () => openTopic(c.dataset.pack)));
}
function onTile(kind) {
  if (kind === 'surprise') { openTopic(PACKS[Math.floor(Math.random() * PACKS.length)].id); return; }
  const map = { favorite: 'favorite', mine: 'all', history: 'history' };
  state.library.filter = map[kind] || 'all';
  $$('#filterChips .chip').forEach((c) => c.classList.toggle('active', c.dataset.filter === state.library.filter));
  switchView('library');
}

function openTopic(id) {
  const pack = getPack(id); if (!pack) return;
  state.topicId = id;
  renderTopic(pack);
  document.body.classList.add('modal-open');
  $('#topicBackdrop').classList.remove('hidden'); $('#topicSheet').classList.remove('hidden');
  $('#topicSheet').scrollTop = 0;
  requestAnimationFrame(() => $('#topicSheet').classList.add('up'));
}
function closeTopic() {
  document.body.classList.remove('modal-open');
  $('#topicSheet').classList.remove('up'); $('#topicBackdrop').classList.add('hidden');
  setTimeout(() => $('#topicSheet').classList.add('hidden'), 250);
}
function haveWord(text) { return state.words.some((w) => w.word.toLowerCase() === text.toLowerCase()); }
function renderTopic(pack) {
  const body = $('#topicBody');
  const remaining = pack.words.filter((pw) => !haveWord(pw.word)).length;
  body.innerHTML = `
    <div class="topic-hd"><div class="topic-emoji">${pack.emoji}</div>
      <div class="topic-title">${escapeHTML(pack.title)}</div>
      <div class="topic-blurb">${escapeHTML(pack.blurb)}</div></div>
    <div class="topic-actions">
      <button class="btn primary" id="topicSwipe">🃏 Swipe these</button>
      <button class="btn ghost" id="topicQuiz">🎯 Quiz these</button>
      <button class="btn ghost" id="addAll" ${remaining ? '' : 'disabled'}>${remaining ? `Add all ${remaining}` : 'All added ✓'}</button>
      <button class="btn ghost" id="topicClose">Close</button>
    </div>
    <div>${pack.words.map((pw, i) => {
      const added = haveWord(pw.word);
      const m = pw.meanings[0] || {};
      return `<div class="pack-word">
        <div class="pw-main"><div class="pw-word">${escapeHTML(pw.word)}</div>
          <div class="pw-def">${m.partOfSpeech ? `<span class="pos">${posShort(m.partOfSpeech)}</span>` : ''}${escapeHTML(m.definition || '')}</div></div>
        <button class="pw-add ${added ? 'added' : ''}" data-i="${i}">${added ? '✓' : '＋'}</button></div>`;
    }).join('')}</div>`;
  $('#topicClose').addEventListener('click', closeTopic);
  $('#topicSwipe').addEventListener('click', () => {
    state.deckScope = { title: pack.title, words: pack.words.slice() };
    closeTopic(); switchView('review');
  });
  $('#topicQuiz').addEventListener('click', () => {
    const pool = packPool(pack);
    closeTopic(); switchView('practice'); startPlay('mc', pool);
  });
  $('#addAll').addEventListener('click', async () => {
    let n = 0; for (const pw of pack.words) if (!haveWord(pw.word)) { await addPackWord(pw); n++; }
    renderTopic(pack); toast(`Added ${n} word${n === 1 ? '' : 's'} to your list ✦`);
  });
  $$('#topicBody .pw-add').forEach((btn) => btn.addEventListener('click', async () => {
    const pw = pack.words[+btn.dataset.i];
    if (haveWord(pw.word)) return;
    await addPackWord(pw); btn.classList.add('added'); btn.textContent = '✓';
    const rem = pack.words.filter((x) => !haveWord(x.word)).length;
    const all = $('#addAll'); if (all) { all.disabled = !rem; all.textContent = rem ? `Add all ${rem}` : 'All added ✓'; }
  }));
}
async function addPackWord(pw) {
  const rec = makeWord({ ...pw, source: 'pack' });
  await putWord(rec); state.words.push(rec);
  return rec;
}

// Every unique word in the app (built-in bank), memoized.
let ALL_WORDS = null;
function allWords() {
  if (!ALL_WORDS) {
    const seen = new Set(); ALL_WORDS = [];
    for (const p of PACKS) for (const wd of p.words) {
      const k = wd.word.toLowerCase();
      if (!seen.has(k)) { seen.add(k); ALL_WORDS.push(wd); }
    }
  }
  return ALL_WORDS;
}

// ================= PRACTICE =================
function wirePractice() {
  $$('#challengeGrid .challenge-card').forEach((c) => c.addEventListener('click', () => startPlay(c.dataset.mode)));
  $$('#practiceHome .mode-card').forEach((c) => c.addEventListener('click', () => startPlay(c.dataset.mode)));
  $('#quizAgainBtn').addEventListener('click', () => startPlay(state.play ? state.play.mode : 'mc', state.play ? state.play.pool : null));
  $('#quizDoneBtn').addEventListener('click', resetPractice);
  $('#quizQuit').addEventListener('click', quitPlay);
}
function poolReady() { return state.words.filter((w) => w.definition).length; }
function defaultPool() { return state.words.filter((w) => w.definition); }
// Turn a pack's words into quiz-ready objects (synthetic ids; not saved).
function packPool(pack) {
  return pack.words.map((pw, i) => {
    const md = pw.meanings[0] || {};
    return { id: 'pk_' + i + '_' + pw.word, word: pw.word, definition: md.definition || '', partOfSpeech: md.partOfSpeech || '' };
  }).filter((x) => x.definition);
}
function resetPractice() {
  stopTimer();
  $('#practiceHome').classList.remove('hidden');
  $('#quizRun').classList.add('hidden');
  $('#quizResults').classList.add('hidden');
  const n = poolReady(), ok = n >= 4;
  $('#practiceNote').textContent = ok ? `${n} words ready to practice.` : `Add at least 4 words with definitions to unlock practice (${n}/4). Try the Explore tab.`;
  $$('#challengeGrid .challenge-card, #practiceHome .mode-card').forEach((c) => { c.disabled = !ok; c.classList.toggle('disabled', !ok); });
}
function makeQuestion(w, type, pool) {
  if (type === 'mc') {
    const distractors = pool.filter((x) => x.id !== w.id && x.definition !== w.definition)
      .sort(() => Math.random() - 0.5).slice(0, 3).map((x) => x.definition);
    const options = [w.definition, ...distractors].sort(() => Math.random() - 0.5);
    return { word: w, type: 'mc', options, answer: w.definition };
  }
  return { word: w, type: 'type', answer: w.word };
}
function buildQuestions(type, count, pool) {
  const out = []; if (!pool.length) return out;
  while (out.length < count) {
    const sh = shuffle(pool);
    for (const w of sh) { if (out.length >= count) break; out.push(makeQuestion(w, type, pool)); }
    if (pool.length < 2) break;
  }
  return out;
}
function startPlay(mode, poolWords) {
  const cfg = PLAY[mode]; if (!cfg) return;
  const pool = (poolWords && poolWords.length) ? poolWords : defaultPool();
  if (pool.length < 4) { toast('Need at least 4 words with definitions to play.'); return; }
  const total = (mode === 'mc' || mode === 'type') ? Math.min(cfg.total, pool.length) : cfg.total;
  state.play = { mode, cfg, pool, questions: buildQuestions(cfg.type, total, pool), index: 0, score: 0, lives: cfg.lives, time: cfg.time, over: false };
  $('#practiceHome').classList.add('hidden'); $('#quizResults').classList.add('hidden'); $('#quizRun').classList.remove('hidden');
  updatePlayHeader(); updateProgressRow(); renderQuestion();
  if (cfg.time) startTimer();
}
function updatePlayHeader() {
  const p = state.play, h = $('#playHeader');
  if (p.cfg.stopOnWrong) h.innerHTML = `<span class="play-label">Perfect streak: ${p.score}</span>`;
  else if (p.cfg.lives) h.innerHTML = `<span class="play-lives">${'❤️'.repeat(p.lives)}${'🤍'.repeat(p.cfg.lives - p.lives)}</span>`;
  else if (p.cfg.time) h.innerHTML = `<span class="play-timer" id="pTimer">0:${String(Math.max(p.time, 0)).padStart(2, '0')}</span>`;
  else h.innerHTML = `<span class="play-label">${p.cfg.label}</span>`;
}
function updateProgressRow() {
  const p = state.play;
  const fixed = p.mode === 'mc' || p.mode === 'type';
  $('#quizScore').textContent = fixed ? `${p.score}/${p.questions.length}` : `${p.score}`;
  let w = 0;
  if (fixed) w = p.index / p.questions.length * 100;
  else if (p.cfg.time) w = p.time / p.cfg.time * 100;
  else if (p.cfg.stopOnWrong) w = 100;
  $('#quizProgress').style.width = w + '%';
}
function renderQuestion() {
  const p = state.play, q = p.questions[p.index], box = $('#quizQuestion');
  if (q.type === 'mc') {
    box.innerHTML = `<div class="q-prompt">What does this mean?</div>
      <div class="q-word">${escapeHTML(q.word.word)}</div>
      <div class="q-options">${q.options.map((o) => `<button class="q-option">${escapeHTML(o)}</button>`).join('')}</div>`;
    $$('.q-option', box).forEach((btn) => btn.addEventListener('click', () => {
      const correct = btn.textContent === q.answer;
      $$('.q-option', box).forEach((b) => { b.disabled = true; if (b.textContent === q.answer) b.classList.add('correct'); else if (b === btn) b.classList.add('wrong'); });
      grade(q.word, correct);
    }));
  } else {
    box.innerHTML = `<div class="q-prompt">Which word means…</div>
      <div class="q-def">${q.word.partOfSpeech ? `<span class="pos">${posShort(q.word.partOfSpeech)}</span>` : ''}${escapeHTML(q.word.definition)}</div>
      <form class="q-typeform" autocomplete="off"><input class="q-input" placeholder="type the word…" autocapitalize="none" autocomplete="off" /><button class="btn primary block" type="submit">Check</button></form>
      <div class="q-feedback hidden"></div>`;
    const form = $('.q-typeform', box), input = $('.q-input', box); input.focus();
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const correct = input.value.trim().toLowerCase() === q.answer.trim().toLowerCase();
      const fb = $('.q-feedback', box); fb.classList.remove('hidden'); fb.classList.add(correct ? 'good' : 'bad');
      fb.textContent = correct ? '✓ Correct!' : `✗ It's “${q.answer}”`;
      input.disabled = true; form.querySelector('button').disabled = true;
      grade(q.word, correct);
    });
  }
}
async function grade(word, correct) {
  const p = state.play;
  if (correct) p.score++;
  else if (p.cfg.lives && !p.cfg.stopOnWrong) p.lives--;
  // Only record mastery for words that are actually in your list (skip topic-quiz pool words).
  const rec = state.words.find((w) => w.id === word.id);
  if (rec) { applyReview(rec, correct); await putWord(rec); }
  updatePlayHeader(); updateProgressRow();
  setTimeout(() => {
    if (p.over) return;
    if (p.cfg.stopOnWrong && !correct) return finishPlay();
    if (p.cfg.lives && !p.cfg.stopOnWrong && p.lives <= 0) return finishPlay();
    p.index++;
    if (p.index >= p.questions.length) return finishPlay();
    renderQuestion();
  }, correct ? 480 : 900);
}
let timerId = null;
function startTimer() { stopTimer(); timerId = setInterval(() => {
  const p = state.play; if (!p) return stopTimer();
  p.time--; const t = $('#pTimer');
  if (t) { t.textContent = `0:${String(Math.max(p.time, 0)).padStart(2, '0')}`; if (p.time <= 10) t.classList.add('low'); }
  updateProgressRow();
  if (p.time <= 0) finishPlay();
}, 1000); }
function stopTimer() { if (timerId) { clearInterval(timerId); timerId = null; } }
function quitPlay() { if (state.play) state.play.over = true; stopTimer(); resetPractice(); }
async function finishPlay() {
  const p = state.play; if (!p || p.over) { /* still show */ }
  if (p) p.over = true;
  stopTimer();
  $('#quizRun').classList.add('hidden'); $('#quizResults').classList.remove('hidden');
  const score = p.score, fixed = p.mode === 'mc' || p.mode === 'type';
  const denom = fixed ? p.questions.length : null;
  $('#resultsScore').textContent = denom ? `${score}/${denom}` : `${score}`;
  const pct = denom ? score / denom : 1;
  let emoji = '📚', title = 'Nice work', sub = '';
  if (p.mode === 'sprint') { title = 'Time!'; emoji = '⏱️'; sub = `You got ${score} right in 60 seconds.`; }
  else if (p.mode === 'rush') { title = 'Out of lives'; emoji = '⚡'; sub = `You answered ${score} correctly.`; }
  else if (p.mode === 'perfection') { title = score >= p.questions.length ? 'Flawless!' : 'One slip!'; emoji = '💯'; sub = `Perfect streak of ${score}.`; }
  else if (pct === 1) { emoji = '✦'; title = 'Perfect'; sub = 'Flawless recall.'; }
  else if (pct >= 0.8) { emoji = '🌿'; title = 'Brilliant'; sub = 'You really know these.'; }
  else if (pct >= 0.5) { emoji = '👏'; title = 'Nice work'; sub = 'A little more practice.'; }
  else { title = 'Keep going'; sub = 'Every miss is a word to practice.'; }
  $('#resultsEmoji').textContent = emoji; $('#resultsTitle').textContent = title; $('#resultsSub').textContent = sub;
  await touchStreak(); renderStreak();
  const great = (p.mode === 'perfection' && score >= p.questions.length) || (p.mode === 'sprint' && score >= 15) || (p.mode === 'rush' && score >= 15) || (fixed && pct >= 0.8);
  if (great) burst({ count: 120, colors: ['#5E8B77', '#9DB8AC', '#C0913C', '#C4674E', '#EADFcf'] });
}

// ================= MENU / BACKUP =================
function wireMenu() {
  $('#menuBtn').addEventListener('click', openSheet);
  $('#statsBtn').addEventListener('click', () => switchView('review'));
  $('#closeSheetBtn').addEventListener('click', closeSheet);
  $('#sheetBackdrop').addEventListener('click', closeSheet);
  $('#exportBtn').addEventListener('click', () => doExport(false));
  $('#shareBtn').addEventListener('click', () => doExport(true));
  $('#importInput').addEventListener('change', doImport);
  $('#wipeBtn').addEventListener('click', doWipe);
}
function openSheet() { document.body.classList.add('modal-open'); $('#sheetBackdrop').classList.remove('hidden'); $('#menuSheet').classList.remove('hidden'); requestAnimationFrame(() => $('#menuSheet').classList.add('up')); updateStorageNote(); }
function closeSheet() { document.body.classList.remove('modal-open'); $('#menuSheet').classList.remove('up'); $('#sheetBackdrop').classList.add('hidden'); setTimeout(() => $('#menuSheet').classList.add('hidden'), 250); }
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
  setTimeout(() => URL.revokeObjectURL(url), 1000); toast('Backup saved ⬇️');
}
async function doImport(e) {
  const file = e.target.files && e.target.files[0]; if (!file) return;
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
  $('#uploadIdle').classList.remove('hidden'); $('#uploadProcessing').classList.add('hidden'); $('#uploadReview').classList.add('hidden');
  $('#fileInput').value = ''; $('#cameraInput').value = ''; state.pendingEntries = [];
}
async function onFilePicked(e) {
  const file = e.target.files && e.target.files[0]; if (!file) return;
  $('#uploadIdle').classList.add('hidden'); $('#uploadReview').classList.add('hidden'); $('#uploadProcessing').classList.remove('hidden');
  setProgress(0);
  try {
    const text = await recognize(file, setProgress);
    const entries = parseText(text);
    if (!entries.length) { toast("Couldn't find clear words — try a sharper screenshot."); resetUpload(); return; }
    state.pendingEntries = entries; showUploadReview();
  } catch (err) { console.error(err); toast('Something went wrong reading that image.'); resetUpload(); }
}
function setProgress(p) { $('#ocrProgress').style.width = Math.round(p * 100) + '%'; }
function showUploadReview() { $('#uploadIdle').classList.add('hidden'); $('#uploadProcessing').classList.add('hidden'); $('#uploadReview').classList.remove('hidden'); renderFoundList(); }
function renderFoundList() {
  const el = $('#foundList');
  $('#foundTitle').textContent = `Found ${state.pendingEntries.length} ${state.pendingEntries.length === 1 ? 'word' : 'words'}`;
  el.innerHTML = state.pendingEntries.map((e, i) => `<div class="found-item" data-i="${i}">
    <input class="found-word" data-i="${i}" placeholder="word" value="${escapeAttr(e.word)}" />
    <textarea class="found-def" data-i="${i}" placeholder="definition (leave blank to auto-define)" rows="2">${escapeHTML(e.definition || '')}</textarea>
    <button class="found-del" data-del="${i}">✕</button></div>`).join('');
  $$('.found-del', el).forEach((btn) => btn.addEventListener('click', () => { collectEntries(); state.pendingEntries.splice(Number(btn.dataset.del), 1); renderFoundList(); }));
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
  renderFoundList(); btn.disabled = false; btn.textContent = '✨ Auto-define'; toast('Definitions added where found.');
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
      existing.phonetic = existing.phonetic || e.phonetic || ''; existing.audio = existing.audio || e.audio || '';
      const p = (existing.meanings || [])[0] || {};
      existing.definition = p.definition || existing.definition; existing.example = p.example || existing.example; existing.partOfSpeech = p.partOfSpeech || existing.partOfSpeech;
      await putWord(upgradeWord(existing)); updated++;
    } else { await putWord(makeWord(e)); added++; }
  }
  state.words = (await getAllWords()).map(upgradeWord);
  await touchStreak(); renderStreak();
  btn.disabled = false; btn.textContent = 'Save words'; resetUpload();
  toast(`Saved ${added} new${updated ? `, updated ${updated}` : ''} ✦`);
  switchView('review');
}

// ---------- utils ----------
function escapeHTML(s) { return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function escapeAttr(s) { return escapeHTML(s).replace(/"/g, '&quot;'); }

init();
