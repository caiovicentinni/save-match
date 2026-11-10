// Gera os SVGs do logo para o app a partir dos arquivos oficiais da marca (pasta /brand)
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
let s = fs.readFileSync(path.join(root, 'brand', 'logo-color.svg'), 'utf8');
s = s.replace(/<g>\s*<path vector-effect[\s\S]*?<\/g>/, '');          // remove linhas-guia
s = s.replace(/<\?xml[^>]*>\s*<!--[^>]*-->/, '');
s = s.replace(/\s+x="0px" y="0px"/, '');
s = s.replace('viewBox="0 0 3000 3000"', 'viewBox="420 40 2160 2900"');
s = s.replace(/style="enable-background:[^"]*"/, '');
fs.mkdirSync(path.join(root, 'public', 'img'), { recursive: true });
fs.writeFileSync(path.join(root, 'public', 'img', 'logo.svg'), s.trim());
const white = s.replace(/\.st(7|8|9|10)\{fill:#[0-9A-Fa-f]+;\}/g, '.st$1{fill:#FFFFFF;}');
fs.writeFileSync(path.join(root, 'public', 'img', 'logo-white.svg'), white.trim());
// Ícone quadrado para PWA (fundo escuro + logo colorido)
const inner = s.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3000 3000"><defs><radialGradient id="bg" cx="50%" cy="40%" r="75%"><stop offset="0" stop-color="#3a0a52"/><stop offset="1" stop-color="#0b0612"/></radialGradient></defs><rect width="3000" height="3000" rx="600" fill="url(#bg)"/><g transform="translate(330 338) scale(0.78)">${inner}</g></svg>`;
fs.writeFileSync(path.join(root, 'public', 'img', 'icon.svg'), icon);
console.log('ok', s.includes('vector-effect'));
