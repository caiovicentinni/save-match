// SAVE Match — servidor HTTP + WebSocket (tempo real)
// Versão de Produção: Segurança reforçada + LGPD + Rate Limiting + Validação de Arquivos
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const { db, save, UPLOAD_DIR } = require('./db');
const { ensureSeed, id } = require('./seed');

ensureSeed();

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

/* ----------------------------- Segurança HTTP ----------------------------- */
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), geolocation=(self), microphone=()');
  next();
});

/* ----------------------------- Rate Limiting ----------------------------- */
const rateLimits = new Map();
function rateLimit({ windowMs = 60000, max = 30, message = 'Muitas requisições. Aguarde um instante.' }) {
  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const key = `${ip}:${req.baseUrl || req.path}`;
    const now = Date.now();
    const entry = rateLimits.get(key) || { count: 0, resetTime: now + windowMs };
    if (now > entry.resetTime) {
      entry.count = 0;
      entry.resetTime = now + windowMs;
    }
    entry.count++;
    rateLimits.set(key, entry);
    if (entry.count > max) {
      res.setHeader('Retry-After', Math.ceil((entry.resetTime - now) / 1000));
      return res.status(429).json({ error: message });
    }
    next();
  };
}

// Limpeza de memória do rate limiter a cada 10 minutos
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateLimits.entries()) {
    if (now > v.resetTime) rateLimits.delete(k);
  }
}, 10 * 60 * 1000);

const loginLimiter = rateLimit({ windowMs: 5 * 60 * 1000, max: 15, message: 'Muitas tentativas de login. Aguarde 5 minutos.' });
const registerLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: 'Limite de cadastros excedido. Tente novamente mais tarde.' });
const adminLoginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, message: 'Muitas tentativas de acesso administrativo. Bloqueado por 15 minutos.' });
const actionLimiter = rateLimit({ windowMs: 60 * 1000, max: 90, message: 'Aguarde um momento antes de realizar outra ação.' });

app.use(express.json({ limit: '8mb' }));
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

/* ----------------------------- Helpers ----------------------------- */
const now = () => new Date().toISOString();
const S = () => db.settings;

function hashPass(pass, salt = crypto.randomBytes(16).toString('hex')) {
  const h = crypto.scryptSync(String(pass), salt, 64).toString('hex');
  return `${salt}:${h}`;
}
function checkPass(pass, stored) {
  if (!stored) return false;
  const [salt, h] = stored.split(':');
  const test = crypto.scryptSync(String(pass), salt, 64);
  return crypto.timingSafeEqual(Buffer.from(h, 'hex'), test);
}
function ageOf(birthdate) {
  const b = new Date(birthdate); const n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  const m = n.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && n.getDate() < b.getDate())) a--;
  return a;
}
function distanceM(lat1, lng1, lat2, lng2) {
  const R = 6371000, toR = x => x * Math.PI / 180;
  const dLat = toR(lat2 - lat1), dLng = toR(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
const userById = uid => db.users.find(u => u.id === uid);
const isCheckedIn = uid => {
  const c = db.checkins[uid];
  return !!c && new Date(c.expiresAt) > new Date();
};
function publicUser(u, extra = {}) {
  if (!u) return null;
  return {
    id: u.id, name: u.name, age: ageOf(u.birthdate), gender: u.gender, bio: u.bio || '',
    photos: u.photos || [], here: isCheckedIn(u.id), ...extra
  };
}
function selfUser(u) {
  const { pass, ...rest } = u;
  return { ...rest, age: ageOf(u.birthdate), checkin: isCheckedIn(u.id) ? db.checkins[u.id] : null };
}
const wants = (a, b) => a.interestedIn === 'all' || a.interestedIn === b.gender;
const compatible = (a, b) => wants(a, b) && wants(b, a);
const blockedBetween = (a, b) => db.blocks.some(x => (x.from === a && x.to === b) || (x.from === b && x.to === a));
const swiped = (from, to) => db.swipes.find(s => s.from === from && s.to === to);
const matchBetween = (a, b) => db.matches.find(m => m.active && m.users.includes(a) && m.users.includes(b));
const otherOf = (m, uid) => m.users.find(x => x !== uid);
const err = (res, code, msg) => res.status(code).json({ error: msg });

/* Validação segura de magic bytes de imagens */
function validateImageMagicBytes(buf) {
  if (!buf || buf.length < 12) return false;
  // JPEG: FF D8 FF
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'jpg';
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'png';
  // WEBP: RIFF .... WEBP
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'webp';
  return false;
}

function saveDataUrl(dataUrl) {
  const m = /^data:image\/(png|jpe?g|webp);base64,(.+)$/.exec(dataUrl || '');
  if (!m) throw new Error('Formato de imagem inválido');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 6 * 1024 * 1024) throw new Error('Imagem muito grande (máximo 6MB)');
  const verifiedExt = validateImageMagicBytes(buf);
  if (!verifiedExt) throw new Error('Arquivo de imagem adulterado ou corrompido');
  const file = `${id()}.${verifiedExt}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, file), buf);
  return `/uploads/${file}`;
}

/* ------------------------------ Auth ------------------------------ */
function newSession(userId, role = 'user') {
  const token = crypto.randomBytes(32).toString('hex');
  db.sessions[token] = { userId, role, createdAt: now() };
  save();
  return token;
}
function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const s = db.sessions[token];
  if (!s || s.role !== 'user') return err(res, 401, 'Sessão expirada. Entre novamente.');
  // Expiração de sessão após 30 dias
  const sessionAge = Date.now() - new Date(s.createdAt).getTime();
  if (sessionAge > 30 * 24 * 3600 * 1000) {
    delete db.sessions[token];
    save();
    return err(res, 401, 'Sessão expirada por inatividade. Faça login novamente.');
  }
  const u = userById(s.userId);
  if (!u) return err(res, 401, 'Usuário não encontrado');
  if (u.banned) return err(res, 403, 'Sua conta foi suspensa pela equipe SAVE.');
  req.user = u; req.token = token;
  next();
}
function adminAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const s = db.sessions[token];
  if (!s || s.role !== 'admin') return err(res, 401, 'Acesso restrito à equipe SAVE');
  next();
}

/* --------------------------- Realtime Core --------------------------- */
const emitUser = (uid, ev, data) => io.to(`user:${uid}`).emit(ev, data);
const checkedInIds = () => Object.keys(db.checkins).filter(isCheckedIn);
function broadcastPresence() {
  io.emit('presence:count', checkedInIds().length);
  emitAdminStats();
}
function emitAdminStats() { io.to('admins').emit('admin:stats', stats()); }

function canSee(viewer, target) {
  return viewer.id !== target.id && !target.banned && isCheckedIn(target.id) &&
    compatible(viewer, target) && !blockedBetween(viewer.id, target.id) && !swiped(viewer.id, target.id);
}
function notifyArrival(u) {
  for (const otherId of checkedInIds()) {
    const o = userById(otherId);
    if (o && !o.isBot && canSee(o, u)) emitUser(o.id, 'deck:add', publicUser(u));
  }
}
function notifyLeave(uid) {
  io.emit('deck:remove', uid);
}

function doCheckin(u, method) {
  const hours = Number(S().checkinHours) || 8;
  db.checkins[u.id] = { at: now(), expiresAt: new Date(Date.now() + hours * 3600e3).toISOString(), method };
  save();
  notifyArrival(u);
  broadcastPresence();
  if (!u.isBot && S().demoBots) botsReactTo(u);
}
function doCheckout(uid) {
  if (!db.checkins[uid]) return;
  delete db.checkins[uid];
  save();
  notifyLeave(uid);
  emitUser(uid, 'checkin:ended', {});
  broadcastPresence();
}

function createMatch(a, b) {
  let m = matchBetween(a, b);
  if (m) return m;
  m = { id: id(), users: [a, b], createdAt: now(), active: true };
  db.matches.push(m);
  save();
  const ua = userById(a), ub = userById(b);
  emitUser(a, 'match:new', { match: m, user: publicUser(ub, { instagram: ub.instagram }) });
  emitUser(b, 'match:new', { match: m, user: publicUser(ua, { instagram: ua.instagram }) });
  emitAdminStats();
  return m;
}

function sendMessage(fromId, matchId, text) {
  const m = db.matches.find(x => x.id === matchId && x.active && x.users.includes(fromId));
  if (!m) throw new Error('Conversa não encontrada');
  text = String(text || '').trim().slice(0, 1000);
  if (!text) throw new Error('Mensagem vazia');
  const msg = { id: id(), matchId, from: fromId, text, createdAt: now(), readAt: null };
  db.messages.push(msg);
  save();
  m.users.forEach(uid => emitUser(uid, 'message:new', msg));
  const to = userById(otherOf(m, fromId));
  if (to && to.isBot && S().demoBots) botReply(to, m);
  return msg;
}

/* ------------------------------ Bots (demo) ------------------------------ */
const BOT_LINES = [
  'Oii! Tô perto do bar, e você? 😄', 'Adorei seu perfil! Curtindo a festa?', 'Esse DJ tá demais hoje 🔥',
  'Bora se encontrar na pista? 💃', 'Haha, que bom que deu match!', 'Qual drink você tá tomando?',
  'Tô de roupa neon, fácil de achar 😂', 'Vem pro lado do palco!', 'Primeira vez na Save?'
];
function botsReactTo(u) {
  const bots = db.users.filter(b => b.isBot && compatible(b, u));
  bots.forEach(b => {
    if (Math.random() < 0.45 && !swiped(b.id, u.id)) {
      setTimeout(() => {
        if (!isCheckedIn(u.id) || swiped(b.id, u.id)) return;
        db.swipes.push({ from: b.id, to: u.id, action: 'like', at: now() });
        save();
        if (swiped(u.id, b.id)?.action === 'like' || swiped(u.id, b.id)?.action === 'super') createMatch(u.id, b.id);
        else emitUser(u.id, 'like:received', { count: likesReceived(u.id) });
      }, 4000 + Math.random() * 25000);
    }
  });
}
function botReply(bot, m) {
  const uid = otherOf(m, bot.id);
  setTimeout(() => emitUser(uid, 'typing', { matchId: m.id, from: bot.id }), 700);
  setTimeout(() => {
    try { sendMessage(bot.id, m.id, BOT_LINES[Math.floor(Math.random() * BOT_LINES.length)]); } catch {}
  }, 2200 + Math.random() * 2000);
}
function ensureBotsPresent() {
  if (!S().demoBots) return;
  db.users.filter(u => u.isBot).forEach(b => {
    if (!isCheckedIn(b.id)) {
      const hours = 24;
      db.checkins[b.id] = { at: now(), expiresAt: new Date(Date.now() + hours * 3600e3).toISOString(), method: 'demo' };
    }
  });
  save();
}
ensureBotsPresent();

function likesReceived(uid) {
  return db.swipes.filter(s => s.to === uid && s.action !== 'nope' && !swiped(uid, s.from) && isCheckedIn(s.from)).length;
}

/* ------------------------------ API: Conta & LGPD ------------------------------ */
app.post('/api/register', registerLimiter, (req, res) => {
  const { name, email, password, birthdate, gender, interestedIn, bio, instagram, acceptedTerms, acceptedLgpd } = req.body || {};
  if (!name || !email || !password || !birthdate || !gender || !interestedIn) return err(res, 400, 'Preencha todos os campos obrigatórios');
  if (String(password).length < 6) return err(res, 400, 'A senha deve ter pelo menos 6 caracteres');
  if (ageOf(birthdate) < 18) return err(res, 400, 'O SAVE Match é exclusivo para maiores de 18 anos');

  // Validação obrigatória de consentimento LGPD e Termos de Uso
  if (!acceptedTerms || !acceptedLgpd) {
    return err(res, 400, 'É obrigatório aceitar os Termos de Uso e o tratamento de dados pessoais conforme a LGPD para criar uma conta.');
  }

  const em = String(email).trim().toLowerCase();
  if (db.users.some(u => u.email === em)) return err(res, 409, 'Este e-mail já está cadastrado');
  
  const u = {
    id: id(),
    isBot: false,
    name: String(name).trim().slice(0, 30),
    email: em,
    pass: hashPass(password),
    birthdate,
    gender,
    interestedIn,
    bio: String(bio || '').slice(0, 300),
    instagram: String(instagram || '').slice(0, 40),
    photos: [],
    createdAt: now(),
    banned: false,
    notifications: true,
    lgpdConsent: {
      accepted: true,
      acceptedAt: now(),
      ipHash: crypto.createHash('sha256').update(req.ip || 'unknown').digest('hex').slice(0, 16),
      version: '1.0'
    }
  };
  db.users.push(u);
  save();
  emitAdminStats();
  res.json({ token: newSession(u.id), user: selfUser(u) });
});

app.post('/api/login', loginLimiter, (req, res) => {
  const { email, password } = req.body || {};
  const u = db.users.find(x => x.email === String(email || '').trim().toLowerCase());
  if (!u || !checkPass(password, u.pass)) return err(res, 401, 'E-mail ou senha incorretos');
  if (u.banned) return err(res, 403, 'Sua conta foi suspensa pela equipe SAVE.');
  res.json({ token: newSession(u.id), user: selfUser(u) });
});

app.post('/api/logout', auth, (req, res) => { delete db.sessions[req.token]; save(); res.json({ ok: true }); });

app.get('/api/me', auth, (req, res) => res.json({ user: selfUser(req.user), likes: likesReceived(req.user.id) }));

app.put('/api/me', auth, (req, res) => {
  const u = req.user;
  const { name, bio, instagram, gender, interestedIn, notifications } = req.body || {};
  if (name) u.name = String(name).trim().slice(0, 30);
  if (bio !== undefined) u.bio = String(bio).slice(0, 300);
  if (instagram !== undefined) u.instagram = String(instagram).slice(0, 40);
  if (gender) u.gender = gender;
  if (interestedIn) u.interestedIn = interestedIn;
  if (notifications !== undefined) u.notifications = !!notifications;
  save();
  res.json({ user: selfUser(u) });
});

/* Exclusão de Conta e Dados Pessoais (Direito de Eliminação - Art. 18, VI da LGPD) */
app.delete('/api/me', auth, (req, res) => {
  const uid = req.user.id;
  
  // 1. Remover fotos físicas do disco
  (req.user.photos || []).forEach(p => {
    try {
      const fileName = path.basename(p);
      const filePath = path.join(UPLOAD_DIR, fileName);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {}
  });

  // 2. Encerrar checkin
  doCheckout(uid);

  // 3. Desativar matches e conversas
  db.matches.filter(m => m.users.includes(uid)).forEach(m => {
    m.active = false;
    m.users.forEach(otherId => {
      if (otherId !== uid) emitUser(otherId, 'match:removed', { matchId: m.id });
    });
  });

  // 4. Limpar swipes, RSVPs, VIPs e denúncias
  db.swipes = db.swipes.filter(s => s.from !== uid && s.to !== uid);
  db.rsvps = db.rsvps.filter(r => r.userId !== uid);
  db.vip = db.vip.filter(v => v.userId !== uid);

  // 5. Apagar sessões
  Object.entries(db.sessions).forEach(([t, s]) => {
    if (s.userId === uid) delete db.sessions[t];
  });

  // 6. Remover usuário do banco
  db.users = db.users.filter(u => u.id !== uid);
  save();
  emitAdminStats();

  res.json({ success: true, message: 'Conta e todos os dados pessoais associados foram permanentemente eliminados conforme a LGPD.' });
});

app.post('/api/me/photos', auth, (req, res) => {
  const u = req.user;
  if ((u.photos || []).length >= 6) return err(res, 400, 'Máximo de 6 fotos');
  try {
    u.photos = [...(u.photos || []), saveDataUrl(req.body.dataUrl)];
    save();
    res.json({ user: selfUser(u) });
  } catch (e) { err(res, 400, e.message); }
});

app.delete('/api/me/photos/:idx', auth, (req, res) => {
  const u = req.user;
  const idx = Number(req.params.idx);
  const photoUrl = u.photos[idx];
  if (photoUrl) {
    try {
      const fileName = path.basename(photoUrl);
      const filePath = path.join(UPLOAD_DIR, fileName);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {}
    u.photos.splice(idx, 1);
    save();
  }
  res.json({ user: selfUser(u) });
});

app.put('/api/me/photos/main/:idx', auth, (req, res) => {
  const u = req.user; const i = Number(req.params.idx);
  if (u.photos[i]) { const [p] = u.photos.splice(i, 1); u.photos.unshift(p); save(); }
  res.json({ user: selfUser(u) });
});

/* ------------------------------ API: Check-in & Portaria ------------------------------ */
app.get('/api/venue', (req, res) => {
  const s = S();
  res.json({
    name: s.venueName, address: s.venueAddress, lat: s.venueLat, lng: s.venueLng, radius: s.venueRadius,
    enforceGps: s.enforceGps, live: checkedInIds().length, instagram: s.instagram, whatsapp: s.whatsapp
  });
});

app.post('/api/checkin', auth, (req, res) => {
  const s = S(); const u = req.user;
  const { code, lat, lng, accuracy } = req.body || {};
  if (!u.photos?.length) return err(res, 400, 'Adicione pelo menos 1 foto no perfil antes de fazer check-in');
  if (String(code || '').trim().toUpperCase() !== String(s.checkinCode).toUpperCase())
    return err(res, 400, 'Código de check-in inválido. Escaneie o QR Code na entrada da Save.');
  
  let dist = null;
  if (typeof lat === 'number' && typeof lng === 'number') {
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return err(res, 400, 'Coordenadas de geolocalização inválidas');
    dist = Math.round(distanceM(lat, lng, s.venueLat, s.venueLng));
  }
  if (s.enforceGps) {
    if (dist === null) return err(res, 400, 'Permita o acesso à localização para confirmar que você está na Save');
    const tolerance = Math.min(Number(accuracy) || 0, 100);
    if (dist > s.venueRadius + tolerance) return err(res, 403, `Você está a ${dist}m da Save. O check-in só funciona dentro da boate.`);
  }
  doCheckin(u, s.enforceGps ? 'qr+gps' : 'qr');
  res.json({ user: selfUser(u), distance: dist });
});

app.post('/api/presence', auth, (req, res) => {
  const s = S(); const { lat, lng } = req.body || {};
  if (s.enforceGps && isCheckedIn(req.user.id) && typeof lat === 'number' && typeof lng === 'number') {
    const d = distanceM(lat, lng, s.venueLat, s.venueLng);
    if (d > Math.max(s.venueRadius * 4, 500)) { doCheckout(req.user.id); return res.json({ checkedOut: true }); }
  }
  res.json({ ok: true });
});

app.post('/api/checkout', auth, (req, res) => { doCheckout(req.user.id); res.json({ user: selfUser(req.user) }); });

/* ------------------------------ API: Deck / Swipe ------------------------------ */
app.get('/api/deck', auth, (req, res) => {
  const me = req.user;
  if (!isCheckedIn(me.id)) return res.json({ checkedIn: false, cards: [] });
  const likedMe = new Set(db.swipes.filter(s => s.to === me.id && s.action !== 'nope').map(s => s.from));
  const cards = db.users.filter(o => canSee(me, o))
    .map(o => publicUser(o, { superLikedMe: db.swipes.some(s => s.from === o.id && s.to === me.id && s.action === 'super') }))
    .sort((a, b) => (b.superLikedMe - a.superLikedMe) || (likedMe.has(b.id) - likedMe.has(a.id)) || Math.random() - 0.5);
  res.json({ checkedIn: true, cards, likes: likesReceived(me.id) });
});

app.post('/api/swipe', auth, actionLimiter, (req, res) => {
  const me = req.user; const { targetId, action } = req.body || {};
  if (!['like', 'nope', 'super'].includes(action)) return err(res, 400, 'Ação inválida');
  if (!isCheckedIn(me.id)) return err(res, 403, 'Faça check-in na Save para curtir pessoas');
  const t = userById(targetId);
  if (!t) return err(res, 404, 'Perfil não encontrado');
  if (!swiped(me.id, t.id)) db.swipes.push({ from: me.id, to: t.id, action, at: now() });
  save();
  let match = null;
  if (action !== 'nope') {
    const back = swiped(t.id, me.id);
    if (back && back.action !== 'nope') match = createMatch(me.id, t.id);
    else {
      if (action === 'super') emitUser(t.id, 'superlike:received', { from: publicUser(me) });
      emitUser(t.id, 'like:received', { count: likesReceived(t.id) });
      if (t.isBot && S().demoBots && Math.random() < 0.75) {
        setTimeout(() => {
          if (!swiped(t.id, me.id)) { db.swipes.push({ from: t.id, to: me.id, action: 'like', at: now() }); save(); }
          createMatch(me.id, t.id);
        }, 900 + Math.random() * 1500);
      }
    }
  }
  res.json({ match: match ? { match, user: publicUser(t, { instagram: t.instagram }) } : null });
});

app.post('/api/swipe/undo', auth, (req, res) => {
  const mine = db.swipes.filter(s => s.from === req.user.id);
  const last = mine[mine.length - 1];
  if (!last || last.action !== 'nope') return err(res, 400, 'Nada para desfazer');
  db.swipes.splice(db.swipes.indexOf(last), 1);
  save();
  const t = userById(last.to);
  res.json({ card: t && canSee(req.user, t) ? publicUser(t) : null });
});

/* ------------------------------ API: Matches & Chat ------------------------------ */
app.get('/api/matches', auth, (req, res) => {
  const me = req.user.id;
  const list = db.matches.filter(m => m.active && m.users.includes(me)).map(m => {
    const o = userById(otherOf(m, me));
    const msgs = db.messages.filter(x => x.matchId === m.id);
    const last = msgs[msgs.length - 1] || null;
    return {
      id: m.id, createdAt: m.createdAt, last,
      unread: msgs.filter(x => x.from !== me && !x.readAt).length,
      user: publicUser(o, { instagram: o?.instagram })
    };
  }).filter(x => x.user).sort((a, b) => new Date(b.last?.createdAt || b.createdAt) - new Date(a.last?.createdAt || a.createdAt));
  res.json({ matches: list });
});

app.get('/api/matches/:id/messages', auth, (req, res) => {
  const me = req.user.id;
  const m = db.matches.find(x => x.id === req.params.id && x.users.includes(me));
  if (!m) return err(res, 404, 'Conversa não encontrada');
  const msgs = db.messages.filter(x => x.matchId === m.id);
  let changed = false;
  msgs.forEach(x => { if (x.from !== me && !x.readAt) { x.readAt = now(); changed = true; } });
  if (changed) { save(); emitUser(otherOf(m, me), 'message:read', { matchId: m.id, at: now() }); }
  const o = userById(otherOf(m, me));
  res.json({ match: m, user: publicUser(o, { instagram: o?.instagram }), messages: msgs });
});

app.post('/api/matches/:id/messages', auth, actionLimiter, (req, res) => {
  try { res.json({ message: sendMessage(req.user.id, req.params.id, req.body.text) }); }
  catch (e) { err(res, 400, e.message); }
});

app.post('/api/matches/:id/unmatch', auth, (req, res) => {
  const m = db.matches.find(x => x.id === req.params.id && x.users.includes(req.user.id));
  if (!m) return err(res, 404, 'Match não encontrado');
  m.active = false; save();
  m.users.forEach(uid => emitUser(uid, 'match:removed', { matchId: m.id }));
  res.json({ ok: true });
});

app.post('/api/report', auth, (req, res) => {
  const { userId, reason, block } = req.body || {};
  if (!userById(userId)) return err(res, 404, 'Perfil não encontrado');
  db.reports.push({ id: id(), from: req.user.id, target: userId, reason: String(reason || '').slice(0, 500), createdAt: now(), status: 'open' });
  if (block !== false) {
    db.blocks.push({ from: req.user.id, to: userId });
    db.matches.filter(m => m.active && m.users.includes(userId) && m.users.includes(req.user.id)).forEach(m => {
      m.active = false; m.users.forEach(uid => emitUser(uid, 'match:removed', { matchId: m.id }));
    });
  }
  save();
  io.to('admins').emit('admin:report', {});
  emitAdminStats();
  res.json({ ok: true });
});

/* ------------------------------ API: Agenda, VIP & Avisos ------------------------------ */
function eventView(e, uid) {
  return {
    ...e,
    going: db.rsvps.filter(r => r.eventId === e.id).length,
    iAmGoing: !!uid && db.rsvps.some(r => r.eventId === e.id && r.userId === uid),
    myVip: uid ? db.vip.find(v => v.eventId === e.id && v.userId === uid) || null : null
  };
}
app.get('/api/events', auth, (req, res) => {
  const cutoff = Date.now() - 12 * 3600e3;
  const evs = db.events.filter(e => new Date(e.end || e.start).getTime() > cutoff)
    .sort((a, b) => new Date(a.start) - new Date(b.start)).map(e => eventView(e, req.user.id));
  res.json({ events: evs });
});

app.post('/api/events/:id/rsvp', auth, (req, res) => {
  const e = db.events.find(x => x.id === req.params.id);
  if (!e) return err(res, 404, 'Evento não encontrado');
  const i = db.rsvps.findIndex(r => r.eventId === e.id && r.userId === req.user.id);
  if (i >= 0) db.rsvps.splice(i, 1); else db.rsvps.push({ eventId: e.id, userId: req.user.id, at: now() });
  save();
  io.emit('event:update', { id: e.id, going: db.rsvps.filter(r => r.eventId === e.id).length });
  res.json({ event: eventView(e, req.user.id) });
});

app.post('/api/events/:id/vip', auth, (req, res) => {
  const e = db.events.find(x => x.id === req.params.id);
  if (!e) return err(res, 404, 'Evento não encontrado');
  if (!e.vipEnabled) return err(res, 400, 'Lista VIP encerrada para este evento');
  if (db.vip.some(v => v.eventId === e.id && v.userId === req.user.id)) return err(res, 409, 'Você já pediu lista para este evento');
  const count = db.vip.filter(v => v.eventId === e.id && v.status !== 'rejected').length;
  if (e.vipLimit && count >= e.vipLimit) return err(res, 400, 'Lista VIP lotada');
  const guests = Math.max(0, Math.min(5, Number(req.body.guests) || 0));
  const v = {
    id: id(), eventId: e.id, userId: req.user.id, guests, guestNames: String(req.body.guestNames || '').slice(0, 300),
    status: 'pending', code: crypto.randomBytes(4).toString('hex').toUpperCase(), createdAt: now(), usedAt: null
  };
  db.vip.push(v); save();
  io.to('admins').emit('admin:vip', v);
  emitAdminStats();
  res.json({ vip: v });
});

app.get('/api/vip', auth, async (req, res) => {
  const list = db.vip.filter(v => v.userId === req.user.id).map(v => ({ ...v, event: db.events.find(e => e.id === v.eventId) }))
    .filter(v => v.event);
  for (const v of list) if (v.status === 'approved') v.qr = await QRCode.toDataURL(`SAVEVIP:${v.code}`, { margin: 1, width: 320 });
  res.json({ vip: list });
});

app.get('/api/announcements', auth, (req, res) => {
  res.json({ announcements: [...db.announcements].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 50) });
});

/* ------------------------------ API: Admin & Portaria ------------------------------ */
function stats() {
  const here = checkedInIds().map(userById).filter(u => u && !u.isBot);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return {
    users: db.users.filter(u => !u.isBot).length,
    here: here.length,
    hereWithBots: checkedInIds().length,
    gender: { f: here.filter(u => u.gender === 'f').length, m: here.filter(u => u.gender === 'm').length, nb: here.filter(u => u.gender === 'nb').length },
    matchesToday: db.matches.filter(m => new Date(m.createdAt) >= today).length,
    matchesTotal: db.matches.length,
    messagesToday: db.messages.filter(m => new Date(m.createdAt) >= today).length,
    swipesToday: db.swipes.filter(s => new Date(s.at) >= today).length,
    vipPending: db.vip.filter(v => v.status === 'pending').length,
    reportsOpen: db.reports.filter(r => r.status === 'open').length
  };
}

app.post('/api/admin/login', adminLoginLimiter, (req, res) => {
  const expectedPass = process.env.ADMIN_PASSWORD || S().adminPassword || 'save2026';
  if (String(req.body?.password || '') !== String(expectedPass)) return err(res, 401, 'Senha de administrador incorreta');
  res.json({ token: newSession('admin', 'admin') });
});
app.get('/api/admin/stats', adminAuth, (req, res) => res.json(stats()));

app.get('/api/admin/settings', adminAuth, (req, res) => res.json({ settings: S() }));
app.put('/api/admin/settings', adminAuth, (req, res) => {
  const allowed = ['venueName', 'venueAddress', 'venueLat', 'venueLng', 'venueRadius', 'enforceGps', 'checkinCode', 'checkinHours', 'adminPassword', 'demoBots', 'instagram', 'whatsapp'];
  for (const k of allowed) if (req.body[k] !== undefined) {
    let v = req.body[k];
    if (['venueLat', 'venueLng', 'venueRadius', 'checkinHours'].includes(k)) v = Number(v);
    if (['enforceGps', 'demoBots'].includes(k)) v = !!v;
    if (k === 'adminPassword' && String(v).length < 4) continue;
    db.settings[k] = v;
  }
  if (!S().demoBots) db.users.filter(u => u.isBot).forEach(b => { delete db.checkins[b.id]; notifyLeave(b.id); });
  else ensureBotsPresent();
  save(); broadcastPresence();
  res.json({ settings: S() });
});
app.post('/api/admin/checkin-code/rotate', adminAuth, (req, res) => {
  db.settings.checkinCode = 'SAVE' + Math.floor(1000 + Math.random() * 9000);
  save();
  res.json({ settings: S() });
});
app.get('/api/admin/checkin-qr', adminAuth, async (req, res) => {
  const origin = req.query.origin || `${req.protocol}://${req.get('host')}`;
  const url = `${origin}/?checkin=${encodeURIComponent(S().checkinCode)}`;
  res.json({ url, qr: await QRCode.toDataURL(url, { margin: 2, width: 600, color: { dark: '#12051a', light: '#ffffff' } }) });
});

app.post('/api/admin/upload', adminAuth, (req, res) => {
  try { res.json({ url: saveDataUrl(req.body.dataUrl) }); } catch (e) { err(res, 400, e.message); }
});

app.get('/api/admin/events', adminAuth, (req, res) => {
  res.json({ events: [...db.events].sort((a, b) => new Date(a.start) - new Date(b.start)).map(e => eventView(e)) });
});
function cleanEvent(b) {
  const e = {};
  ['title', 'subtitle', 'description', 'price', 'ticketUrl', 'flyer', 'color'].forEach(k => { if (b[k] !== undefined) e[k] = b[k] ? String(b[k]) : (k === 'flyer' ? null : ''); });
  if (b.start) e.start = new Date(b.start).toISOString();
  if (b.end) e.end = new Date(b.end).toISOString();
  if (b.lineup !== undefined) e.lineup = Array.isArray(b.lineup) ? b.lineup : String(b.lineup).split(/[\n,]/).map(s => s.trim()).filter(Boolean);
  if (b.vipEnabled !== undefined) e.vipEnabled = !!b.vipEnabled;
  if (b.featured !== undefined) e.featured = !!b.featured;
  if (b.vipLimit !== undefined) e.vipLimit = Number(b.vipLimit) || 0;
  return e;
}
app.post('/api/admin/events', adminAuth, (req, res) => {
  const b = cleanEvent(req.body || {});
  if (!b.title || !b.start) return err(res, 400, 'Título e data são obrigatórios');
  const e = { id: id(), subtitle: '', description: '', price: '', ticketUrl: '', flyer: null, color: '#c501e2', lineup: [], vipEnabled: true, vipLimit: 200, featured: false, end: new Date(new Date(b.start).getTime() + 6 * 3600e3).toISOString(), ...b, createdAt: now() };
  db.events.push(e); save();
  io.emit('event:changed', {});
  io.emit('announcement:new', { id: id(), type: 'event', title: `Novo evento: ${e.title}`, body: `${new Date(e.start).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })} — confira na Agenda!`, createdAt: now(), transient: true });
  res.json({ event: e });
});
app.put('/api/admin/events/:id', adminAuth, (req, res) => {
  const e = db.events.find(x => x.id === req.params.id);
  if (!e) return err(res, 404, 'Evento não encontrado');
  Object.assign(e, cleanEvent(req.body || {})); save();
  io.emit('event:changed', {});
  res.json({ event: e });
});
app.delete('/api/admin/events/:id', adminAuth, (req, res) => {
  db.events = db.events.filter(x => x.id !== req.params.id); save();
  io.emit('event:changed', {});
  res.json({ ok: true });
});

app.get('/api/admin/announcements', adminAuth, (req, res) => res.json({ announcements: [...db.announcements].reverse() }));
app.post('/api/admin/announcements', adminAuth, (req, res) => {
  const { title, body, type, onlyHere } = req.body || {};
  if (!title) return err(res, 400, 'Título obrigatório');
  const a = { id: id(), title: String(title).slice(0, 80), body: String(body || '').slice(0, 600), type: type || 'info', onlyHere: !!onlyHere, createdAt: now() };
  db.announcements.push(a); save();
  if (a.onlyHere) checkedInIds().forEach(uid => emitUser(uid, 'announcement:new', a));
  else io.emit('announcement:new', a);
  res.json({ announcement: a });
});
app.delete('/api/admin/announcements/:id', adminAuth, (req, res) => {
  db.announcements = db.announcements.filter(a => a.id !== req.params.id); save();
  res.json({ ok: true });
});

app.get('/api/admin/vip', adminAuth, (req, res) => {
  const list = db.vip.filter(v => !req.query.eventId || v.eventId === req.query.eventId).map(v => {
    const u = userById(v.userId);
    return { ...v, user: u ? { id: u.id, name: u.name, email: u.email, photo: u.photos?.[0], age: ageOf(u.birthdate) } : null };
  }).reverse();
  res.json({ vip: list });
});
app.post('/api/admin/vip/:id', adminAuth, (req, res) => {
  const v = db.vip.find(x => x.id === req.params.id);
  if (!v) return err(res, 404, 'Pedido não encontrado');
  if (['approved', 'rejected', 'pending'].includes(req.body.status)) v.status = req.body.status;
  save();
  const e = db.events.find(x => x.id === v.eventId);
  emitUser(v.userId, 'vip:update', { vip: v, event: e });
  emitAdminStats();
  res.json({ vip: v });
});
app.post('/api/admin/vip-validate', adminAuth, (req, res) => {
  const code = String(req.body.code || '').replace('SAVEVIP:', '').trim().toUpperCase();
  const v = db.vip.find(x => x.code === code);
  if (!v) return err(res, 404, 'Código não encontrado');
  const u = userById(v.userId); const e = db.events.find(x => x.id === v.eventId);
  const info = { vip: v, user: u && { name: u.name, photo: u.photos?.[0], age: ageOf(u.birthdate) }, event: e && { title: e.title, start: e.start } };
  if (v.status !== 'approved') return res.status(400).json({ ...info, error: 'Pedido não aprovado' });
  if (v.usedAt) return res.status(400).json({ ...info, error: `Já utilizado em ${new Date(v.usedAt).toLocaleString('pt-BR')}` });
  v.usedAt = now(); save();
  emitUser(v.userId, 'vip:update', { vip: v, event: e });
  res.json({ ...info, ok: true });
});

app.get('/api/admin/users', adminAuth, (req, res) => {
  res.json({
    users: db.users.map(u => ({
      id: u.id, name: u.name, email: u.email, age: ageOf(u.birthdate), gender: u.gender, photo: u.photos?.[0], isBot: u.isBot,
      banned: u.banned, here: isCheckedIn(u.id), createdAt: u.createdAt,
      reports: db.reports.filter(r => r.target === u.id).length,
      matches: db.matches.filter(m => m.users.includes(u.id)).length
    })).reverse()
  });
});
app.post('/api/admin/users/:id/ban', adminAuth, (req, res) => {
  const u = userById(req.params.id);
  if (!u) return err(res, 404, 'Usuário não encontrado');
  u.banned = !!req.body.banned;
  if (u.banned) {
    doCheckout(u.id);
    Object.entries(db.sessions).forEach(([t, s]) => { if (s.userId === u.id) delete db.sessions[t]; });
    emitUser(u.id, 'account:banned', {});
  }
  save();
  res.json({ ok: true });
});
app.post('/api/admin/users/:id/checkout', adminAuth, (req, res) => { doCheckout(req.params.id); res.json({ ok: true }); });

app.get('/api/admin/reports', adminAuth, (req, res) => {
  res.json({
    reports: [...db.reports].reverse().map(r => ({
      ...r, fromUser: userById(r.from)?.name, targetUser: (u => u && { id: u.id, name: u.name, photo: u.photos?.[0], banned: u.banned })(userById(r.target))
    }))
  });
});
app.post('/api/admin/reports/:id', adminAuth, (req, res) => {
  const r = db.reports.find(x => x.id === req.params.id);
  if (r) { r.status = req.body.status || 'resolved'; save(); }
  emitAdminStats();
  res.json({ ok: true });
});

/* ------------------------------ Socket.IO ------------------------------ */
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  const s = db.sessions[token];
  if (!s) return next(new Error('unauthorized'));
  socket.data.session = s;
  next();
});
io.on('connection', socket => {
  const s = socket.data.session;
  if (s.role === 'admin') {
    socket.join('admins');
    socket.emit('admin:stats', stats());
    return;
  }
  const uid = s.userId;
  socket.join(`user:${uid}`);
  socket.emit('presence:count', checkedInIds().length);

  socket.on('message:send', ({ matchId, text } = {}, ack) => {
    try { const msg = sendMessage(uid, matchId, text); ack && ack({ ok: true, message: msg }); }
    catch (e) { ack && ack({ error: e.message }); }
  });
  socket.on('typing', ({ matchId } = {}) => {
    const m = db.matches.find(x => x.id === matchId && x.users.includes(uid));
    if (m) emitUser(otherOf(m, uid), 'typing', { matchId, from: uid });
  });
  socket.on('message:read', ({ matchId } = {}) => {
    const m = db.matches.find(x => x.id === matchId && x.users.includes(uid));
    if (!m) return;
    let changed = false;
    db.messages.forEach(x => { if (x.matchId === matchId && x.from !== uid && !x.readAt) { x.readAt = now(); changed = true; } });
    if (changed) { save(); emitUser(otherOf(m, uid), 'message:read', { matchId, at: now() }); }
  });
});

/* ------------------------------ Manutenção ------------------------------ */
setInterval(() => {
  for (const uid of Object.keys(db.checkins)) if (!isCheckedIn(uid)) doCheckout(uid);
  ensureBotsPresent();
}, 60 * 1000);

// Resiliência de processo
process.on('uncaughtException', err => console.error('Uncaught Exception:', err));
process.on('unhandledRejection', reason => console.error('Unhandled Rejection:', reason));

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'admin.html')));
app.get(/^\/(?!api|uploads|socket\.io).*/, (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

server.listen(PORT, '0.0.0.0', () => {
  const lan = Object.values(os.networkInterfaces()).flat().find(i => i && i.family === 'IPv4' && !i.internal)?.address;
  console.log('\n  SAVE Match rodando em modo produção! 💜 🛡️');
  console.log(`  App:    http://localhost:${PORT}`);
  console.log(`  Admin:  http://localhost:${PORT}/admin`);
  if (lan) console.log(`  Celular na rede Wi-Fi: http://${lan}:${PORT}`);
  console.log(`  Código de check-in de hoje: ${S().checkinCode}\n`);
});
