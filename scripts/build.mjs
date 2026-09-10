import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const dist = resolve(root, 'dist');
const copy = (source, target = source) => cp(resolve(root, source), resolve(dist, target), { recursive: true });

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
const publicConfig = { supabaseUrl: process.env.VITE_SUPABASE_URL || null, supabaseAnonKey: process.env.VITE_SUPABASE_ANON_KEY || null };
await writeFile(resolve(dist, 'config.js'), `globalThis.__APP_CONFIG__ = ${JSON.stringify(publicConfig)};`);
for (const file of ['index.html', 'styles.css', 'phase2.js']) await copy(file);
await copy('src');
await copy('node_modules/@supabase/supabase-js/dist/umd/supabase.js');
await copy('node_modules/xlsx/dist/xlsx.full.min.js');
await copy('node_modules/docx/dist/index.iife.js');
await copy('node_modules/tesseract.js/dist/tesseract.min.js');
await copy('node_modules/tesseract.js/dist/worker.min.js');
await copy('node_modules/tesseract.js-core/tesseract-core.wasm.js');
await copy('node_modules/tesseract.js-core/tesseract-core.wasm');
await copy('node_modules/@tesseract.js-data/jpn/4.0.0/jpn.traineddata.gz');
await copy('node_modules/pdfjs-dist/build/pdf.mjs');
await copy('node_modules/pdfjs-dist/build/pdf.worker.min.mjs');
console.log('Production static files written to dist/.');
