# ✦ VocabMaster

Turn screenshots of highlighted words into a swipeable flashcard deck — so the
words you look up actually stick.

Built as a **phone-first, offline-capable web app** with no server, no login, and
no build step. Everything lives on your device.

---

## What it does

- 📸 **Upload a screenshot** — of highlighted words, a glossary, or a word list.
  On-device OCR reads the text and sorts it into word / definition pairs for you.
- ✨ **Auto-define** — for words it finds without a definition, it fetches one
  (definition, example, part of speech) from a free dictionary. You can edit
  anything before saving.
- 🃏 **Swipe to learn** — Tinder-style cards. Tap to flip (word ↔ meaning),
  swipe **right** if you know it, **left** to keep practicing.
- 📚 **Library** — every word you've saved, searchable, with a mastery ring and
  New / Learning / Mastered filters.
- 🎯 **Quiz yourself** — pick **multiple choice** or **type-the-answer** each
  time. Celebratory results with confetti.
- 🔥 **Streaks** — a daily streak keeps you coming back.
- 💾 **Your words are saved on your device** (durable IndexedDB storage) with
  one-tap **Export / Import** backups so you never lose them.

Mastery is simple: get a word right **3 times in a row** and it's *Mastered* 🏆.

---

## Use it on your phone

### 1. Turn on GitHub Pages
1. Push this repo to GitHub (see below).
2. On GitHub: **Settings → Pages**.
3. Under *Build and deployment*, set **Source: Deploy from a branch**, pick your
   branch and folder **/ (root)**, then **Save**.
4. After a minute your app is live at
   `https://<your-username>.github.io/<repo-name>/`.

### 2. Add it to your home screen
Open that URL on your phone, then:
- **iPhone (Safari):** Share → *Add to Home Screen*.
- **Android (Chrome):** menu ⋮ → *Install app* / *Add to Home screen*.

It now opens full-screen like a real app, and works offline for reviewing and
quizzing. (Reading a screenshot and auto-defining new words need internet.)

---

## Backups (don't lose your words)

Tap the **⋯** menu (top right):
- **Export my words** — saves a `.json` backup file to your phone.
- **Share / save backup** — sends it to your share sheet (iCloud, Drive, Notes…).
- **Import from a backup file** — restores from a backup (skips duplicates).

Your words live in this browser's storage. It's durable, but clearing all
browser data would erase it — so export a backup now and then.

---

## Push this repo to GitHub

```bash
git add .
git commit -m "VocabMaster app"
git push -u origin <your-branch>
```

Then follow **Turn on GitHub Pages** above.

---

## How it's built

Plain HTML, CSS, and JavaScript (ES modules) — no framework, no bundler.

| File | Purpose |
|------|---------|
| `index.html` | App shell & all screens |
| `styles.css` | Bold & playful design system |
| `app.js` | Main controller (navigation, swipe, quiz, backup) |
| `js/store.js` | IndexedDB storage, mastery & streak logic, export/import |
| `js/ocr.js` | Reads text from screenshots (Tesseract.js, loaded on demand) |
| `js/parser.js` | Sorts OCR text into word / definition pairs |
| `js/dictionary.js` | Auto-defines words via dictionaryapi.dev |
| `js/confetti.js` | Celebration confetti |
| `sw.js` + `manifest.webmanifest` | Offline support & installable PWA |
| `design/mockup.html` | The original design-system reference |

### Privacy
Everything runs in your browser. Your words are stored only on your device.
The app talks to the internet in just two cases: loading the OCR engine the
first time you upload an image, and looking up a definition when you auto-define
a word. Nothing is uploaded to any server.

### External services (free, no keys)
- **Tesseract.js** (CDN) — on-device OCR.
- **dictionaryapi.dev** — free dictionary lookups.
