'use strict';

const { createWorker } = require('tesseract.js');
const { preprocessForOcr } = require('./preprocess');
const path = require('node:path');

const LANG_PATH = path.join(
  __dirname,
  'node_modules',
  '@tesseract.js-data',
  'eng',
  '4.0.0'
);

let workerPromise = null;

async function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker('eng', 1, {
      langPath: LANG_PATH,
      gzip: true,
      logger: () => {},
    }).catch((err) => {
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

// OCR the preprocessed image; for hard photos also try the original and keep
// the higher-confidence result.
async function ocrImage(buffer) {
  const worker = await getWorker();
  const processed = await preprocessForOcr(buffer);
  const primary = await worker.recognize(processed);

  if (primary.data.confidence >= 60) {
    return { text: primary.data.text, confidence: primary.data.confidence };
  }

  try {
    const fallback = await worker.recognize(buffer);
    return fallback.data.confidence > primary.data.confidence
      ? { text: fallback.data.text, confidence: fallback.data.confidence }
      : { text: primary.data.text, confidence: primary.data.confidence };
  } catch {
    return { text: primary.data.text, confidence: primary.data.confidence };
  }
}

module.exports = { ocrImage };
