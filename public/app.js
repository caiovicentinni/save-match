/* =========================================================
   SAVE Match — app do cliente (PWA, vanilla JS, tempo real)
   ========================================================= */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = $('#app');

const state = {
  token: localStorage.getItem('save_token'),
  user: null, venue: null, live: 0, likes: 0,
  screen: 'loading', tab: 'pista',
  deck: [], deckLoaded: false, history: [],
  matches: [], events: [], vip: [], anns: [],
  agendaSeg: 'eventos', openChatId: null, socket: null,
  lastSeenAnn: localStorage.getItem('save_last_ann') || '',
  freshAnn: new Set(), installPrompt: null
};

/* ---------- check-in vindo do QR Code (/?checkin=CODIGO) ---------- */
const params = new URLSearchParams(location.search);
if (params.get('checkin')) {
  sessionStorage.setItem('save_pending_checkin', params.get('checkin'));
  history.replaceState({}, '', '/');
}

/* ---------- ícones ---------- */
const I = {
  flame: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c4.4 0 7-2.9 7-6.6 0-3.1-2-5.7-3.5-7.4-.4 1.8-1.4 3-2.6 3.5.3-3.5-1.3-6.8-4.4-9.5.2 3.4-1.6 5.6-3.2 7.5C4.2 11 3.5 12.9 3.5 15.4 3.5 19.1 7.6 22 12 22z"/></svg>',
  cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="17" rx="3"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8.5 8.5 0 0 1-12.6 7.4L3 21l1.6-5.2A8.5 8.5 0 1 1 21 12z"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4.5"/><path d="M3.5 21.5c1.2-4.3 4.5-6.5 8.5-6.5s7.3 2.2 8.5 6.5"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7.5-4.6-10-9.3C.4 8.4 2.3 4 6.4 4c2.3 0 3.9 1.3 5.6 3.3C13.7 5.3 15.3 4 17.6 4c4.1 0 6 4.4 4.4 7.7C19.5 16.4 12 21 12 21z"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5l2.9 6 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.5l1.3-6.6L2.5 9.3l6.6-.8z"/></svg>',
  undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
  back: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  send: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M3.4 20.4l17.5-7.5a1 1 0 0 0 0-1.8L3.4 3.6a1 1 0 0 0-1.4 1.2L4.5 12l-2.5 7.2a1 1 0 0 0 1.4 1.2z"/></svg>',
  dots: '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>',
  qr: '<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M14 14h3v3M21 14v.01M14 21h3M21 17v4h-1"/></svg>',
  pin: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg>'
};
const GRAD_DEFS = '<svg width="0" height="0" style="position:absolute"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c501e2"/><stop offset=".55" stop-color="#f82d97"/><stop offset="1" stop-color="#FF5B00"/></linearGradient></defs></svg>';

const GENDER = { f: 'Mulher', m: 'Homem', nb: 'Não-binárie' };
const INTEREST = { f: 'Mulheres', m: 'Homens', all: 'Todo mundo' };
const ANN_ICON = { promo: ['🍹', 'rgba(232,180,50,.18)'], event: ['🎉', 'rgba(197,1,226,.2)'], info: ['📣', 'rgba(53,172,232,.18)'], alert: ['⚠️', 'rgba(255,91,0,.2)'], lineup: ['🎧', 'rgba(46,248,160,.15)'] };

/* ---------- API ---------- */
async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch('/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(state.token ? { Authorization: 'Bearer ' + state.token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && state.token && !path.startsWith('/login')) { logout(true); throw new Error(data.error || 'Sessão expirada'); }
  if (!res.ok) throw new Error(data.error || 'Erro de conexão');
  return data;
}

/* ---------- utilidades de UI ---------- */
function toast(html, { icon = '💜', avatar, error, onClick, time = 3800 } = {}) {
  const el = document.createElement('div');
  el.className = 'toast' + (error ? ' error' : '');
  el.innerHTML = (avatar ? `<div class="avatar" style="background-image:url('${esc(avatar)}')"></div>` : `<div class="t-ico">${icon}</div>`) + `<div class="grow">${html}</div>`;
  if (onClick) el.onclick = () => { onClick(); el.remove(); };
  $('#toasts').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 260); }, time);
}
const toastErr = e => toast(esc(e.message || e), { icon: '⚠️', error: true });

function sheet(html, { cls = '', onClose } = {}) {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="sheet ${cls}"><div class="grab"></div>${html}</div>`;
  const close = () => { ov.remove(); onClose && onClose(); };
  ov.addEventListener('click', e => { if (e.target === ov) close(); });
  $('#modal-root').appendChild(ov);
  ov.close = close;
  return ov;
}

async function notify(title, body, url = '/') {
  if (!document.hidden || !state.user?.notifications) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) reg.showNotification(title, { body, icon: '/img/icon.svg', badge: '/img/icon.svg', data: { url } });
    else new Notification(title, { body, icon: '/img/icon.svg' });
  } catch {}
}
function vibrate(p = 30) { try { navigator.vibrate && navigator.vibrate(p); } catch {} }

const photoOf = u => u?.photos?.[0] || '/img/icon.svg';
const fmtTime = iso => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
function fmtRelative(iso) {
  const d = (Date.now() - new Date(iso)) / 1000;
  if (d < 60) return 'agora';
  if (d < 3600) return Math.floor(d / 60) + ' min';
  if (d < 86400) return Math.floor(d / 3600) + ' h';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}
function dateParts(iso) {
  const d = new Date(iso);
  return {
    d: d.getDate(), m: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''),
    w: d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''),
    long: d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }),
    h: d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  };
}

function compressImage(file, max = 1080) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => reject(new Error('Não foi possível ler a imagem'));
    img.src = URL.createObjectURL(file);
  });
}
function pickImage() {
  return new Promise(resolve => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = () => resolve(inp.files[0] || null);
    inp.click();
  });
}
function getPosition(timeout = 10000) {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => resolve(null), { enableHighAccuracy: true, timeout, maximumAge: 30000 });
  });
}

function openLegalModal(tab = 'terms') {
  const ov = sheet(`
    <div style="padding:10px 4px;">
      <div class="seg" style="margin:0 0 16px;">
        <button id="leg-tab-terms" class="${tab === 'terms' ? 'on' : ''}">Termos de Uso</button>
        <button id="leg-tab-privacy" class="${tab === 'privacy' ? 'on' : ''}">Privacidade & LGPD</button>
      </div>
      <div id="leg-content" style="max-height:65vh;overflow-y:auto;padding-right:6px;font-size:13px;line-height:1.6;color:#e1d5ed;">
      </div>
      <button class="btn btn-primary btn-block" id="leg-close" style="margin-top:16px;">Entendido e Fechar</button>
    </div>
  `);
  const show = t => {
    $('#leg-tab-terms', ov).classList.toggle('on', t === 'terms');
    $('#leg-tab-privacy', ov).classList.toggle('on', t === 'privacy');
    const c = $('#leg-content', ov);
    if (t === 'terms') {
      c.innerHTML = `
        <h3 class="h3" style="color:#fff;margin:0 0 8px;">Termos de Uso • SAVE Match</h3>
        <p><b>1. Maioridade Estrita:</b> O SAVE Match é de uso exclusivo para maiores de 18 anos completos. Ao cadastrar-se, você declara sob as penas da lei ser maior de idade.</p>
        <p><b>2. Objetivo da Plataforma:</b> O aplicativo destina-se a promover relacionamento, interação social e comunicação entre frequentadores da <b>Boate Save</b> (Rua Gomes Freire, 595 - Lapa, Rio de Janeiro - RJ).</p>
        <p><b>3. Código de Conduta e Respeito:</b> Não é tolerado qualquer ato de assédio, importunação sexual, racismo, LGBTQIA+fobia, discriminação, agressão ou ameaça, tanto no chat virtual quanto no espaço físico da boate.</p>
        <p><b>4. Privacidade e Imagem:</b> É terminantemente proibido registrar ou divulgar fotos, vídeos ou capturas de tela das conversas ou dos frequentadores sem o devido consentimento.</p>
        <p><b>5. Moderação e Segurança:</b> A equipe e a segurança da Boate Save possuem autonomia irrestrita para suspender contas, revogar check-ins e retirar da casa qualquer usuário que viole estes termos ou cause constrangimento a terceiros.</p>
        <p><b>6. Geolocalização:</b> O check-in na pista utiliza coordenadas temporárias para certificar que o usuário está nas dependências da Save. Os dados de presença expiram após 8 horas.</p>
      `;
    } else {
      c.innerHTML = `
        <h3 class="h3" style="color:#fff;margin:0 0 8px;">Política de Privacidade & LGPD</h3>
        <p style="font-size:12px;color:var(--green);font-weight:700;">Conforme a Lei Geral de Proteção de Dados (Lei nº 13.709/2018)</p>
        <p><b>1. Controlador dos Dados:</b> Boate Save, com sede na Rua Gomes Freire, 595, Lapa, Rio de Janeiro - RJ.</p>
        <p><b>2. Dados Tratados:</b> Nome, e-mail, senha criptografada (scrypt), data de nascimento, fotos de perfil, gênero, interesse afetivo/sexual, biografia, perfil do Instagram (opcional) e localização geográfica aproximada no check-in.</p>
        <p><b>3. Finalidade e Base Legal:</b> Tratamento fundamentado no seu consentimento expresso (Art. 7º, I e Art. 11, I da LGPD) e na execução dos serviços da plataforma (Art. 7º, V) para exibir seu perfil para outros frequentadores compatíveis presentes na mesma noite.</p>
        <p><b>4. Compartilhamento:</b> Seus dados <b>nunca</b> são vendidos, alugados ou compartilhados com terceiros ou anunciantes.</p>
        <p><b>5. Efemeridade da Pista:</b> Sua presença ao vivo expira automaticamente ao término da festa (máximo de 8 horas) ou quando você optar por "Sair da pista".</p>
        <p><b>6. Seus Direitos (Art. 18 da LGPD):</b> Você pode a qualquer momento consultar seus dados, revogar o consentimento ou <b>solicitar a exclusão definitiva e permanente da sua conta e de todas as suas fotos</b> diretamente nas configurações do seu Perfil pelo aplicativo.</p>
      `;
    }
  };
  show(tab);
  $('#leg-tab-terms', ov).onclick = () => show('terms');
  $('#leg-tab-privacy', ov).onclick = () => show('privacy');
  $('#leg-close', ov).onclick = () => ov.close();
}

/* =========================================================
   TELAS DE ENTRADA
   ========================================================= */
function renderWelcome() {
  state.screen = 'welcome';
  app.innerHTML = `
  <section class="welcome">
    <div>
      <img class="logo-big" src="/img/logo.svg" alt="SAVE" />
      <div class="tag">Quem tá na pista,<br><span class="grad-text">tá no app.</span></div>
      <p class="muted" style="margin:0 0 16px;line-height:1.5">Descubra quem está na <b style="color:#fff">Boate Save</b> agora, dê match em tempo real e fique por dentro de toda a programação.</p>
      <span class="addr">${I.pin} Rua Gomes Freire, 595 • Lapa • RJ</span>
      <div style="margin-top:14px"><span class="live-pill"><span class="live-dot"></span><span id="w-live">${state.live}</span> pessoas na Save agora</span></div>
    </div>
    <div class="col">
      <button class="btn btn-primary btn-block" id="go-register">Criar minha conta</button>
      <button class="btn btn-ghost btn-block" id="go-login">Já tenho conta</button>
      <p class="legal">Exclusivo para maiores de 18 anos. Ao continuar você concorda com os <a href="#" id="w-terms" style="color:var(--green);text-decoration:underline;">Termos de Uso</a> e a <a href="#" id="w-privacy" style="color:var(--green);text-decoration:underline;">Política de Privacidade (LGPD)</a> da Boate Save.</p>
    </div>
  </section>`;
  $('#go-register').onclick = () => renderRegister();
  $('#go-login').onclick = () => renderLogin();
  $('#w-terms').onclick = e => { e.preventDefault(); openLegalModal('terms'); };
  $('#w-privacy').onclick = e => { e.preventDefault(); openLegalModal('privacy'); };
}

function renderLogin() {
  state.screen = 'login';
  app.innerHTML = `
  <div class="topbar"><button class="icon-btn" id="back">${I.back}</button></div>
  <div class="scroll pad col" style="gap:18px">
    <img src="/img/logo.svg" style="width:70px" alt="" />
    <h1 class="h1">Bem-vindo<br>de volta 💜</h1>
    <form id="f" class="col">
      <div class="field"><label>E-mail</label><input class="input" name="email" type="email" autocomplete="email" required /></div>
      <div class="field"><label>Senha</label><input class="input" name="password" type="password" autocomplete="current-password" required /></div>
      <div class="err" id="err"></div>
      <button class="btn btn-primary btn-block">Entrar</button>
    </form>
    <p class="center muted small">Ainda não tem conta? <a class="link" href="#" id="to-reg">Cadastre-se</a></p>
  </div>`;
  $('#back').onclick = renderWelcome;
  $('#to-reg').onclick = e => { e.preventDefault(); renderRegister(); };
  $('#f').onsubmit = async e => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    const btn = e.target.querySelector('button'); btn.disabled = true;
    try {
      const r = await api('/login', { method: 'POST', body: fd });
      onAuthed(r);
    } catch (er) { $('#err').textContent = er.message; btn.disabled = false; }
  };
}

function renderRegister() {
  state.screen = 'register';
  const data = { gender: '', interestedIn: '', acceptedAge: false, acceptedTerms: false, acceptedLgpd: false };
  let step = 1;
  const total = 4;

  const draw = () => {
    let body = '';
    if (step === 1) body = `
      <h1 class="h1">Vamos criar<br>seu perfil ✨</h1>
      <div class="field"><label>Primeiro nome</label><input class="input" id="name" maxlength="30" value="${esc(data.name || '')}" placeholder="Como quer ser chamado(a)" /></div>
      <div class="field"><label>E-mail</label><input class="input" id="email" type="email" value="${esc(data.email || '')}" autocomplete="email" /></div>
      <div class="field"><label>Senha</label><input class="input" id="password" type="password" placeholder="mínimo 6 caracteres" autocomplete="new-password" /></div>
      <div style="background:rgba(255,255,255,0.03);border:1px solid var(--line);border-radius:14px;padding:14px;margin-top:6px;display:flex;flex-direction:column;gap:12px;">
        <label style="display:flex;align-items:flex-start;gap:10px;font-size:12px;color:#ddd;cursor:pointer;">
          <input type="checkbox" id="reg-age" ${data.acceptedAge ? 'checked' : ''} style="margin-top:2px;width:18px;height:18px;accent-color:var(--pink);" />
          <span>Declaro que tenho <b>18 anos completos ou mais</b>.</span>
        </label>
        <label style="display:flex;align-items:flex-start;gap:10px;font-size:12px;color:#ddd;cursor:pointer;">
          <input type="checkbox" id="reg-lgpd" ${data.acceptedTerms ? 'checked' : ''} style="margin-top:2px;width:18px;height:18px;accent-color:var(--pink);" />
          <span>Li e aceito os <a href="#" id="link-terms" style="color:var(--green);text-decoration:underline;">Termos de Uso</a> e autorizo o tratamento de dados pessoais conforme a <a href="#" id="link-privacy" style="color:var(--green);text-decoration:underline;">Política de Privacidade (LGPD)</a> da Boate Save.</span>
        </label>
      </div>`;
    if (step === 2) body = `
      <h1 class="h1">Sobre você</h1>
      <div class="field"><label>Data de nascimento</label><input class="input" id="birthdate" type="date" value="${esc(data.birthdate || '')}" max="${new Date(Date.now() - 18 * 365.25 * 864e5).toISOString().slice(0, 10)}" /></div>
      <div class="field"><label>Eu sou</label><div class="chips" data-k="gender">${Object.entries(GENDER).map(([k, v]) => `<button type="button" class="chip ${data.gender === k ? 'on' : ''}" data-v="${k}">${v}</button>`).join('')}</div></div>
      <div class="field"><label>Quero conhecer</label><div class="chips" data-k="interestedIn">${Object.entries(INTEREST).map(([k, v]) => `<button type="button" class="chip ${data.interestedIn === k ? 'on' : ''}" data-v="${k}">${v}</button>`).join('')}</div></div>`;
    if (step === 3) body = `
      <h1 class="h1">Capricha na bio 😎</h1>
      <div class="field"><label>Bio</label><textarea class="input" id="bio" maxlength="300" placeholder="Ex: Viciado(a) em funk, sempre perto do bar...">${esc(data.bio || '')}</textarea></div>
      <div class="field"><label>Instagram (aparece só para seus matches)</label><input class="input" id="instagram" value="${esc(data.instagram || '')}" placeholder="@seuinsta" /></div>`;
    if (step === 4) body = `
      <h1 class="h1">Suas melhores fotos 📸</h1>
      <p class="muted" style="margin:0">Adicione pelo menos 1 foto para aparecer para quem está na pista. A primeira é a principal.</p>
      <div class="photo-grid" id="pg"></div>`;

    app.innerHTML = `
    <div class="topbar"><button class="icon-btn" id="back">${I.back}</button><div class="progress"><i style="width:${step / total * 100}%"></i></div><span class="tiny muted">${step}/${total}</span></div>
    <div class="scroll pad col" style="gap:18px">${body}<div class="err" id="err"></div></div>
    <div class="pad" style="padding-bottom:calc(18px + var(--safe-b))"><button class="btn btn-primary btn-block" id="next">${step === 3 ? 'Criar conta' : step === 4 ? 'Começar a usar' : 'Continuar'}</button></div>`;

    $('#back').onclick = () => { if (step === 1) renderWelcome(); else if (step === 4) enterMain(); else { collect(); step--; draw(); } };
    $$('.chips').forEach(c => c.onclick = e => {
      const b = e.target.closest('.chip'); if (!b) return;
      data[c.dataset.k] = b.dataset.v;
      $$('.chip', c).forEach(x => x.classList.toggle('on', x === b));
    });
    if (step === 1) {
      $('#link-terms')?.addEventListener('click', e => { e.preventDefault(); openLegalModal('terms'); });
      $('#link-privacy')?.addEventListener('click', e => { e.preventDefault(); openLegalModal('privacy'); });
    }
    if (step === 4) drawPhotoGrid($('#pg'));
    $('#next').onclick = next;
  };
  const collect = () => {
    ['name', 'email', 'password', 'birthdate', 'bio', 'instagram'].forEach(k => { const el = $('#' + k); if (el) data[k] = el.value.trim(); });
    if ($('#reg-age')) data.acceptedAge = $('#reg-age').checked;
    if ($('#reg-lgpd')) {
      data.acceptedTerms = $('#reg-lgpd').checked;
      data.acceptedLgpd = data.acceptedTerms;
    }
  };
  const next = async () => {
    collect();
    const errEl = $('#err');
    errEl.textContent = '';
    if (step === 1) {
      if (!data.name) return errEl.textContent = 'Digite seu nome';
      if (!/^\S+@\S+\.\S+$/.test(data.email || '')) return errEl.textContent = 'E-mail inválido';
      if ((data.password || '').length < 6) return errEl.textContent = 'Senha com pelo menos 6 caracteres';
      if (!data.acceptedAge) return errEl.textContent = 'Você deve declarar ser maior de 18 anos';
      if (!data.acceptedTerms) return errEl.textContent = 'Você deve aceitar os Termos de Uso e o tratamento de dados (LGPD)';
    }
    if (step === 2) {
      if (!data.birthdate) return errEl.textContent = 'Informe sua data de nascimento';
      const age = (Date.now() - new Date(data.birthdate)) / (365.25 * 864e5);
      if (age < 18) return errEl.textContent = 'O SAVE Match é exclusivo para maiores de 18 anos';
      if (!data.gender || !data.interestedIn) return errEl.textContent = 'Selecione as opções acima';
    }
    if (step === 3) {
      const btn = $('#next'); btn.disabled = true;
      try {
        const r = await api('/register', { method: 'POST', body: data });
        state.token = r.token; localStorage.setItem('save_token', r.token); state.user = r.user;
      } catch (er) { errEl.textContent = er.message; btn.disabled = false; return; }
    }
    if (step === 4) {
      if (!state.user.photos.length) return errEl.textContent = 'Adicione pelo menos 1 foto 😉';
      return enterMain();
    }
    step++; draw();
  };
  draw();
}

function drawPhotoGrid(container) {
  const photos = state.user.photos || [];
  container.innerHTML = Array.from({ length: 6 }, (_, i) => photos[i]
    ? `<div class="photo-slot filled"><img src="${esc(photos[i])}" alt="" data-main="${i}" />${i === 0 ? '<span class="main-badge">PRINCIPAL</span>' : ''}<button class="rm" data-rm="${i}">✕</button></div>`
    : `<button class="photo-slot" data-add="1"><span class="add">+</span></button>`).join('');
  container.onclick = async e => {
    const rm = e.target.closest('[data-rm]'), add = e.target.closest('[data-add]'), main = e.target.closest('[data-main]');
    try {
      if (rm) { const r = await api('/me/photos/' + rm.dataset.rm, { method: 'DELETE' }); state.user = r.user; drawPhotoGrid(container); }
      else if (main && main.dataset.main !== '0') { const r = await api('/me/photos/main/' + main.dataset.main, { method: 'PUT' }); state.user = r.user; drawPhotoGrid(container); toast('Foto principal atualizada'); }
      else if (add) {
        const f = await pickImage(); if (!f) return;
        add.innerHTML = '<div class="spinner"></div>';
        const dataUrl = await compressImage(f);
        const r = await api('/me/photos', { method: 'POST', body: { dataUrl } });
        state.user = r.user; drawPhotoGrid(container);
      }
    } catch (er) { toastErr(er); drawPhotoGrid(container); }
  };
}

function onAuthed(r) {
  state.token = r.token; localStorage.setItem('save_token', r.token);
  state.user = r.user;
  enterMain();
}

function logout(silent) {
  if (!silent && state.token) fetch('/api/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + state.token } });
  localStorage.removeItem('save_token');
  state.token = null; state.user = null; state.deck = []; state.deckLoaded = false; state.matches = [];
  state.socket?.disconnect(); state.socket = null;
  $('#modal-root').innerHTML = '';
  renderWelcome();
}

/* =========================================================
   APP PRINCIPAL
   ========================================================= */
async function enterMain() {
  state.screen = 'main';
  connectSocket();
  app.innerHTML = `${GRAD_DEFS}
  <header class="app-header">
    <div class="brand"><img src="/img/logo.svg" alt="SAVE" /><b>MATCH</b></div>
    <span class="live-pill"><span class="live-dot"></span><span id="live">${state.live}</span> na Save</span>
  </header>
  <section class="view" id="view"></section>
  <nav class="nav" id="nav">
    ${[['pista', I.flame, 'Pista'], ['agenda', I.cal, 'Agenda'], ['matches', I.chat, 'Matches'], ['avisos', I.bell, 'Avisos'], ['perfil', I.user, 'Perfil']]
      .map(([k, ic, l]) => `<button data-tab="${k}" class="${state.tab === k ? 'on' : ''}">${ic}<span class="lbl">${l}</span><span class="badge hidden" id="b-${k}"></span></button>`).join('')}
  </nav>`;
  $('#nav').onclick = e => { const b = e.target.closest('[data-tab]'); if (b) switchTab(b.dataset.tab); };
  switchTab(state.tab);
  // carregamentos em segundo plano para badges
  refreshMatches(); refreshAnns(); api('/venue').then(v => { state.venue = v; setLive(v.live); }).catch(() => {});
  const pending = sessionStorage.getItem('save_pending_checkin');
  if (pending && !state.user.checkin) { switchTab('pista'); setTimeout(() => doCheckin(pending), 300); }
  startPresenceWatch();
}

function switchTab(tab) {
  state.tab = tab;
  $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  const v = $('#view');
  if (!v) return;
  v.innerHTML = '';
  v.onclick = null;
  ({ pista: renderPista, agenda: renderAgenda, matches: renderMatches, avisos: renderAvisos, perfil: renderPerfil })[tab]();
}
function setLive(n) {
  state.live = n;
  const a = $('#live'), b = $('#w-live');
  if (a) a.textContent = n; if (b) b.textContent = n;
}
function setBadge(tab, n) {
  const b = $('#b-' + tab); if (!b) return;
  b.textContent = n > 9 ? '9+' : n;
  b.classList.toggle('hidden', !n);
}

/* ---------------------------- socket ---------------------------- */
function connectSocket() {
  if (state.socket || !window.io) return;
  const s = window.io({ auth: { token: state.token } });
  state.socket = s;
  s.on('connect_error', () => {});
  s.on('presence:count', setLive);
  s.on('deck:add', u => {
    if (u.id === state.user?.id) return;
    const existingIdx = state.deck.findIndex(c => c.id === u.id);
    if (existingIdx >= 0) {
      state.deck[existingIdx] = u;
      if (state.tab === 'pista' && $('#deck')) drawDeck();
      return;
    }
    if (!u.isBot) state.deck.unshift(u);
    else state.deck.push(u);
    if (state.tab === 'pista' && $('#deck')) drawDeck();
    if (state.tab === 'pista' && !$('#deck') && state.user?.checkin) renderPista();
  });
  s.on('deck:remove', id => {
    const i = state.deck.findIndex(c => c.id === id);
    if (i < 0) return;
    state.deck.splice(i, 1);
    if (state.tab === 'pista' && i < 3) drawDeck();
  });
  s.on('like:received', ({ count }) => {
    state.likes = count;
    updateLikesBanner();
    vibrate(20);
    toast('<b>Alguém curtiu você! 🔥</b><span class="small muted">Continue deslizando para descobrir quem foi</span>', { icon: '💘' });
    notify('Alguém curtiu você! 🔥', 'Abra o SAVE Match para descobrir quem foi.');
  });
  s.on('superlike:received', ({ from }) => {
    toast(`<b>${esc(from.name)} te deu um Super Save! ⭐</b><span class="small muted">Esse perfil aparece primeiro na sua pista</span>`, { avatar: photoOf(from) });
    notify('Você recebeu um Super Save! ⭐', `${from.name} está interessado(a) em você.`);
  });
  s.on('match:new', ({ match, user }) => {
    state.deck = state.deck.filter(c => c.id !== user.id);
    showMatch(user, match);
    refreshMatches();
    notify('Deu match! 💜', `Você e ${user.name} deram match. Mande uma mensagem!`);
  });
  s.on('match:removed', ({ matchId }) => {
    state.matches = state.matches.filter(m => m.id !== matchId);
    if (state.openChatId === matchId) { $('.chat')?.remove(); state.openChatId = null; toast('Este match foi desfeito'); }
    if (state.tab === 'matches') renderMatches();
    updateMatchBadge();
  });
  s.on('message:new', msg => {
    const mine = msg.from === state.user.id;
    if (state.openChatId === msg.matchId) {
      appendMessage(msg);
      if (!mine) s.emit('message:read', { matchId: msg.matchId });
    } else if (!mine) {
      const m = state.matches.find(x => x.id === msg.matchId);
      if (m) {
        m.unread = (m.unread || 0) + 1; m.last = msg;
        vibrate([20, 40, 20]);
        toast(`<b>${esc(m.user.name)}</b><span class="small">${esc(msg.text.slice(0, 80))}</span>`, { avatar: photoOf(m.user), onClick: () => openChat(m.id) });
        notify(m.user.name, msg.text);
      } else refreshMatches();
    }
    const m = state.matches.find(x => x.id === msg.matchId);
    if (m) { m.last = msg; state.matches.sort((a, b) => new Date(b.last?.createdAt || b.createdAt) - new Date(a.last?.createdAt || a.createdAt)); }
    if (state.tab === 'matches' && !state.openChatId) renderMatches(false);
    updateMatchBadge();
  });
  s.on('typing', ({ matchId }) => { if (state.openChatId === matchId) showTyping(); });
  s.on('message:read', ({ matchId }) => {
    if (state.openChatId === matchId) { const st = $('#read-status'); if (st) st.textContent = 'Visto ✓✓'; }
  });
  s.on('announcement:new', a => {
    if (!a.transient) { state.anns.unshift(a); state.freshAnn.add(a.id); }
    vibrate([30, 50, 30]);
    toast(`<b>${esc(a.title)}</b><span class="small muted">${esc((a.body || '').slice(0, 90))}</span>`, { icon: (ANN_ICON[a.type] || ANN_ICON.info)[0], onClick: () => switchTab('avisos'), time: 6000 });
    notify('Boate Save: ' + a.title, a.body || '', '/');
    if (state.tab === 'avisos') renderAvisos(); else updateAnnBadge();
  });
  s.on('event:changed', () => { if (state.tab === 'agenda') renderAgenda(); });
  s.on('event:update', ({ id, going }) => {
    const e = state.events.find(x => x.id === id); if (e) e.going = going;
    const el = $(`[data-going="${id}"]`); if (el) el.textContent = going;
  });
  s.on('vip:update', ({ vip, event }) => {
    const msg = vip.usedAt ? 'Entrada VIP confirmada. Boa festa! 🎉' : vip.status === 'approved' ? 'Seu nome está na lista VIP! ✅' : vip.status === 'rejected' ? 'Seu pedido de lista VIP não foi aprovado.' : 'Pedido VIP atualizado';
    toast(`<b>${esc(event?.title || 'Lista VIP')}</b><span class="small">${msg}</span>`, { icon: '🎟️', onClick: () => { state.agendaSeg = 'vip'; switchTab('agenda'); }, time: 6000 });
    notify('Lista VIP — ' + (event?.title || ''), msg);
    if (state.tab === 'agenda') renderAgenda();
  });
  s.on('checkin:ended', async () => {
    state.user.checkin = null; state.deck = []; state.deckLoaded = false;
    toast('Seu check-in na Save foi encerrado. Volte sempre! 👋', { icon: '🌙' });
    if (state.tab === 'pista') renderPista();
  });
  s.on('account:banned', () => { alert('Sua conta foi suspensa pela equipe SAVE.'); logout(true); });
}

/* ---------------------------- PISTA (deck) ---------------------------- */
async function renderPista() {
  const v = $('#view'); if (!v || state.tab !== 'pista') return;
  if (!state.user.checkin) return renderCheckin(v);
  if (!state.deckLoaded) {
    v.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    try {
      const r = await api('/deck');
      if (!r.checkedIn) { state.user.checkin = null; return renderCheckin(v); }
      state.deck = r.cards; state.likes = r.likes; state.deckLoaded = true;
    } catch (e) { toastErr(e); }
    if (state.tab !== 'pista') return;
  }
  v.innerHTML = `
  <div class="deck-wrap">
    <div class="likes-banner hidden" id="likes-banner"><div class="stack"><i></i><i></i><i></i></div><span id="likes-txt"></span></div>
    <div class="deck" id="deck"></div>
    <div class="actions" id="actions">
      <button class="act sm undo" data-a="undo" title="Desfazer">${I.undo}</button>
      <button class="act nope" data-a="nope" title="Não">${I.x}</button>
      <button class="act sm super" data-a="super" title="Super Save">${I.star}</button>
      <button class="act like" data-a="like" title="Curtir">${I.heart}</button>
    </div>
  </div>`;
  $('#actions').onclick = e => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    if (b.dataset.a === 'undo') return undoSwipe();
    const top = $('#deck .card:last-child'); if (top) flyOut(top, b.dataset.a);
  };
  updateLikesBanner();
  drawDeck();
}

function updateLikesBanner() {
  const b = $('#likes-banner'); if (!b) return;
  b.classList.toggle('hidden', !state.likes);
  $('#likes-txt').innerHTML = `<b>${state.likes}</b>&nbsp;${state.likes === 1 ? 'pessoa curtiu' : 'pessoas curtiram'} você. Continue deslizando!`;
}

function renderCheckin(v) {
  v.innerHTML = `
  <div class="checkin scroll">
    <div class="checkin-card">
      <div class="qr-ico">${I.qr}</div>
      <div class="eyebrow">Check-in na pista</div>
      <h2 class="h2" style="margin:6px 0 4px">Você está na Save?</h2>
      <p class="muted small" style="margin:0">Só quem está dentro da boate aparece na pista. Escaneie o QR Code da entrada ou digite o código do dia.</p>
      <div class="steps">
        <div><b>1</b> Aponte a câmera para o QR Code na entrada</div>
        <div><b>2</b> Permita a localização para confirmar</div>
        <div><b>3</b> Pronto! Comece a dar match 🔥</div>
      </div>
      <div class="col" style="margin-top:14px">
        <input class="input code-input" id="code" placeholder="CÓDIGO" maxlength="12" autocapitalize="characters" value="${esc(sessionStorage.getItem('save_pending_checkin') || '')}" />
        <button class="btn btn-primary btn-block" id="do-checkin">Fazer check-in</button>
      </div>
    </div>
    <p class="center tiny muted">${I.pin} ${esc(state.venue?.address || 'Rua Gomes Freire, 595 - Lapa, RJ')}</p>
    <button class="btn btn-ghost btn-sm" style="align-self:center" id="see-agenda">Ver programação da semana</button>
  </div>`;
  $('#do-checkin').onclick = () => doCheckin($('#code').value);
  $('#code').onkeydown = e => { if (e.key === 'Enter') doCheckin(e.target.value); };
  $('#see-agenda').onclick = () => switchTab('agenda');
}

async function doCheckin(code) {
  code = String(code || '').trim();
  if (!code) return toast('Digite o código do QR Code da entrada', { icon: '🔑' });
  if (!state.user.photos?.length) {
    toast('Adicione uma foto no seu perfil antes do check-in 📸', { icon: '📸' });
    sessionStorage.setItem('save_pending_checkin', code);
    return switchTab('perfil');
  }
  const btn = $('#do-checkin'); if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spinner" style="width:22px;height:22px"></div> Confirmando localização...'; }
  const pos = await getPosition();
  try {
    const r = await api('/checkin', { method: 'POST', body: { code, ...(pos || {}) } });
    sessionStorage.removeItem('save_pending_checkin');
    state.user = r.user; state.deckLoaded = false;
    vibrate([40, 60, 40]);
    toast('<b>Check-in feito! 🎉</b><span class="small">Bem-vindo(a) à pista da Save</span>', { icon: '✅' });
    if (state.tab === 'pista') renderPista();
    startPresenceWatch();
  } catch (e) {
    toastErr(e);
    if (btn) { btn.disabled = false; btn.textContent = 'Fazer check-in'; }
  }
}

let presenceTimer = null;
function startPresenceWatch() {
  clearInterval(presenceTimer);
  if (!state.user?.checkin) return;
  presenceTimer = setInterval(async () => {
    if (!state.venue?.enforceGps || !state.user?.checkin) return;
    const p = await getPosition(8000);
    if (p) api('/presence', { method: 'POST', body: p }).catch(() => {});
  }, 3 * 60 * 1000);
}

function cardHTML(u) {
  const photos = u.photos?.length ? u.photos : ['/img/icon.svg'];
  return `
    <div class="photo" style="background-image:url('${esc(photos[0])}')"></div>
    ${photos.length > 1 ? `<div class="bars">${photos.map((_, i) => `<i class="${i === 0 ? 'on' : ''}"></i>`).join('')}</div>` : ''}
    <div class="shade"></div>
    <div class="stamp like">Curti</div><div class="stamp nope">Não</div><div class="stamp super">Super Save</div>
    <div class="info">
      ${u.superLikedMe ? '<span class="super-tag">⭐ TE DEU SUPER SAVE</span><br>' : ''}
      <div class="name">${esc(u.name)} <span>${u.age}</span></div>
      <div class="here"><span class="live-dot"></span> Na pista agora</div>
      <div class="bio">${esc(u.bio)}</div>
    </div>
    <button class="info-btn" data-info="1">i</button>`;
}

function drawDeck() {
  const deck = $('#deck'); if (!deck) return;
  const dragging = deck.querySelector('.card.dragging, .card.flying');
  if (dragging) return; // não redesenha durante o gesto
  const cards = state.deck.slice(0, 3);
  if (!cards.length) {
    deck.innerHTML = `
    <div class="empty" style="height:100%">
      <div class="radar"><div class="me" style="background-image:url('${esc(photoOf(state.user))}')"></div></div>
      <h3 class="h2">Procurando gente na pista...</h3>
      <p class="muted small" style="margin:0;max-width:280px">Você já viu todos os perfis compatíveis no momento. Assim que alguém fizer check-in na Save, aparece aqui na hora. ✨</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:8px;">
        <button class="btn btn-primary btn-sm" id="reset-nopes">🔄 Rever perfis da pista</button>
        <button class="btn btn-ghost btn-sm" id="adjust-prefs">⚙️ Ajustar preferências</button>
        <button class="btn btn-ghost btn-sm" id="to-matches">Ver meus matches</button>
      </div>
    </div>`;
    $('#to-matches').onclick = () => switchTab('matches');
    $('#adjust-prefs').onclick = editPrefs;
    $('#reset-nopes').onclick = async () => {
      await api('/swipe/reset-nopes', { method: 'POST' });
      state.deckLoaded = false;
      renderPista();
    };
    $('#actions')?.classList.add('hidden');
    return;
  }
  $('#actions')?.classList.remove('hidden');
  deck.innerHTML = '';
  [...cards].reverse().forEach((u, idxFromBack) => {
    const depth = cards.length - 1 - idxFromBack;
    const el = document.createElement('div');
    el.className = 'card';
    el.dataset.id = u.id;
    el.style.transform = `translateY(${depth * 10}px) scale(${1 - depth * 0.04})`;
    el.style.zIndex = 10 - depth;
    el.innerHTML = cardHTML(u);
    el._user = u; el._photo = 0;
    deck.appendChild(el);
  });
  bindDrag(deck.lastElementChild);
}

function bindDrag(card) {
  if (!card) return;
  let sx = 0, sy = 0, dx = 0, dy = 0, down = false, moved = false;
  const stamps = { like: $('.stamp.like', card), nope: $('.stamp.nope', card), super: $('.stamp.super', card) };
  card.onpointerdown = e => {
    if (e.target.closest('[data-info]')) return;
    down = true; moved = false; sx = e.clientX; sy = e.clientY; dx = dy = 0;
    card.setPointerCapture(e.pointerId);
    card.classList.add('dragging');
  };
  card.onpointermove = e => {
    if (!down) return;
    dx = e.clientX - sx; dy = e.clientY - sy;
    if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;
    card.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx / 16}deg)`;
    stamps.like.style.opacity = Math.max(0, Math.min(1, dx / 100));
    stamps.nope.style.opacity = Math.max(0, Math.min(1, -dx / 100));
    stamps.super.style.opacity = Math.max(0, Math.min(1, (-dy - Math.abs(dx)) / 100));
  };
  const end = e => {
    if (!down) return;
    down = false;
    card.classList.remove('dragging');
    if (!moved) { // toque: troca foto ou abre perfil
      const r = card.getBoundingClientRect();
      const u = card._user;
      if (e.clientY > r.bottom - 150) return openProfileSheet(u);
      if (u.photos?.length > 1) {
        card._photo = (card._photo + (e.clientX > r.left + r.width / 2 ? 1 : -1) + u.photos.length) % u.photos.length;
        $('.photo', card).style.backgroundImage = `url('${u.photos[card._photo]}')`;
        $$('.bars i', card).forEach((b, i) => b.classList.toggle('on', i === card._photo));
      }
      card.style.transform = '';
      return;
    }
    if (dx > 110) flyOut(card, 'like');
    else if (dx < -110) flyOut(card, 'nope');
    else if (dy < -130) flyOut(card, 'super');
    else { card.style.transform = ''; Object.values(stamps).forEach(s => s.style.opacity = 0); }
  };
  card.onpointerup = end;
  card.onpointercancel = end;
  $('[data-info]', card).onclick = e => { e.stopPropagation(); openProfileSheet(card._user); };
}

async function flyOut(card, action) {
  if (card.classList.contains('flying')) return;
  card.classList.add('flying');
  const u = card._user;
  const st = $(`.stamp.${action}`, card); if (st) st.style.opacity = 1;
  const w = window.innerWidth;
  card.style.transition = 'transform .45s ease-out, opacity .45s';
  card.style.transform = action === 'like' ? `translate(${w}px, -40px) rotate(30deg)` : action === 'nope' ? `translate(${-w}px, -40px) rotate(-30deg)` : `translate(0, -120%) scale(.9)`;
  card.style.opacity = '0';
  vibrate(action === 'super' ? [20, 30, 20] : 15);
  state.deck = state.deck.filter(c => c.id !== u.id);
  state.history.push({ user: u, action });
  setTimeout(() => { card.remove(); drawDeck(); }, 300);
  try {
    const r = await api('/swipe', { method: 'POST', body: { targetId: u.id, action } });
    if (r.match) { showMatch(r.match.user, r.match.match); refreshMatches(); }
    if (action !== 'nope' && state.likes > 0) {
      // se essa pessoa já tinha curtido, o contador diminui (atualizado pelo /me)
      api('/me').then(m => { state.likes = m.likes; updateLikesBanner(); }).catch(() => {});
    }
  } catch (e) { toastErr(e); }
}

async function undoSwipe() {
  const last = state.history[state.history.length - 1];
  if (!last) return toast('Nada para desfazer', { icon: '↩️' });
  if (last.action !== 'nope') return toast('Só é possível desfazer um "Não"', { icon: '↩️' });
  try {
    const r = await api('/swipe/undo', { method: 'POST' });
    state.history.pop();
    if (r.card) { state.deck.unshift(r.card); drawDeck(); }
  } catch (e) { toastErr(e); }
}

function openProfileSheet(u, { fromChat } = {}) {
  const photos = u.photos?.length ? u.photos : ['/img/icon.svg'];
  const ov = sheet(`
    <div class="gallery">${photos.map(p => `<img src="${esc(p)}" alt="" />`).join('')}</div>
    <div class="pinfo col">
      <div><div class="h1">${esc(u.name)} <span style="font-weight:300">${u.age}</span></div>
      ${u.here ? '<div class="here" style="color:var(--green);font-weight:700;font-size:13px;margin-top:6px"><span class="live-dot"></span> Na Save agora</div>' : ''}</div>
      ${u.bio ? `<p style="margin:0;line-height:1.5">${esc(u.bio)}</p>` : ''}
      <div class="chips"><span class="tag">${GENDER[u.gender] || ''}</span>${u.instagram ? `<a class="tag pink" style="text-decoration:none" target="_blank" href="https://instagram.com/${esc(u.instagram.replace('@', ''))}">📸 ${esc(u.instagram)}</a>` : ''}</div>
      ${fromChat ? '' : `<div class="row" style="justify-content:center;gap:18px;margin-top:6px">
        <button class="act nope" data-sa="nope">${I.x}</button><button class="act sm super" data-sa="super">${I.star}</button><button class="act like" data-sa="like">${I.heart}</button></div>`}
      <button class="btn btn-ghost btn-sm" id="report-u" style="align-self:center;color:#ff7a9e">Denunciar ${esc(u.name)}</button>
    </div>`, { cls: 'profile-sheet' });
  $$('[data-sa]', ov).forEach(b => b.onclick = () => {
    ov.close();
    const card = $(`#deck .card[data-id="${u.id}"]`);
    if (card) flyOut(card, b.dataset.sa);
  });
  $('#report-u', ov).onclick = () => { ov.close(); reportUser(u); };
}

function reportUser(u, after) {
  const ov = sheet(`
    <h2 class="h2">Denunciar ${esc(u.name)}</h2>
    <p class="muted small">A equipe da Save recebe na hora. O perfil também será bloqueado para você.</p>
    <div class="chips" id="reasons">${['Perfil falso', 'Fotos impróprias', 'Assédio / ofensa', 'Menor de idade', 'Comportamento inadequado na boate', 'Outro'].map(r => `<button class="chip">${r}</button>`).join('')}</div>
    <textarea class="input" id="rdetail" placeholder="Detalhes (opcional)" style="margin-top:12px"></textarea>
    <button class="btn btn-primary btn-block" id="rsend" style="margin-top:14px">Enviar denúncia</button>`);
  let reason = '';
  $('#reasons', ov).onclick = e => { const c = e.target.closest('.chip'); if (!c) return; reason = c.textContent; $$('.chip', ov).forEach(x => x.classList.toggle('on', x === c)); };
  $('#rsend', ov).onclick = async () => {
    if (!reason) return toast('Escolha um motivo', { icon: '⚠️' });
    try {
      await api('/report', { method: 'POST', body: { userId: u.id, reason: reason + ($('#rdetail', ov).value ? ' — ' + $('#rdetail', ov).value : '') } });
      ov.close();
      state.deck = state.deck.filter(c => c.id !== u.id);
      if (state.tab === 'pista') drawDeck();
      toast('Denúncia enviada. Obrigado por manter a Save segura 💜', { icon: '🛡️' });
      after && after();
    } catch (e) { toastErr(e); }
  };
}

/* ---------------------------- MATCH! ---------------------------- */
function showMatch(user, match) {
  if ($('.match-modal')) $('.match-modal').remove();
  vibrate([60, 40, 60, 40, 120]);
  const el = document.createElement('div');
  el.className = 'match-modal';
  el.innerHTML = `
    <div class="title">DEU<br>MATCH!</div>
    <p style="margin:0;font-size:16px">Você e <b>${esc(user.name)}</b> se curtiram.<br><span class="muted small">Vocês dois estão na Save agora 👀</span></p>
    <div class="pair"><div class="avatar" style="background-image:url('${esc(photoOf(state.user))}')"></div><div class="avatar" style="background-image:url('${esc(photoOf(user))}')"></div></div>
    <div class="col" style="width:100%;max-width:340px">
      <button class="btn btn-primary btn-block" id="m-chat">Mandar mensagem</button>
      <button class="btn btn-ghost btn-block" id="m-close">Continuar na pista</button>
    </div>`;
  document.body.appendChild(el);
  const conf = document.createElement('div');
  conf.className = 'confetti';
  const colors = ['#c501e2', '#2ef8a0', '#e7c500', '#f82d97', '#35ACE8', '#FF5B00'];
  conf.innerHTML = Array.from({ length: 70 }, () => `<i style="left:${Math.random() * 100}%;background:${colors[Math.floor(Math.random() * colors.length)]};animation-duration:${2 + Math.random() * 2.5}s;animation-delay:${Math.random() * .6}s"></i>`).join('');
  document.body.appendChild(conf);
  setTimeout(() => conf.remove(), 5500);
  $('#m-close', el).onclick = () => el.remove();
  $('#m-chat', el).onclick = () => { el.remove(); switchTab('matches'); openChat(match.id); };
}

/* ---------------------------- MATCHES ---------------------------- */
const seenMatches = new Set(JSON.parse(localStorage.getItem('save_seen_matches') || '[]'));
function markMatchSeen(id) { seenMatches.add(id); localStorage.setItem('save_seen_matches', JSON.stringify([...seenMatches])); }
async function refreshMatches() {
  try {
    const r = await api('/matches');
    state.matches = r.matches.map(m => ({ ...m, seen: seenMatches.has(m.id) }));
    updateMatchBadge();
    if (state.tab === 'matches' && !state.openChatId) renderMatches(false);
  } catch {}
}
function updateMatchBadge() {
  setBadge('matches', state.matches.reduce((n, m) => n + (m.unread || 0), 0) + state.matches.filter(m => !m.last && !m.seen).length);
}

function renderMatches(fetch = true) {
  const v = $('#view'); if (!v || state.tab !== 'matches') return;
  if (fetch) refreshMatches();
  const fresh = state.matches.filter(m => !m.last);
  const convs = state.matches.filter(m => m.last);
  v.innerHTML = `<div class="scroll">
    <div class="pad" style="padding-bottom:0"><h2 class="h2">Matches</h2></div>
    ${!state.matches.length ? `
      <div class="empty" style="padding-top:60px">
        <div style="font-size:54px">💘</div>
        <h3 class="h2">Nenhum match ainda</h3>
        <p class="muted small" style="max-width:260px;margin:0">Faça check-in na Save e comece a deslizar. Quando a curtida for recíproca, a conversa aparece aqui.</p>
        <button class="btn btn-primary btn-sm" id="go-pista">Ir para a pista</button>
      </div>` : `
      ${fresh.length ? `<div class="section-title">Novos matches <span class="grad-text">${fresh.length}</span></div>
      <div class="new-matches">${fresh.map(m => `<button class="nm" data-open="${m.id}"><div class="av ${m.seen ? '' : 'unread'}" style="background-image:url('${esc(photoOf(m.user))}')"></div>${esc(m.user.name)}</button>`).join('')}</div>` : ''}
      <div class="section-title">Conversas</div>
      ${convs.length ? convs.map(m => `
        <button class="conv" data-open="${m.id}">
          <div class="avatar ${m.user.here ? 'online' : ''}" style="background-image:url('${esc(photoOf(m.user))}')"></div>
          <div class="meta"><b>${esc(m.user.name)}</b><p class="${m.unread ? 'unread' : ''}">${m.last.from === state.user.id ? 'Você: ' : ''}${esc(m.last.text)}</p></div>
          <div class="col" style="align-items:flex-end;gap:6px"><span class="time">${fmtRelative(m.last.createdAt)}</span>${m.unread ? '<span class="dot-unread"></span>' : ''}</div>
        </button>`).join('') : '<p class="muted small" style="padding:0 18px">Mande a primeira mensagem para um dos seus novos matches 👆</p>'}
    `}
  </div>`;
  v.onclick = e => {
    const o = e.target.closest('[data-open]'); if (o) openChat(o.dataset.open);
    if (e.target.closest('#go-pista')) switchTab('pista');
  };
}

let typingTimer = null, lastTypingSent = 0;
async function openChat(matchId) {
  $('.chat')?.remove();
  state.openChatId = matchId;
  const wrap = document.createElement('div');
  wrap.className = 'chat';
  wrap.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  app.appendChild(wrap);
  let r;
  try { r = await api(`/matches/${matchId}/messages`); } catch (e) { toastErr(e); wrap.remove(); state.openChatId = null; return; }
  const m = state.matches.find(x => x.id === matchId);
  if (m) { m.unread = 0; m.seen = true; }
  markMatchSeen(matchId);
  updateMatchBadge();
  const u = r.user;
  wrap.innerHTML = `
    <div class="chat-head">
      <button class="icon-btn" id="c-back">${I.back}</button>
      <div class="avatar ${u.here ? 'online' : ''}" style="background-image:url('${esc(photoOf(u))}')" id="c-av"></div>
      <div class="who"><b>${esc(u.name)}, ${u.age}</b><span>${u.here ? '● Na Save agora' : '<span class="muted">Fora da Save</span>'}</span></div>
      <button class="icon-btn" id="c-menu">${I.dots}</button>
    </div>
    <div class="msgs" id="msgs">
      <div class="match-hello">
        <div class="avatar" style="background-image:url('${esc(photoOf(u))}')"></div>
        <b>Você deu match com ${esc(u.name)}</b>
        <p class="muted small" style="margin:4px 0 0">${new Date(r.match.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} • na Boate Save</p>
      </div>
    </div>
    ${!r.messages.length ? `<div class="quick" id="quick">${['Oi! Tô aqui na pista 👋', 'Bora se encontrar no bar? 🍹', 'Que música boa agora! 🔥', 'Qual sua roupa? Vou te achar 👀'].map(t => `<button>${t}</button>`).join('')}</div>` : ''}
    <form class="composer" id="comp"><input id="c-in" placeholder="Mensagem..." autocomplete="off" maxlength="1000" /><button>${I.send}</button></form>`;
  r.messages.forEach(appendMessage);
  const input = $('#c-in', wrap);
  $('#c-back', wrap).onclick = closeChat;
  $('#c-av', wrap).onclick = () => openProfileSheet(u, { fromChat: true });
  $('#c-menu', wrap).onclick = () => {
    const ov = sheet(`<div class="list" style="margin:0">
      <button id="o-prof">👤 Ver perfil</button>
      ${u.instagram ? `<a id="o-ig" target="_blank" href="https://instagram.com/${esc(u.instagram.replace('@', ''))}" style="color:#fff;text-decoration:none">📸 Instagram ${esc(u.instagram)}</a>` : ''}
      <button id="o-un">💔 Desfazer match</button>
      <button id="o-rep" style="color:#ff7a9e">🛡️ Denunciar e bloquear</button></div>`);
    $('#o-prof', ov).onclick = () => { ov.close(); openProfileSheet(u, { fromChat: true }); };
    $('#o-un', ov).onclick = async () => {
      if (!confirm(`Desfazer match com ${u.name}? A conversa será apagada.`)) return;
      ov.close();
      try { await api(`/matches/${matchId}/unmatch`, { method: 'POST' }); } catch (e) { toastErr(e); }
    };
    $('#o-rep', ov).onclick = () => { ov.close(); reportUser(u, closeChat); };
  };
  const send = text => {
    text = text.trim(); if (!text) return;
    $('#quick', wrap)?.remove();
    state.socket.emit('message:send', { matchId, text }, ack => { if (ack?.error) toastErr(ack.error); });
  };
  $('#comp', wrap).onsubmit = e => { e.preventDefault(); send(input.value); input.value = ''; input.focus(); };
  $('#quick', wrap)?.addEventListener('click', e => { const b = e.target.closest('button'); if (b) send(b.textContent); });
  input.oninput = () => { if (Date.now() - lastTypingSent > 1500) { lastTypingSent = Date.now(); state.socket.emit('typing', { matchId }); } };
}
function closeChat() {
  $('.chat')?.remove(); state.openChatId = null;
  if (state.tab === 'matches') renderMatches();
}
function appendMessage(msg) {
  const box = $('#msgs'); if (!box) return;
  $('#typing')?.remove(); $('#read-status')?.remove();
  const mine = msg.from === state.user.id;
  const el = document.createElement('div');
  el.className = 'msg ' + (mine ? 'me' : 'them');
  el.textContent = msg.text;
  el.title = fmtTime(msg.createdAt);
  box.appendChild(el);
  const lastEls = $$('.msg', box); const last = lastEls[lastEls.length - 1];
  if (last && last.classList.contains('me')) {
    const st = document.createElement('div');
    st.className = 'msg-status'; st.id = 'read-status';
    st.textContent = msg.readAt ? 'Visto ✓✓' : 'Enviado ✓ ' + fmtTime(msg.createdAt);
    box.appendChild(st);
  }
  box.scrollTop = box.scrollHeight;
}
function showTyping() {
  const box = $('#msgs'); if (!box) return;
  if (!$('#typing')) { const t = document.createElement('div'); t.className = 'typing'; t.id = 'typing'; t.innerHTML = '<i></i><i></i><i></i>'; box.appendChild(t); box.scrollTop = box.scrollHeight; }
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => $('#typing')?.remove(), 3500);
}

/* ---------------------------- AGENDA ---------------------------- */
function eventArt(e, big) {
  if (e.flyer) return `background-image:url('${esc(e.flyer)}')`;
  return `background:radial-gradient(circle at 80% 10%, ${e.color}cc, transparent 60%), linear-gradient(160deg, ${e.color}66, #12051a 75%)`;
}
async function renderAgenda() {
  const v = $('#view'); if (!v || state.tab !== 'agenda') return;
  if (!state.events.length) v.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  try {
    const [ev, vip] = await Promise.all([api('/events'), api('/vip')]);
    state.events = ev.events; state.vip = vip.vip;
  } catch (e) { toastErr(e); }
  if (state.tab !== 'agenda') return;
  const hero = state.events.find(e => e.featured) || state.events[0];
  const pendingVip = state.vip.filter(x => x.status === 'approved' && !x.usedAt).length;
  v.innerHTML = `<div class="scroll" style="padding-bottom:14px">
    <div class="pad" style="padding-bottom:6px"><div class="eyebrow">Programação</div><h2 class="h2">Agenda da Save</h2></div>
    <div class="seg"><button data-seg="eventos" class="${state.agendaSeg === 'eventos' ? 'on' : ''}">Próximos eventos</button><button data-seg="vip" class="${state.agendaSeg === 'vip' ? 'on' : ''}">Minha lista VIP ${pendingVip ? `(${pendingVip})` : ''}</button></div>
    <div id="seg-body"></div>
  </div>`;
  const body = $('#seg-body', v);
  if (state.agendaSeg === 'eventos') {
    if (!state.events.length) body.innerHTML = '<div class="empty"><div style="font-size:48px">🗓️</div><p class="muted">Nenhum evento programado no momento. Fique de olho nos avisos!</p></div>';
    else body.innerHTML = `
      ${hero ? `<button class="hero-ev btn-block" data-ev="${hero.id}" style="${eventArt(hero, true)};text-align:left;width:calc(100% - 32px)">
        ${hero.flyer ? '' : `<div class="ev-art"><img class="lg" src="/img/logo-white.svg" style="opacity:.18" alt="" /></div>`}
        <div class="col" style="gap:6px">
          <span class="tag" style="background:${hero.color};color:#fff;align-self:flex-start">⭐ EM DESTAQUE</span>
          <div class="h1" style="font-size:28px">${esc(hero.title)}</div>
          <div class="small" style="color:#eee">${esc(dateParts(hero.start).long)} • ${dateParts(hero.start).h}</div>
          <div class="small muted">${esc(hero.subtitle || '')}</div>
        </div></button>` : ''}
      <div class="section-title">Todos os eventos</div>
      ${state.events.map(e => { const d = dateParts(e.start); return `
        <button class="ev" data-ev="${e.id}">
          <div class="date" style="background:linear-gradient(160deg, ${e.color}, ${e.color}88)"><div class="m">${d.m}</div><div class="d">${d.d}</div><div class="w">${d.w}</div></div>
          <div class="body">
            <b>${esc(e.title)}</b>
            <div class="sub">${esc(e.subtitle || '')} • ${d.h}</div>
            <div class="tags">
              <span class="tag green">🔥 <span data-going="${e.id}">${e.going}</span>&nbsp;vão</span>
              ${e.iAmGoing ? '<span class="tag pink">Eu vou</span>' : ''}
              ${e.myVip ? `<span class="tag ${e.myVip.status === 'approved' ? 'green' : e.myVip.status === 'rejected' ? 'pink' : 'yellow'}">VIP: ${({ pending: 'aguardando', approved: 'aprovado', rejected: 'recusado' })[e.myVip.status]}</span>` : e.vipEnabled ? '<span class="tag yellow">Lista VIP aberta</span>' : ''}
            </div>
          </div>
        </button>`; }).join('')}`;
  } else {
    body.innerHTML = state.vip.length ? state.vip.map(x => { const d = dateParts(x.event.start); return `
      <div class="ticket" style="${x.status !== 'approved' ? 'background:var(--card);border-color:var(--line)' : ''}" ${x.qr ? `data-qr="${x.id}"` : ''}>
        ${x.qr ? `<img src="${x.qr}" alt="QR" />` : `<div style="width:86px;height:86px;border-radius:10px;display:grid;place-items:center;font-size:34px;background:rgba(255,255,255,.05)">${x.status === 'rejected' ? '❌' : '⏳'}</div>`}
        <div class="grow">
          <b>${esc(x.event.title)}</b>
          <div class="small muted">${esc(d.long)} • ${d.h}</div>
          <div class="small" style="margin-top:6px">${x.usedAt ? '✅ Entrada utilizada' : x.status === 'approved' ? `<span style="color:var(--green);font-weight:700">Aprovado</span> • Código <b>${x.code}</b>` : x.status === 'rejected' ? '<span style="color:var(--pink)">Não aprovado</span>' : '<span style="color:var(--yellow)">Aguardando aprovação da Save</span>'}</div>
          ${x.guests ? `<div class="tiny muted">+${x.guests} convidado(s)</div>` : ''}
        </div>
      </div>`; }).join('') + '<p class="center tiny muted">Apresente o QR Code na portaria da Save. Toque para ampliar.</p>'
      : '<div class="empty"><div style="font-size:48px">🎟️</div><p class="muted">Você ainda não pediu lista VIP.<br>Abra um evento e coloque seu nome!</p></div>';
  }
  v.onclick = e => {
    const s = e.target.closest('[data-seg]'); if (s) { state.agendaSeg = s.dataset.seg; return renderAgenda(); }
    const ev = e.target.closest('[data-ev]'); if (ev) return openEvent(state.events.find(x => x.id === ev.dataset.ev));
    const q = e.target.closest('[data-qr]'); if (q) { const x = state.vip.find(y => y.id === q.dataset.qr); sheet(`<div class="center col" style="align-items:center"><h2 class="h2">${esc(x.event.title)}</h2><img src="${x.qr}" style="width:280px;border-radius:16px;background:#fff;padding:8px" /><div class="h2" style="letter-spacing:.2em">${x.code}</div><p class="muted small">${esc(state.user.name)}${x.guests ? ` + ${x.guests} convidado(s)` : ''}</p></div>`); }
  };
}

function openEvent(e) {
  if (!e) return;
  const d = dateParts(e.start);
  const ov = sheet(`
    <div class="hero-ev" style="${eventArt(e, true)};margin:0 0 16px;min-height:200px">
      ${e.flyer ? '' : `<div class="ev-art"><img class="lg" src="/img/logo-white.svg" style="opacity:.2" alt="" /></div>`}
      <div class="col" style="gap:4px"><div class="h1" style="font-size:28px">${esc(e.title)}</div><div class="small" style="color:#eee">${esc(e.subtitle || '')}</div></div>
    </div>
    <div class="col">
      <div class="row"><span style="font-size:22px">🗓️</span><div><b style="text-transform:capitalize">${esc(d.long)}</b><div class="small muted">A partir das ${d.h} • Boate Save</div></div></div>
      <div class="row"><span style="font-size:22px">📍</span><div><b>Rua Gomes Freire, 595</b><div class="small muted">Lapa • Rio de Janeiro</div></div></div>
      ${e.price ? `<div class="row"><span style="font-size:22px">🎟️</span><div><b>${esc(e.price)}</b></div></div>` : ''}
      ${e.lineup?.length ? `<div><div class="section-title" style="margin:8px 0">Line-up</div><div class="chips">${e.lineup.map(l => `<span class="chip">🎧 ${esc(l)}</span>`).join('')}</div></div>` : ''}
      ${e.description ? `<p style="line-height:1.55;margin:4px 0;color:#e2d6ee">${esc(e.description)}</p>` : ''}
      <div class="row" style="gap:10px;margin-top:6px">
        <button class="btn ${e.iAmGoing ? 'btn-green' : 'btn-ghost'} grow" id="e-go">${e.iAmGoing ? '✓ Eu vou' : '🔥 Eu vou'} (<span id="e-going">${e.going}</span>)</button>
        <button class="btn btn-ghost" id="e-cal" title="Adicionar ao calendário">📅</button>
        <button class="btn btn-ghost" id="e-share" title="Compartilhar">↗</button>
      </div>
      ${e.myVip ? `<div class="ticket" style="margin:0"><div class="grow"><b>Lista VIP</b><div class="small">${({ pending: '⏳ Aguardando aprovação', approved: '✅ Aprovado! Veja seu QR em "Minha lista VIP"', rejected: '❌ Não aprovado' })[e.myVip.status]}</div></div></div>`
      : e.vipEnabled ? `<button class="btn btn-primary btn-block" id="e-vip">⭐ Colocar nome na Lista VIP</button>` : ''}
      ${e.ticketUrl ? `<a class="btn btn-outline btn-block" href="${esc(e.ticketUrl)}" target="_blank" style="text-decoration:none;color:#fff">Comprar ingresso</a>` : ''}
    </div>`);
  $('#e-go', ov).onclick = async () => {
    try {
      const r = await api(`/events/${e.id}/rsvp`, { method: 'POST' });
      Object.assign(e, r.event);
      $('#e-go', ov).className = `btn ${e.iAmGoing ? 'btn-green' : 'btn-ghost'} grow`;
      $('#e-go', ov).innerHTML = `${e.iAmGoing ? '✓ Eu vou' : '🔥 Eu vou'} (<span id="e-going">${e.going}</span>)`;
      if (e.iAmGoing) toast('Confirmado! Te esperamos na Save 💜', { icon: '🎉' });
    } catch (er) { toastErr(er); }
  };
  $('#e-cal', ov).onclick = () => downloadICS(e);
  $('#e-share', ov).onclick = async () => {
    const text = `${e.title} — ${d.long} às ${d.h} na Boate Save (Rua Gomes Freire, 595 - Lapa)`;
    try { if (navigator.share) await navigator.share({ title: e.title, text, url: location.origin }); else { await navigator.clipboard.writeText(text + ' ' + location.origin); toast('Copiado para compartilhar!', { icon: '📋' }); } } catch {}
  };
  $('#e-vip', ov)?.addEventListener('click', () => {
    ov.close();
    const f = sheet(`
      <h2 class="h2">Lista VIP • ${esc(e.title)}</h2>
      <p class="muted small">Seu pedido vai direto para a equipe da Save. Você recebe a confirmação aqui no app, em tempo real.</p>
      <div class="field"><label>Convidados (além de você)</label>
        <div class="chips" id="g">${[0, 1, 2, 3, 4, 5].map(n => `<button class="chip ${n === 0 ? 'on' : ''}" data-n="${n}">${n === 0 ? 'Só eu' : '+' + n}</button>`).join('')}</div></div>
      <div class="field" style="margin-top:12px"><label>Nome dos convidados</label><textarea class="input" id="gn" placeholder="Um nome por linha"></textarea></div>
      <button class="btn btn-primary btn-block" id="vsend" style="margin-top:14px">Enviar pedido</button>`);
    let guests = 0;
    $('#g', f).onclick = ev => { const c = ev.target.closest('[data-n]'); if (!c) return; guests = +c.dataset.n; $$('#g .chip', f).forEach(x => x.classList.toggle('on', x === c)); };
    $('#vsend', f).onclick = async () => {
      try {
        await api(`/events/${e.id}/vip`, { method: 'POST', body: { guests, guestNames: $('#gn', f).value } });
        f.close(); toast('<b>Pedido enviado! ⭐</b><span class="small">Avisaremos assim que for aprovado</span>', { icon: '🎟️' });
        renderAgenda();
      } catch (er) { toastErr(er); }
    };
  });
}

function downloadICS(e) {
  const f = d => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Boate Save//SAVE Match//PT', 'BEGIN:VEVENT', `UID:${e.id}@save`, `DTSTAMP:${f(Date.now())}`,
    `DTSTART:${f(e.start)}`, `DTEND:${f(e.end || new Date(new Date(e.start).getTime() + 6 * 3600e3))}`, `SUMMARY:${e.title} - Boate Save`,
    `DESCRIPTION:${(e.description || '').replace(/\n/g, ' ')}`, 'LOCATION:Rua Gomes Freire\\, 595 - Lapa\\, Rio de Janeiro', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  a.download = `${e.title}.ics`; a.click();
}

/* ---------------------------- AVISOS ---------------------------- */
async function refreshAnns() {
  try { const r = await api('/announcements'); state.anns = r.announcements; updateAnnBadge(); } catch {}
}
function updateAnnBadge() {
  const n = state.anns.filter(a => a.createdAt > state.lastSeenAnn).length;
  setBadge('avisos', state.tab === 'avisos' ? 0 : n);
}
async function renderAvisos() {
  const v = $('#view'); if (!v || state.tab !== 'avisos') return;
  if (!state.anns.length) await refreshAnns();
  if (state.tab !== 'avisos') return;
  const seen = state.lastSeenAnn;
  v.innerHTML = `<div class="scroll" style="padding-bottom:14px">
    <div class="pad"><div class="eyebrow">Direto da Save</div><h2 class="h2">Avisos & novidades</h2></div>
    ${state.anns.length ? state.anns.map(a => { const [ic, bg] = ANN_ICON[a.type] || ANN_ICON.info; return `
      <div class="ann ${a.createdAt > seen || state.freshAnn.has(a.id) ? 'fresh' : ''}">
        <div class="ico" style="background:${bg}">${ic}</div>
        <div class="grow"><b>${esc(a.title)}</b>${a.body ? `<p>${esc(a.body)}</p>` : ''}<span class="tiny muted">${fmtRelative(a.createdAt)}${a.onlyHere ? ' • para quem está na pista' : ''}</span></div>
      </div>`; }).join('') : '<div class="empty"><div style="font-size:48px">📣</div><p class="muted">Nenhum aviso por enquanto.</p></div>'}
  </div>`;
  if (state.anns[0]) { state.lastSeenAnn = state.anns[0].createdAt; localStorage.setItem('save_last_ann', state.lastSeenAnn); }
  state.freshAnn.clear();
  setBadge('avisos', 0);
}

/* ---------------------------- PERFIL ---------------------------- */
function renderPerfil() {
  const v = $('#view'); if (!v || state.tab !== 'perfil') return;
  const u = state.user;
  const venue = state.venue || {};
  const notifOn = u.notifications && ('Notification' in window) && Notification.permission === 'granted';
  v.innerHTML = `<div class="scroll" style="padding-bottom:20px">
    <div class="profile-head">
      <div class="avatar" style="background-image:url('${esc(photoOf(u))}')"></div>
      <div class="h2">${esc(u.name)}, ${u.age}</div>
      ${u.checkin ? `<span class="live-pill"><span class="live-dot"></span> Check-in ativo até ${fmtTime(u.checkin.expiresAt)}</span>` : '<span class="tag">Fora da pista</span>'}
    </div>
    <div class="section-title">Minhas fotos</div>
    <div style="padding:0 16px"><div class="photo-grid" id="pg"></div></div>
    <div class="section-title">Perfil & Conta</div>
    <div class="list">
      <button id="p-edit">✏️ Editar nome, bio e Instagram <span class="chev">›</span></button>
      <button id="p-pref">💞 Eu sou ${GENDER[u.gender]} • Quero ${INTEREST[u.interestedIn]} <span class="chev">›</span></button>
      <button id="p-notif">🔔 Notificações <span class="switch ${notifOn ? 'on' : ''}"></span></button>
      <button id="p-legal">📜 Termos de Uso & LGPD <span class="chev">›</span></button>
      ${state.installPrompt ? '<button id="p-install">📲 Instalar app na tela inicial <span class="chev">›</span></button>' : ''}
      ${u.checkin ? '<button id="p-out" style="color:var(--yellow)">🌙 Sair da pista (encerrar check-in)</button>' : '<button id="p-in">📍 Fazer check-in na Save</button>'}
    </div>
    <div class="section-title">Boate Save</div>
    <div class="venue-card">
      <iframe loading="lazy" src="https://maps.google.com/maps?q=${encodeURIComponent('Rua Gomes Freire, 595 - Lapa, Rio de Janeiro')}&z=16&output=embed"></iframe>
      <div class="pad col" style="gap:8px">
        <b>${esc(venue.name || 'Boate Save')}</b>
        <span class="small muted">${esc(venue.address || 'Rua Gomes Freire, 595 - Lapa, Rio de Janeiro - RJ')}</span>
        <div class="row" style="flex-wrap:wrap">
          <a class="btn btn-ghost btn-sm" style="text-decoration:none;color:#fff" target="_blank" href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent('Rua Gomes Freire, 595, Lapa, Rio de Janeiro')}">🧭 Como chegar</a>
          ${venue.instagram ? `<a class="btn btn-ghost btn-sm" style="text-decoration:none;color:#fff" target="_blank" href="${esc(venue.instagram)}">📸 Instagram</a>` : ''}
          ${venue.whatsapp ? `<a class="btn btn-ghost btn-sm" style="text-decoration:none;color:#fff" target="_blank" href="https://wa.me/${esc(venue.whatsapp.replace(/\D/g, ''))}">💬 WhatsApp</a>` : ''}
        </div>
      </div>
    </div>
    <div class="list">
      <button id="p-logout" style="color:var(--muted)">Sair da conta</button>
      <button id="p-delete" style="color:#ff6b8b">🗑️ Excluir minha conta e dados (LGPD)</button>
    </div>
    <p class="center tiny muted">SAVE Match v1.0 • Boate Save © ${new Date().getFullYear()}</p>
  </div>`;
  drawPhotoGrid($('#pg', v));
  $('#p-edit', v).onclick = editProfile;
  $('#p-pref', v).onclick = editPrefs;
  $('#p-legal', v).onclick = () => openLegalModal('terms');
  $('#p-delete', v).onclick = async () => {
    if (!confirm('Deseja realmente EXCLUIR sua conta definitivamente?\n\nTodas as suas fotos, conversas, matches e dados pessoais serão permanentemente apagados do sistema da Boate Save conforme a LGPD (Lei 13.709/2018).')) return;
    if (!confirm('Esta ação é IRREVERSÍVEL. Confirmar exclusão total?')) return;
    try {
      await api('/me', { method: 'DELETE' });
      toast('Sua conta e todos os dados foram eliminados com sucesso.', { icon: '🛡️' });
      logout(true);
    } catch (e) { toastErr(e); }
  };
  $('#p-notif', v).onclick = async () => {
    if (!('Notification' in window)) return toast('Seu navegador não suporta notificações', { icon: '🔕' });
    let on = !notifOn;
    if (on && Notification.permission !== 'granted') on = (await Notification.requestPermission()) === 'granted';
    const r = await api('/me', { method: 'PUT', body: { notifications: on } }); state.user = r.user;
    toast(on ? 'Notificações ativadas 🔔' : 'Notificações desativadas', { icon: '🔔' });
    renderPerfil();
  };
  $('#p-install', v)?.addEventListener('click', async () => { state.installPrompt.prompt(); state.installPrompt = null; });
  $('#p-out', v)?.addEventListener('click', async () => {
    if (!confirm('Encerrar seu check-in? Você deixará de aparecer na pista.')) return;
    try { const r = await api('/checkout', { method: 'POST' }); state.user = r.user; state.deck = []; state.deckLoaded = false; renderPerfil(); } catch (e) { toastErr(e); }
  });
  $('#p-in', v)?.addEventListener('click', () => switchTab('pista'));
  $('#p-logout', v).onclick = () => { if (confirm('Sair da sua conta?')) logout(); };
  // se havia check-in pendente aguardando foto
  const pending = sessionStorage.getItem('save_pending_checkin');
  if (pending && u.photos?.length && !u.checkin) toast('Foto adicionada! Toque aqui para concluir o check-in', { icon: '📍', onClick: () => { switchTab('pista'); doCheckin(pending); }, time: 8000 });
}

function editProfile() {
  const u = state.user;
  const ov = sheet(`
    <h2 class="h2">Editar perfil</h2>
    <div class="col" style="margin-top:12px">
      <div class="field"><label>Nome</label><input class="input" id="e-name" maxlength="30" value="${esc(u.name)}" /></div>
      <div class="field"><label>Bio</label><textarea class="input" id="e-bio" maxlength="300">${esc(u.bio)}</textarea></div>
      <div class="field"><label>Instagram</label><input class="input" id="e-ig" value="${esc(u.instagram)}" placeholder="@seuinsta" /></div>
      <button class="btn btn-primary btn-block" id="e-save">Salvar</button>
    </div>`);
  $('#e-save', ov).onclick = async () => {
    try {
      const r = await api('/me', { method: 'PUT', body: { name: $('#e-name', ov).value, bio: $('#e-bio', ov).value, instagram: $('#e-ig', ov).value } });
      state.user = r.user; ov.close(); toast('Perfil atualizado ✨'); renderPerfil();
    } catch (e) { toastErr(e); }
  };
}
function editPrefs() {
  const u = state.user; const d = { gender: u.gender, interestedIn: u.interestedIn };
  const ov = sheet(`
    <h2 class="h2">Preferências</h2>
    <div class="field" style="margin-top:12px"><label>Eu sou</label><div class="chips" data-k="gender">${Object.entries(GENDER).map(([k, v]) => `<button class="chip ${d.gender === k ? 'on' : ''}" data-v="${k}">${v}</button>`).join('')}</div></div>
    <div class="field" style="margin-top:12px"><label>Quero conhecer</label><div class="chips" data-k="interestedIn">${Object.entries(INTEREST).map(([k, v]) => `<button class="chip ${d.interestedIn === k ? 'on' : ''}" data-v="${k}">${v}</button>`).join('')}</div></div>
    <button class="btn btn-primary btn-block" id="p-save" style="margin-top:16px">Salvar</button>`);
  $$('.chips', ov).forEach(c => c.onclick = e => { const b = e.target.closest('.chip'); if (!b) return; d[c.dataset.k] = b.dataset.v; $$('.chip', c).forEach(x => x.classList.toggle('on', x === b)); });
  $('#p-save', ov).onclick = async () => {
    try { const r = await api('/me', { method: 'PUT', body: d }); state.user = r.user; state.deckLoaded = false; ov.close(); toast('Preferências salvas'); renderPerfil(); } catch (e) { toastErr(e); }
  };
}

/* =========================================================
   BOOT
   ========================================================= */
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); state.installPrompt = e; });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

(async function boot() {
  app.innerHTML = '<div class="loading"><img src="/img/logo.svg" style="width:90px;animation:pulse 1.5s infinite" alt="" /></div>';
  fetch('/api/venue').then(r => r.json()).then(v => { state.venue = v; setLive(v.live); }).catch(() => {});
  if (!state.token) return renderWelcome();
  try {
    const r = await api('/me');
    state.user = r.user; state.likes = r.likes;
    enterMain();
  } catch { renderWelcome(); }
})();
