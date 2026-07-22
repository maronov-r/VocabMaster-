// ocr.js — read text from an uploaded screenshot using Tesseract.js.
// Loaded lazily from a CDN only when the user actually uploads an image,
// so the rest of the app stays light and works offline.

const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.esm.min.js';

let tesseractPromise = null;

async function loadTesseract() {
  if (!tesseractPromise) {
    tesseractPromise = import(/* @vite-ignore */ TESSERACT_URL)
      .then((mod) => mod.default || mod)
      .catch((err) => {
        tesseractPromise = null;
        throw err;
      });
  }
  return tesseractPromise;
}

// Recognize text in an image File/Blob/URL.
// onProgress(fraction 0..1) reports OCR progress.
export async function recognize(image, onProgress) {
  const Tesseract = await loadTesseract();
  const worker = await Tesseract.createWorker('eng', 1, {
    logger: (m) => {
      if (onProgress && m.status === 'recognizing text') onProgress(m.progress);
    },
  });
  try {
    const { data } = await worker.recognize(image);
    return data.text || '';
  } finally {
    await worker.terminate();
  }
}
