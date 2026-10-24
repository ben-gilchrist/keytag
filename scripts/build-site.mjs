#!/usr/bin/env node
// Builds public/index.html from src/ (shell + styles + helpers + app).
// Run after editing anything in src/:  node scripts/build-site.mjs
import fs from 'node:fs';

const read = f => fs.readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
const app = read('app.js').replace('/*__HELPERS__*/', () => read('helpers.js')).replace('/*__LEGAL__*/', () => read('legal.js'));
const html = read('shell.html')
  .replace('/*__STYLES__*/', () => read('styles.css'))
  .replace('/*__APP__*/', () => app);

fs.mkdirSync(new URL('../public/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('../public/index.html', import.meta.url), html);
console.log(`Built public/index.html (${(html.length / 1024).toFixed(0)} KB)`);
