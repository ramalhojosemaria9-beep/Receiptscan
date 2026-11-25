'use strict';

const sharp = require('sharp');

// Preprocesses phone photos of receipts for OCR: auto-orientation, upscale
// small prints, convert to grayscale with normalised contrast, sharpen.
async function preprocessForOcr(buffer) {
  try {
    return await sharp(buffer)
      .rotate()
      .resize({ width: 2200, withoutEnlargement: false })
      .gamma(1.4)
      .grayscale()
      .normalise({ lower: 2, upper: 98 })
      .sharpen()
      .png()
      .toBuffer();
  } catch {
    return buffer;
  }
}

module.exports = { preprocessForOcr };
