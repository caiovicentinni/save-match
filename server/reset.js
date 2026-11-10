// Apaga o banco local (data/db.json) e recria com dados iniciais na próxima execução
const fs = require('fs');
const path = require('path');
const DB_FILE = path.join(__dirname, '..', 'data', 'db.json');
try { fs.unlinkSync(DB_FILE); console.log('Banco apagado. Rode "npm start" para recriar.'); }
catch { console.log('Nenhum banco para apagar.'); }
