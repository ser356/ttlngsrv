#!/usr/bin/env node
// scripts/sync-spec.mjs
//
// Lee src/lexer.tt del repo tetsuo (kw_kind) y regenera
//   - src/spec.ts (bloque entre GENERATED-START/END)
//   - repository.keywords/builtins/nil match en tetsuo.tmLanguage.json
//
// Por defecto imprime dry-run; --apply escribe los ficheros.
// Falla ruidosamente si aparece un kw_* sin bucket asignado abajo.

import { readFileSync, writeFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { argv, exit } from 'process';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

const args = argv.slice(2);
const apply = args.includes('--apply');
const tetsuoRoot = args.find(a => !a.startsWith('--'));

if (!tetsuoRoot) {
  console.error('uso: sync-spec.mjs <tetsuo-repo-root> [--apply]');
  exit(2);
}

const BUCKET = {
  fun: 'storage',
  let: 'storage',
  const: 'storage',
  struct: 'storage',
  bss: 'storage',
  return: 'control',
  if: 'control',
  else: 'control',
  loop: 'control',
  while: 'control',
  break: 'control',
  nil: 'constant',
  sizeof: 'builtin',
};

const lexerPath = join(tetsuoRoot, 'src', 'lexer.tt');
let src;
try {
  src = readFileSync(lexerPath, 'utf8');
} catch (e) {
  console.error(`error: no puedo leer ${lexerPath}: ${e.message}`);
  exit(1);
}

const kwRe = /let\s+kw_(\w+)\s*:\s*str\s*=\s*'([^']+)'/g;
const found = new Map();
let m;
while ((m = kwRe.exec(src)) !== null) found.set(m[1], m[2]);

if (found.size === 0) {
  console.error(`error: no kw_* en ${lexerPath}`);
  exit(1);
}

const missing = [...found.keys()].filter(k => !(k in BUCKET));
if (missing.length) {
  console.error(`error: kw sin bucket: ${missing.join(', ')}`);
  console.error('actualiza BUCKET en scripts/sync-spec.mjs antes de continuar');
  exit(1);
}

const orphan = Object.keys(BUCKET).filter(k => !found.has(k));
if (orphan.length) {
  console.error(`warn: BUCKET tiene claves ausentes en lexer.tt: ${orphan.join(', ')}`);
}

const bkt = { control: [], storage: [], constant: [], builtin: [] };
for (const [id, lit] of found) bkt[BUCKET[id]].push(lit);

const specBlock =
  `export const CONTROL_KW = ${JSON.stringify(bkt.control)} as const;\n` +
  `export const STORAGE_KW = ${JSON.stringify(bkt.storage)} as const;\n` +
  `export const CONSTANTS  = ${JSON.stringify(bkt.constant)} as const;\n` +
  `export const BUILTINS   = ${JSON.stringify([...bkt.builtin, 'syscall'])} as const;\n` +
  `export const TYPES      = ["u8","u32","u64","str"] as const;\n`;

const specPath = join(REPO, 'src', 'spec.ts');
const specSrc = readFileSync(specPath, 'utf8');
const specStart = specSrc.indexOf('// GENERATED-START');
const specEnd = specSrc.indexOf('// GENERATED-END');
if (specStart < 0 || specEnd < 0 || specEnd < specStart) {
  console.error('error: no encuentro los marcadores GENERATED-START/END en src/spec.ts');
  exit(1);
}
const specHeader = specSrc.slice(0, specStart);
const specFooter = specSrc.slice(specEnd);
const newSpec =
  specHeader +
  '// GENERATED-START keywords: run `npm run sync-spec:apply` para refrescar\n' +
  specBlock +
  specFooter;

const tmLangPath = join(REPO, 'tetsuo.tmLanguage.json');
const g = JSON.parse(readFileSync(tmLangPath, 'utf8'));

const controlP = g.repository.keywords.patterns.find(p => p.name === 'keyword.control.tetsuo');
const storageP = g.repository.keywords.patterns.find(p => p.name === 'storage.type.tetsuo');
const modifierP = g.repository.keywords.patterns.find(p => p.name === 'storage.modifier.tetsuo');

const storageTypes = bkt.storage.filter(k => k === 'let' || k === 'struct');
const storageMods = bkt.storage.filter(k => k === 'const' || k === 'bss');

if (controlP) controlP.match = `\\b(${bkt.control.join('|')})\\b`;
if (storageP) storageP.match = `\\b(${storageTypes.join('|')})\\b`;
if (modifierP) modifierP.match = `\\b(${storageMods.join('|')})\\b`;
g.repository.builtins.match = `\\b(${[...bkt.builtin, 'syscall'].join('|')})\\b(?=\\s*\\()`;
g.repository.nil.match = `\\b(${bkt.constant.join('|')})\\b`;

const newTmLang = JSON.stringify(g, null, 2) + '\n';

const summary = {
  lexer_path: lexerPath,
  keywords_found: Object.fromEntries(found),
  buckets: bkt,
  orphans_in_bucket_table: orphan,
  mode: apply ? 'apply' : 'dry-run',
};

console.log(JSON.stringify(summary, null, 2));

if (!apply) {
  console.log('\n--- src/spec.ts (nuevo) ---');
  console.log(newSpec);
  console.log('--- tetsuo.tmLanguage.json (repository.keywords/builtins/nil) ---');
  console.log(JSON.stringify({
    keywords: g.repository.keywords,
    builtins: g.repository.builtins,
    nil: g.repository.nil,
  }, null, 2));
  console.log('\npara aplicar: npm run sync-spec:apply');
  exit(0);
}

writeFileSync(specPath, newSpec);
writeFileSync(tmLangPath, newTmLang);
console.log('\naplicado: src/spec.ts + tetsuo.tmLanguage.json');
