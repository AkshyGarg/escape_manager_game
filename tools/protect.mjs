// Protected release builder for Escape the Manager.
// Usage: node protect.mjs <source.html> <out-dir>
// Produces <out-dir>/index.html: minified + obfuscated, locked to the official site,
// with a Content-Security-Policy and integrity-checked libraries.
import fs from 'node:fs';
import path from 'node:path';
import { minify } from 'terser';
import JavaScriptObfuscator from 'javascript-obfuscator';

const SITE = {
  hosts: ['akshygarg.github.io'],
  home: 'https://akshygarg.github.io/escape_manager_game/'
};
const EXTRA_CONNECT = (process.env.EXTRA_CONNECT || '').trim(); // for local testing only

const [src, outDir] = process.argv.slice(2);
if (!src || !outDir) { console.error('usage: node protect.mjs <source.html> <out-dir>'); process.exit(1); }
let html = fs.readFileSync(src, 'utf8');

// 1. Lock the build to the official site.
const lockLine = 'const SITE_LOCK=null;';
if (!html.includes(lockLine)) throw new Error('SITE_LOCK placeholder not found');
html = html.replace(lockLine, 'const SITE_LOCK=' + JSON.stringify(SITE) + ';');

// 2. Minify + obfuscate the game script (the single inline <script>).
const re = /<script>([\s\S]*?)<\/script>/g;
const blocks = [...html.matchAll(re)];
if (blocks.length !== 1) throw new Error('expected exactly one inline script, found ' + blocks.length);
const code = blocks[0][1];
const min = await minify(code, { compress: { passes: 2, drop_debugger: true }, mangle: true, format: { comments: false } });
const obf = JavaScriptObfuscator.obfuscate(min.code, {
  compact: true,
  target: 'browser',
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.6,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayCallsTransform: false,
  splitStrings: false,
  controlFlowFlattening: false,   // kept off: it would slow down the 60 fps game loop
  deadCodeInjection: false,
  selfDefending: true,            // reformatting the code breaks it
  numbersToExpressions: false,
  simplify: true,
  transformObjectKeys: false,
  unicodeEscapeSequence: false,
  disableConsoleOutput: false,
  sourceMap: false
}).getObfuscatedCode();
html = html.replace(blocks[0][0], () => '<script>' + obf + '</script>');

// 3. Strip comments (except the copyright notice) and squeeze the CSS.
html = html.replace(/<!--(?![\s\S]*?Copyright)[\s\S]*?-->/g, '');
html = html.replace(/<style>([\s\S]*?)<\/style>/, (_, css) =>
  '<style>' + css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\n\s*/g, '').replace(/\s*([{};:,>])\s*/g, '$1') + '</style>');

// 4. Security headers that a static host lets us set from the page itself.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self' https://cdn.jsdelivr.net wss://broker.hivemq.com:8884 wss://broker.emqx.io:8084 https://*.supabase.co wss://*.supabase.co" + (EXTRA_CONNECT ? ' ' + EXTRA_CONNECT : ''),
  "media-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'"
].join('; ');
const head = `<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="referrer" content="strict-origin-when-cross-origin">
<meta name="description" content="Dodge desks, dodge meetings, dodge your manager. Survive your shift until 6:00 PM and top the office leaderboard.">
<meta name="theme-color" content="#f6dfc0">
<meta name="copyright" content="© 2026 Akshay Garg. All rights reserved.">
<meta property="og:title" content="Escape the Manager">
<meta property="og:description" content="“This should have been done yesterday!” Make it to 6:00 PM and claim the #1 spot.">
<meta property="og:type" content="website">
<meta property="og:url" content="${SITE.home}">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🏃</text></svg>">
`;
html = html.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n' + head);

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'index.html'), html);
console.log('built', path.join(outDir, 'index.html'), (html.length / 1024).toFixed(0) + ' KB');
