'use strict';

const { createWorker } = require('tesseract.js');
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

async function ocrImage(buffer) {
  const worker = await getWorker();
  const ret = await worker.recognize(buffer);
  const { text, confidence } = ret.data;
  return { text, confidence };
}

module.exports = { ocrImage };
