/**
 * Phase 0 OCR spike for ui_rover v0.2.0 "read the palette".
 *
 * Measures how many of the 5 printed hex codes on the dopely "Calm SaaS" card
 * Tesseract.js v7 reads EXACTLY, across:
 *   - image prep   : full-image downscale vs. card crop (upscale factor / kernel)
 *   - engine (OEM) : LSTM_ONLY vs. TESSERACT_ONLY (legacy)
 *   - PSM          : SPARSE_TEXT / AUTO / SINGLE_BLOCK
 *   - whitelist    : off vs. `#0123456789ABCDEFabcdef`
 *
 * Run:  node scripts/spike/ocr-spike.mjs
 * Deps: tesseract.js (project), sharp (NOT a project dep — see SHARP note below).
 *
 * sharp is only needed for image prep. It is resolved from, in order:
 *   1. $SPIKE_SHARP_DIR/node_modules/sharp
 *   2. the project's own node_modules (if someone later adds it)
 * so the spike never has to be added to package.json.
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';

import { createWorker, OEM, PSM } from 'tesseract.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

// ---------------------------------------------------------------- sharp ----
function loadSharp() {
  const candidates = [];
  if (process.env.SPIKE_SHARP_DIR) {
    candidates.push(path.join(process.env.SPIKE_SHARP_DIR, 'package.json'));
  }
  candidates.push(path.join(ROOT, 'package.json'));
  for (const base of candidates) {
    try {
      return createRequire(base)('sharp');
    } catch {
      /* try next */
    }
  }
  throw new Error(
    'sharp not found. Install it somewhere outside the project and set ' +
      'SPIKE_SHARP_DIR=/path/to/that/dir (the dir containing node_modules/sharp).',
  );
}
const sharp = loadSharp();

// ------------------------------------------------------------- fixtures ----
const FIXTURE = path.join(ROOT, 'docs', '6-memo', 'fixtures', 'dopely-calm-saas.png');

/**
 * Ground truth = what the card actually prints, verified at 10x zoom and by
 * sampling the swatch pixels. NOTE: the task brief listed `#2F68FF` for row 2;
 * both the printed glyphs and the swatch pixel (#2f6bff) say `#2F6BFF`.
 */
const GROUND_TRUTH = ['101828', '2F6BFF', '475467', 'D0D5DD', 'FFFFFF'];

/**
 * Card rectangle, normalized 0-1 over the 3024x1964 fixture. Found by cropping
 * candidates and eyeballing the previews (see --dump).
 */
const CARD_RECT = { x: 0.3631, y: 0.4292, w: 0.1528, h: 0.2974 };
/** Just the five hex rows — a tighter, more aggressive crop. */
const ROWS_RECT = { x: 0.3631, y: 0.5245, w: 0.1528, h: 0.1002 };

const DUMP = process.argv.includes('--dump');
const DUMP_DIR = path.join(ROOT, 'public', 'ocr-spike');

// ---------------------------------------------------------- image prep ----
function rectToExtract(rect, meta) {
  return {
    left: Math.round(rect.x * meta.width),
    top: Math.round(rect.y * meta.height),
    width: Math.round(rect.w * meta.width),
    height: Math.round(rect.h * meta.height),
  };
}

async function buildInputs() {
  const meta = await sharp(FIXTURE).metadata();
  const card = rectToExtract(CARD_RECT, meta);
  const rows = rectToExtract(ROWS_RECT, meta);
  const inputs = [];

  inputs.push({
    name: 'full-2000',
    note: `full image, longest edge -> 2000 (from ${meta.width}x${meta.height})`,
    make: () => sharp(FIXTURE).resize({ width: 2000, kernel: 'lanczos3' }).png().toBuffer(),
  });

  const cropVariants = [
    ['crop-1200-lanczos', 1200, 'lanczos3'],
    ['crop-1200-nearest', 1200, 'nearest'],
    ['crop-2x-lanczos', card.width * 2, 'lanczos3'],
    ['crop-4x-lanczos', card.width * 4, 'lanczos3'],
  ];
  for (const [name, width, kernel] of cropVariants) {
    inputs.push({
      name,
      note: `card crop ${card.width}x${card.height} -> ${Math.round(width)}px wide, ${kernel}`,
      make: () =>
        sharp(FIXTURE)
          .extract(card)
          .resize({ width: Math.round(width), kernel })
          .png()
          .toBuffer(),
    });
  }

  inputs.push({
    name: 'rows-1200-lanczos',
    note: `hex-rows crop ${rows.width}x${rows.height} -> 1200px wide, lanczos3`,
    make: () =>
      sharp(FIXTURE).extract(rows).resize({ width: 1200, kernel: 'lanczos3' }).png().toBuffer(),
  });

  // materialize
  for (const input of inputs) {
    input.buffer = await input.make();
    const m = await sharp(input.buffer).metadata();
    input.dims = `${m.width}x${m.height}`;
    if (DUMP) {
      fs.mkdirSync(DUMP_DIR, { recursive: true });
      fs.writeFileSync(path.join(DUMP_DIR, `${input.name}.png`), input.buffer);
    }
  }
  return inputs;
}

// ------------------------------------------------------------- scoring ----
const HEXISH = /^#?[0-9a-f]{6}$/i;

function normalize(token) {
  return token.replace(/^#/, '').toUpperCase();
}

function editDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[a.length][b.length];
}

function flattenWords(data) {
  const out = [];
  for (const block of data.blocks ?? []) {
    for (const para of block.paragraphs ?? []) {
      for (const line of para.lines ?? []) {
        for (const word of line.words ?? []) out.push(word.text);
      }
    }
  }
  return out;
}

function score(data) {
  const raw = new Set();
  for (const w of flattenWords(data)) raw.add(w);
  for (const w of (data.text ?? '').split(/\s+/)) raw.add(w);

  const tokens = new Set();
  for (const w of raw) {
    const cleaned = w.replace(/[^#0-9a-zA-Z]/g, '');
    if (cleaned) tokens.add(cleaned);
  }

  const hexish = [...tokens].filter((t) => HEXISH.test(t)).map(normalize);
  const hexSet = new Set(hexish);

  const exact = GROUND_TRUTH.filter((gt) => hexSet.has(gt));
  const missed = GROUND_TRUTH.filter((gt) => !hexSet.has(gt));

  // near-miss: any token (hex-ish or not, 5-7 chars) within edit distance 1-2 of a miss
  const candidates = [...tokens].map(normalize).filter((t) => t.length >= 5 && t.length <= 7);
  const near = [];
  for (const gt of missed) {
    let best = null;
    for (const c of candidates) {
      const d = editDistance(gt, c);
      if (d >= 1 && d <= 2 && (!best || d < best.d)) best = { d, c };
    }
    if (best) near.push(`${gt}~${best.c}(${best.d})`);
  }

  const falsePositives = hexish.filter((t) => !GROUND_TRUTH.includes(t));

  return { exact, missed, near, falsePositives, hexish };
}

// ---------------------------------------------------------------- runs ----
const WHITELIST = '#0123456789ABCDEFabcdef';

const LANG_PATHS = {
  lstm: path.join(ROOT, 'node_modules', '@tesseract.js-data', 'eng', '4.0.0_best_int'),
  legacy: path.join(ROOT, 'node_modules', '@tesseract.js-data', 'eng', '4.0.0'),
};

const ENGINES = [
  { key: 'LSTM', oem: OEM.LSTM_ONLY, langPath: LANG_PATHS.lstm },
  { key: 'LEGACY', oem: OEM.TESSERACT_ONLY, langPath: LANG_PATHS.legacy },
];

const PSMS = [
  ['SPARSE_TEXT', PSM.SPARSE_TEXT],
  ['AUTO', PSM.AUTO],
  ['SINGLE_BLOCK', PSM.SINGLE_BLOCK],
];

function pad(s, n) {
  s = String(s);
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

async function main() {
  console.log('fixture:', FIXTURE);
  console.log('ground truth:', GROUND_TRUTH.map((h) => `#${h}`).join(' '));
  const inputs = await buildInputs();
  console.log(
    'inputs:\n' + inputs.map((i) => `  ${pad(i.name, 20)} ${i.dims}  (${i.note})`).join('\n'),
  );

  const rows = [];

  for (const engine of ENGINES) {
    if (!fs.existsSync(path.join(engine.langPath, 'eng.traineddata.gz'))) {
      console.log(`\n!! skipping ${engine.key}: no traineddata at ${engine.langPath}`);
      continue;
    }
    let worker;
    try {
      worker = await createWorker('eng', engine.oem, {
        langPath: engine.langPath,
        cacheMethod: 'none',
        gzip: true,
        logger: () => {},
        errorHandler: (e) => console.error(`[${engine.key}]`, e),
      });
    } catch (err) {
      console.log(`\n!! ${engine.key} worker failed to start: ${err.message}`);
      continue;
    }

    for (const [psmName, psm] of PSMS) {
      for (const wl of [false, true]) {
        await worker.setParameters({
          tessedit_pageseg_mode: psm,
          tessedit_char_whitelist: wl ? WHITELIST : '',
        });
        for (const input of inputs) {
          const t0 = performance.now();
          let data;
          try {
            const res = await worker.recognize(input.buffer, {}, { blocks: true, text: true });
            data = res.data;
          } catch (err) {
            rows.push({
              engine: engine.key,
              psm: psmName,
              wl: wl ? 'on' : 'off',
              input: input.name,
              error: err.message,
            });
            continue;
          }
          const ms = Math.round(performance.now() - t0);
          const s = score(data);
          rows.push({
            engine: engine.key,
            psm: psmName,
            wl: wl ? 'on' : 'off',
            input: input.name,
            hits: s.exact.length,
            exact: s.exact,
            near: s.near,
            fp: s.falsePositives,
            hexish: s.hexish,
            ms,
          });
          process.stdout.write('.');
        }
      }
    }
    await worker.terminate();
  }

  console.log('\n');
  const header = `${pad('engine', 7)}${pad('psm', 14)}${pad('wl', 4)}${pad('input', 20)}${pad('hits', 6)}${pad('fp', 4)}${pad('ms', 7)}near-misses / false positives`;
  console.log(header);
  console.log('-'.repeat(header.length + 20));
  rows.sort((a, b) => (b.hits ?? -1) - (a.hits ?? -1) || (a.ms ?? 0) - (b.ms ?? 0));
  for (const r of rows) {
    if (r.error) {
      console.log(`${pad(r.engine, 7)}${pad(r.psm, 14)}${pad(r.wl, 4)}${pad(r.input, 20)}ERROR ${r.error}`);
      continue;
    }
    const detail = [
      r.near.length ? `near: ${r.near.join(' ')}` : '',
      r.fp.length ? `fp: ${r.fp.slice(0, 6).join(' ')}${r.fp.length > 6 ? ' …' : ''}` : '',
    ]
      .filter(Boolean)
      .join('  |  ');
    console.log(
      `${pad(r.engine, 7)}${pad(r.psm, 14)}${pad(r.wl, 4)}${pad(r.input, 20)}${pad(`${r.hits}/5`, 6)}${pad(r.fp.length, 4)}${pad(r.ms, 7)}${detail}`,
    );
  }

  // whitelist effect check, per engine
  console.log('\nwhitelist effect (same engine/psm/input, off vs on):');
  const key = (r) => `${r.engine}|${r.psm}|${r.input}`;
  const byKey = new Map();
  for (const r of rows) {
    if (r.error) continue;
    if (!byKey.has(key(r))) byKey.set(key(r), {});
    byKey.get(key(r))[r.wl] = r;
  }
  const diffs = { LSTM: { same: 0, diff: 0 }, LEGACY: { same: 0, diff: 0 } };
  for (const [k, pair] of byKey) {
    if (!pair.on || !pair.off) continue;
    const eng = k.split('|')[0];
    const identical =
      pair.on.hexish.join(',') === pair.off.hexish.join(',') && pair.on.hits === pair.off.hits;
    diffs[eng][identical ? 'same' : 'diff']++;
    if (!identical) {
      console.log(
        `  ${k}: off=${pair.off.hits}/5 [${pair.off.hexish.join(' ')}]  on=${pair.on.hits}/5 [${pair.on.hexish.join(' ')}]`,
      );
    }
  }
  for (const [eng, d] of Object.entries(diffs)) {
    console.log(`  ${eng}: identical in ${d.same} pairs, different in ${d.diff} pairs`);
  }

  const best = rows.filter((r) => !r.error).reduce((a, b) => (b.hits > a.hits ? b : a), rows[0]);
  console.log(
    `\nBEST (single pass): ${best.engine} ${best.psm} wl=${best.wl} ${best.input} -> ${best.hits}/5 in ${best.ms}ms`,
  );
  if (best.hits < 4) {
    console.log('\n*** NO CONFIGURATION REACHED 4/5 — the plan must be re-scoped. ***');
  }

  await twoPassArm();
}

/**
 * Two-pass arm: 1200px and 1900px are complementary — 1200 reads four codes but
 * collapses the `5` in #D0D5DD, 1900 reads #D0D5DD but loses two others.
 * Unioning the hex tokens from both passes gets 5/5 with zero false positives.
 */
async function twoPassArm() {
  console.log('\ntwo-pass arm (LSTM / AUTO / whitelist off, same worker, card crop at 2 widths):');
  const meta = await sharp(FIXTURE).metadata();
  const card = rectToExtract(CARD_RECT, meta);
  const t0 = performance.now();
  const worker = await createWorker('eng', OEM.LSTM_ONLY, {
    langPath: LANG_PATHS.lstm,
    cacheMethod: 'none',
    gzip: true,
    logger: () => {},
  });
  console.log(`  worker create: ${Math.round(performance.now() - t0)}ms`);
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.AUTO,
    tessedit_char_whitelist: '',
  });

  const union = new Set();
  let total = 0;
  for (const width of [1200, 1900]) {
    const p0 = performance.now();
    const buf = await sharp(FIXTURE)
      .extract(card)
      .resize({ width, kernel: 'lanczos3' })
      .png()
      .toBuffer();
    const prep = Math.round(performance.now() - p0);
    const r0 = performance.now();
    const { data } = await worker.recognize(buf, {}, { blocks: true, text: true });
    const ms = Math.round(performance.now() - r0);
    total += prep + ms;
    const s = score(data);
    s.hexish.forEach((h) => union.add(h));
    console.log(`  width ${width}: prep ${prep}ms  ocr ${ms}ms  ${s.exact.length}/5  [${s.hexish.join(' ')}]`);
  }
  await worker.terminate();

  const hits = GROUND_TRUTH.filter((g) => union.has(g));
  const fp = [...union].filter((t) => !GROUND_TRUTH.includes(t));
  console.log(
    `  UNION: ${hits.length}/5 exact, ${fp.length} false positives, ${total}ms total (warm worker)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
