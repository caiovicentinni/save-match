// SAVE Match — Painel de Administração e Portaria da Boate Save
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const state = {
  token: localStorage.getItem('save_admin_token'),
  tab: 'dashboard',
  stats: null,
  settings: null,
  events: [],
  announcements: [],
  vip: [],
  users: [],
  reports: [],
  socket: null
};

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch('/api/admin' + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(state.token ? { Authorization: 'Bearer ' + state.token } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (res.status === 401) {
    showLogin();
    throw new Error('Não autenticado');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erro na requisição');
  return data;
}

function showLogin() {
  $('#login-modal').style.display = 'flex';
}
function hideLogin() {
  $('#login-modal').style.display = 'none';
}

$('#form-login').onsubmit = async e => {
  e.preventDefault();
  const pass = $('#login-pass').value;
  $('#login-err').textContent = '';
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pass })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Senha incorreta');
    state.token = data.token;
    localStorage.setItem('save_admin_token', state.token);
    hideLogin();
    initSocket();
    loadAll();
  } catch (err) {
    $('#login-err').textContent = err.message;
  }
};

$('#btn-logout').onclick = () => {
  localStorage.removeItem('save_admin_token');
  location.reload();
};

function initSocket() {
  if (state.socket || !window.io) return;
  state.socket = window.io({ auth: { token: state.token } });
  state.socket.on('admin:stats', s => {
    state.stats = s;
    if (state.tab === 'dashboard') renderDashboard();
  });
  state.socket.on('admin:vip', () => {
    if (state.tab === 'vip') loadVip();
  });
  state.socket.on('admin:report', () => {
    if (state.tab === 'usuarios') loadUsersAndReports();
  });
}

// Navegação por abas
$('#tabs-bar').onclick = e => {
  const btn = e.target.closest('.tab-btn');
  if (!btn) return;
  $$('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  state.tab = btn.dataset.tab;
  renderTab();
};

async function loadAll() {
  try {
    const [stats, settings] = await Promise.all([
      api('/stats'),
      api('/settings')
    ]);
    state.stats = stats;
    state.settings = settings.settings;
    renderTab();
  } catch (err) {
    console.error(err);
  }
}

function renderTab() {
  switch (state.tab) {
    case 'dashboard': renderDashboard(); break;
    case 'checkin': renderCheckin(); break;
    case 'vip': renderVip(); break;
    case 'avisos': renderAvisos(); break;
    case 'agenda': renderAgenda(); break;
    case 'usuarios': renderUsuarios(); break;
    case 'config': renderConfig(); break;
  }
}

/* ==================== DASHBOARD ==================== */
function renderDashboard() {
  const s = state.stats || {
    here: 0, hereWithBots: 0, users: 0, gender: { f: 0, m: 0, nb: 0 },
    matchesToday: 0, messagesToday: 0, vipPending: 0, reportsOpen: 0
  };
  const view = $('#admin-view');
  view.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card green">
        <div class="stat-title">Pessoas na Pista Agora</div>
        <div class="stat-num">${s.here}</div>
        <div class="stat-sub">(${s.hereWithBots} incluindo bots demo)</div>
      </div>
      <div class="stat-card blue">
        <div class="stat-title">Matches Hoje</div>
        <div class="stat-num">${s.matchesToday}</div>
        <div class="stat-sub">Total histórico: ${s.matchesTotal || 0}</div>
      </div>
      <div class="stat-card yellow">
        <div class="stat-title">Mensagens Trocadas Hoje</div>
        <div class="stat-num">${s.messagesToday}</div>
        <div class="stat-sub">Interações em tempo real</div>
      </div>
      <div class="stat-card">
        <div class="stat-title">VIPs Pendentes / Denúncias</div>
        <div class="stat-num">${s.vipPending} <span style="font-size:18px;color:var(--muted)">/ ${s.reportsOpen}</span></div>
        <div class="stat-sub">Aguardando análise da equipe</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:20px;">
      <div class="panel">
        <h3 class="panel-title">👥 Divisão na Pista (Clientes Reais)</h3>
        <div style="margin-top:16px;display:flex;gap:12px;flex-wrap:wrap;">
          <div style="flex:1;background:rgba(255,255,255,0.03);padding:14px;border-radius:12px;text-align:center;">
            <div style="font-size:24px;font-weight:800;color:var(--pink);">${s.gender.f}</div>
            <div style="font-size:12px;color:var(--muted);">Mulheres</div>
          </div>
          <div style="flex:1;background:rgba(255,255,255,0.03);padding:14px;border-radius:12px;text-align:center;">
            <div style="font-size:24px;font-weight:800;color:var(--blue);">${s.gender.m}</div>
            <div style="font-size:12px;color:var(--muted);">Homens</div>
          </div>
          <div style="flex:1;background:rgba(255,255,255,0.03);padding:14px;border-radius:12px;text-align:center;">
            <div style="font-size:24px;font-weight:800;color:var(--yellow);">${s.gender.nb}</div>
            <div style="font-size:12px;color:var(--muted);">Não-bináries</div>
          </div>
        </div>
      </div>

      <div class="panel">
        <h3 class="panel-title">⚡ Ações Rápidas</h3>
        <div style="display:flex;flex-direction:column;gap:10px;margin-top:14px;">
          <button class="btn btn-primary" onclick="switchTab('avisos')">📣 Enviar Aviso Relâmpago para a Pista</button>
          <button class="btn btn-green" onclick="switchTab('vip')">🎟️ Validar Ingresso / VIP na Portaria</button>
          <button class="btn btn-ghost" onclick="switchTab('checkin')">📍 Ver / Imprimir QR Code da Entrada</button>
        </div>
      </div>
    </div>
  `;
}

function switchTab(name) {
  state.tab = name;
  $$('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  renderTab();
}

/* ==================== QR CODE PORTARIA ==================== */
async function renderCheckin() {
  const view = $('#admin-view');
  view.innerHTML = `<div style="text-align:center;padding:40px;"><div class="pulse-dot"></div> Carregando QR Code...</div>`;
  try {
    const data = await api('/checkin-qr');
    const set = state.settings || {};
    view.innerHTML = `
      <div class="panel" style="max-width:680px;margin:0 auto;text-align:center;">
        <h2 style="margin:0 0 8px;">Cartaz de Entrada • Boate Save</h2>
        <p style="color:var(--muted);font-size:14px;">Imprima ou coloque este QR Code na entrada da boate na Rua Gomes Freire 595. O cliente aponta a câmera e entra direto na pista.</p>
        
        <div style="background:#fff;padding:24px;border-radius:24px;display:inline-block;margin:20px 0;box-shadow:0 0 50px rgba(197, 1, 226, 0.4);">
          <img src="${data.qr}" alt="QR Code Save" style="width:280px;height:280px;display:block;" />
          <div style="color:#09040e;font-weight:900;font-size:24px;letter-spacing:0.15em;margin-top:12px;">${esc(set.checkinCode)}</div>
          <div style="color:#666;font-size:11px;font-weight:600;">BOATE SAVE • RUA GOMES FREIRE, 595 - LAPA</div>
        </div>

        <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
          <button class="btn btn-primary" onclick="window.print()">🖨️ Imprimir Cartaz de Entrada</button>
          <button class="btn btn-ghost" id="btn-rotate-code">🔄 Gerar Novo Código de Hoje</button>
        </div>

        <div style="margin-top:24px;padding:16px;background:rgba(255,255,255,0.03);border-radius:12px;text-align:left;">
          <div style="font-weight:700;margin-bottom:6px;">Status da Validação Geográfica (GPS):</div>
          <div style="font-size:13px;color:var(--muted);">
            Validação por GPS: <b style="color:${set.enforceGps ? 'var(--green)' : 'var(--yellow)'}">${set.enforceGps ? 'ATIVADA (exige estar num raio de ' + set.venueRadius + 'm da Save)' : 'DESATIVADA (Modo Teste - qualquer um com o QR entra)'}</b>.
            Pode ser alterada na aba <a href="#" onclick="switchTab('config');return false;">Configurações</a>.
          </div>
        </div>
      </div>
    `;

    $('#btn-rotate-code').onclick = async () => {
      if (!confirm('Deseja gerar um novo código de check-in? Quem já fez check-in continuará ativo, mas novas pessoas precisarão do novo código.')) return;
      await api('/checkin-code/rotate', { method: 'POST' });
      state.settings = (await api('/settings')).settings;
      renderCheckin();
    };
  } catch (err) {
    view.innerHTML = `<div style="color:#ff6b8b;">Erro ao carregar QR: ${err.message}</div>`;
  }
}

/* ==================== PORTARIA & VIP ==================== */
async function loadVip() {
  try {
    const data = await api('/vip');
    state.vip = data.vip;
    renderVipList();
  } catch (err) {
    console.error(err);
  }
}

async function renderVip() {
  const view = $('#admin-view');
  view.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:20px;margin-bottom:24px;">
      <!-- Validador Rápido de Portaria -->
      <div class="panel" style="margin-bottom:0;">
        <h3 class="panel-title">⚡ Validar Código VIP na Portaria</h3>
        <p style="color:var(--muted);font-size:13px;">Digite o código de 8 dígitos ou escaneie com leitor.</p>
        <form id="form-validate" style="display:flex;gap:8px;margin-top:14px;">
          <input type="text" id="val-code" class="input" placeholder="Ex: 8A4F19B2" style="font-weight:800;letter-spacing:0.1em;text-transform:uppercase;flex:1;" required />
          <button type="submit" class="btn btn-green">Validar</button>
        </form>
        <div id="val-result" style="margin-top:14px;"></div>
      </div>

      <!-- Métricas VIP -->
      <div class="panel" style="margin-bottom:0;">
        <h3 class="panel-title">📋 Resumo de Listas</h3>
        <div style="font-size:13px;color:var(--muted);margin-top:10px;">
          Abaixo você pode aprovar, recusar ou confirmar a entrada dos clientes que pediram lista VIP pelo aplicativo SAVE Match.
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <h3 class="panel-title">Solicitações de Lista VIP</h3>
        <button class="btn btn-ghost btn-sm" onclick="loadVip()">🔄 Atualizar</button>
      </div>
      <div class="table-wrap">
        <table id="table-vip">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Evento</th>
              <th>Acompanhantes</th>
              <th>Código</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody id="vip-rows">
            <tr><td colspan="6" style="text-align:center;">Carregando...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  $('#form-validate').onsubmit = async e => {
    e.preventDefault();
    const code = $('#val-code').value.trim();
    const resEl = $('#val-result');
    resEl.innerHTML = '<div style="color:var(--muted);">Verificando código...</div>';
    try {
      const r = await api('/vip-validate', { method: 'POST', body: { code } });
      resEl.innerHTML = `
        <div style="background:rgba(46,248,160,0.15);border:1px solid var(--green);padding:14px;border-radius:10px;">
          <div style="color:var(--green);font-weight:800;font-size:16px;">✅ ENTRADA VIP LIBERADA!</div>
          <div style="margin-top:4px;"><b>${esc(r.user?.name || 'Cliente')}</b> • ${esc(r.event?.title || 'Evento')}</div>
          <div style="font-size:12px;color:var(--muted);margin-top:2px;">Acompanhantes liberados: +${r.vip.guests} pessoa(s)</div>
        </div>
      `;
      $('#val-code').value = '';
      loadVip();
    } catch (err) {
      resEl.innerHTML = `
        <div style="background:rgba(255,90,120,0.15);border:1px solid #ff5a78;padding:14px;border-radius:10px;color:#ff8ca0;">
          <b>❌ ${esc(err.message)}</b>
        </div>
      `;
    }
  };

  loadVip();
}

function renderVipList() {
  const tbody = $('#vip-rows');
  if (!tbody) return;
  if (!state.vip.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:30px;">Nenhum pedido de lista VIP ainda.</td></tr>`;
    return;
  }
  tbody.innerHTML = state.vip.map(v => {
    const statusTag = v.usedAt ? `<span class="tag tag-green">Entrou às ${new Date(v.usedAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</span>` :
      v.status === 'approved' ? `<span class="tag tag-green">Aprovado</span>` :
      v.status === 'rejected' ? `<span class="tag tag-pink">Recusado</span>` :
      `<span class="tag tag-yellow">Aguardando</span>`;
    return `
      <tr>
        <td>
          <b>${esc(v.user?.name || 'Anônimo')}</b>
          <div style="font-size:12px;color:var(--muted);">${esc(v.user?.email || '')}</div>
        </td>
        <td>${esc(state.events.find(e => e.id === v.eventId)?.title || 'Evento')}</td>
        <td>
          +${v.guests}
          ${v.guestNames ? `<div style="font-size:11px;color:var(--muted);">${esc(v.guestNames)}</div>` : ''}
        </td>
        <td><code style="font-weight:800;background:rgba(255,255,255,0.06);padding:3px 6px;border-radius:4px;">${v.code}</code></td>
        <td>${statusTag}</td>
        <td>
          ${v.status === 'pending' ? `
            <button class="btn btn-green btn-sm" onclick="setVipStatus('${v.id}','approved')">Aprovar</button>
            <button class="btn btn-danger btn-sm" onclick="setVipStatus('${v.id}','rejected')">Recusar</button>
          ` : v.status === 'approved' && !v.usedAt ? `
            <button class="btn btn-green btn-sm" onclick="validateVipId('${v.code}')">Liberar Entrada</button>
          ` : '—'}
        </td>
      </tr>
    `;
  }).join('');
}

window.setVipStatus = async (id, status) => {
  await api(`/vip/${id}`, { method: 'POST', body: { status } });
  loadVip();
};
window.validateVipId = async code => {
  $('#val-code').value = code;
  $('#form-validate').dispatchEvent(new Event('submit'));
};

/* ==================== AVISOS NA PISTA ==================== */
async function loadAnnouncements() {
  try {
    const data = await api('/announcements');
    state.announcements = data.announcements;
    renderAvisosList();
  } catch (err) { console.error(err); }
}

async function renderAvisos() {
  const view = $('#admin-view');
  view.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:20px;">
      <div class="panel">
        <h3 class="panel-title">📣 Disparar Notificação Relâmpago</h3>
        <p style="color:var(--muted);font-size:13px;">O aviso chega em tempo real com som/vibração e abre em destaque na tela de quem estiver usando o app.</p>
        <form id="form-ann" style="margin-top:16px;">
          <div class="field">
            <label>Título do Aviso</label>
            <input type="text" id="ann-title" class="input" placeholder="Ex: Open bar de Gin na pista 2 até 01h! 🍸" required maxlength="80" />
          </div>
          <div class="field">
            <label>Mensagem / Detalhes</label>
            <textarea id="ann-body" class="input" rows="3" placeholder="Ex: Apresente o app no balcão e garanta seu drink." maxlength="600"></textarea>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="field">
              <label>Tipo</label>
              <select id="ann-type" class="input">
                <option value="promo">🍹 Promoção / Bar</option>
                <option value="lineup">🎧 Atração / DJ</option>
                <option value="event">🎉 Festa / Evento</option>
                <option value="info">📣 Comunicado Geral</option>
                <option value="alert">⚠️ Aviso Importante</option>
              </select>
            </div>
            <div class="field">
              <label>Público Alvo</label>
              <select id="ann-target" class="input">
                <option value="all">Todos os clientes cadastrados</option>
                <option value="here">Apenas quem está na boate agora</option>
              </select>
            </div>
          </div>
          <button type="submit" class="btn btn-primary" style="width:100%;margin-top:8px;">🚀 Enviar Notificação em Tempo Real</button>
        </form>
      </div>

      <div class="panel">
        <div class="panel-header">
          <h3 class="panel-title">Histórico de Avisos Enviados</h3>
        </div>
        <div id="ann-list" style="display:flex;flex-direction:column;gap:10px;max-height:550px;overflow-y:auto;">
          <div style="text-align:center;color:var(--muted);">Carregando...</div>
        </div>
      </div>
    </div>
  `;

  $('#form-ann').onsubmit = async e => {
    e.preventDefault();
    const title = $('#ann-title').value.trim();
    const body = $('#ann-body').value.trim();
    const type = $('#ann-type').value;
    const onlyHere = $('#ann-target').value === 'here';
    try {
      await api('/announcements', { method: 'POST', body: { title, body, type, onlyHere } });
      $('#ann-title').value = '';
      $('#ann-body').value = '';
      alert('Aviso enviado com sucesso!');
      loadAnnouncements();
    } catch (err) { alert(err.message); }
  };

  loadAnnouncements();
}

function renderAvisosList() {
  const container = $('#ann-list');
  if (!container) return;
  if (!state.announcements.length) {
    container.innerHTML = `<div style="text-align:center;color:var(--muted);padding:20px;">Nenhum aviso enviado ainda.</div>`;
    return;
  }
  container.innerHTML = state.announcements.map(a => `
    <div style="background:rgba(255,255,255,0.03);border:1px solid var(--line);border-radius:12px;padding:14px;display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
      <div>
        <div style="font-weight:700;font-size:15px;">${esc(a.title)}</div>
        <div style="font-size:13px;color:#d5c6e6;margin:4px 0;">${esc(a.body)}</div>
        <div style="font-size:11px;color:var(--muted);">${new Date(a.createdAt).toLocaleString('pt-BR')} ${a.onlyHere ? '• <span style="color:var(--green)">apenas na pista</span>' : '• todos'}</div>
      </div>
      <button class="btn btn-danger btn-sm" onclick="deleteAnnouncement('${a.id}')">Excluir</button>
    </div>
  `).join('');
}

window.deleteAnnouncement = async id => {
  if (!confirm('Excluir este aviso?')) return;
  await api(`/announcements/${id}`, { method: 'DELETE' });
  loadAnnouncements();
};

/* ==================== AGENDA & EVENTOS ==================== */
async function loadEvents() {
  try {
    const data = await api('/events');
    state.events = data.events;
    renderAgendaList();
  } catch (err) { console.error(err); }
}

async function renderAgenda() {
  const view = $('#admin-view');
  view.innerHTML = `
    <div class="panel">
      <div class="panel-header">
        <h3 class="panel-title">🗓️ Gerenciar Programação e Eventos da Save</h3>
        <button class="btn btn-primary btn-sm" onclick="openEventModal()">+ Novo Evento</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Data/Hora</th>
              <th>Título / Subtítulo</th>
              <th>Preço / Lineup</th>
              <th>Confirmados</th>
              <th>Lista VIP</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody id="event-rows">
            <tr><td colspan="6" style="text-align:center;">Carregando...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
  loadEvents();
}

function renderAgendaList() {
  const tbody = $('#event-rows');
  if (!tbody) return;
  if (!state.events.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--muted);">Nenhum evento cadastrado.</td></tr>`;
    return;
  }
  tbody.innerHTML = state.events.map(e => `
    <tr>
      <td>
        <b>${new Date(e.start).toLocaleDateString('pt-BR', { weekday:'short', day:'2-digit', month:'2-digit' })}</b>
        <div style="font-size:12px;color:var(--muted);">${new Date(e.start).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })}</div>
      </td>
      <td>
        <b>${esc(e.title)}</b> ${e.featured ? '<span class="tag tag-yellow">Destaque</span>' : ''}
        <div style="font-size:12px;color:var(--muted);">${esc(e.subtitle || '')}</div>
      </td>
      <td>
        <div>${esc(e.price || 'A consultar')}</div>
        <div style="font-size:11px;color:var(--muted);">${(e.lineup || []).join(' • ')}</div>
      </td>
      <td><span class="tag tag-green">${e.going || 0} confirmados</span></td>
      <td>${e.vipEnabled ? `<span class="tag tag-yellow">Aberta (máx ${e.vipLimit})</span>` : `<span class="tag">Fechada</span>`}</td>
      <td>
        <button class="btn btn-ghost btn-sm" onclick="openEventModal('${e.id}')">Editar</button>
        <button class="btn btn-danger btn-sm" onclick="deleteEvent('${e.id}')">Excluir</button>
      </td>
    </tr>
  `).join('');
}

window.openEventModal = id => {
  const e = state.events.find(x => x.id === id) || {
    title: '', subtitle: '', start: new Date().toISOString().slice(0, 16),
    price: 'R$ 40 lista / R$ 60', description: '', lineup: '',
    vipEnabled: true, vipLimit: 200, featured: false, color: '#c501e2'
  };
  const modal = $('#custom-modal-root');
  modal.innerHTML = `
    <div class="modal-backdrop" onclick="if(event.target===this)this.remove()">
      <div class="modal-card">
        <h3 style="margin-top:0;">${id ? 'Editar Evento' : 'Novo Evento'}</h3>
        <form id="form-save-event">
          <div class="field">
            <label>Título do Evento</label>
            <input type="text" class="input" id="ev-title" value="${esc(e.title)}" required />
          </div>
          <div class="field">
            <label>Subtítulo / Estilo Musical</label>
            <input type="text" class="input" id="ev-sub" value="${esc(e.subtitle)}" placeholder="Ex: Pop • Funk • Hits" />
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="field">
              <label>Data e Hora de Início</label>
              <input type="datetime-local" class="input" id="ev-start" value="${e.start.slice(0, 16)}" required />
            </div>
            <div class="field">
              <label>Cor Neon / Tema</label>
              <input type="color" class="input" id="ev-color" value="${e.color || '#c501e2'}" style="height:42px;padding:2px;" />
            </div>
          </div>
          <div class="field">
            <label>Line-up (DJs e Atrações, separados por vírgula)</label>
            <input type="text" class="input" id="ev-lineup" value="${esc(Array.isArray(e.lineup) ? e.lineup.join(', ') : e.lineup || '')}" />
          </div>
          <div class="field">
            <label>Valores / Ingressos</label>
            <input type="text" class="input" id="ev-price" value="${esc(e.price)}" />
          </div>
          <div class="field">
            <label>Descrição do Evento</label>
            <textarea class="input" id="ev-desc" rows="3">${esc(e.description)}</textarea>
          </div>
          <div style="display:flex;gap:16px;margin:12px 0;">
            <label style="display:flex;align-items:center;gap:6px;font-size:13px;">
              <input type="checkbox" id="ev-vip" ${e.vipEnabled ? 'checked' : ''} /> Habilitar Lista VIP pelo App
            </label>
            <label style="display:flex;align-items:center;gap:6px;font-size:13px;">
              <input type="checkbox" id="ev-feat" ${e.featured ? 'checked' : ''} /> Destaque no topo
            </label>
          </div>
          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">
            <button type="button" class="btn btn-ghost" onclick="this.closest('.modal-backdrop').remove()">Cancelar</button>
            <button type="submit" class="btn btn-primary">Salvar Evento</button>
          </div>
        </form>
      </div>
    </div>
  `;

  $('#form-save-event').onsubmit = async ev => {
    ev.preventDefault();
    const payload = {
      title: $('#ev-title').value.trim(),
      subtitle: $('#ev-sub').value.trim(),
      start: new Date($('#ev-start').value).toISOString(),
      color: $('#ev-color').value,
      lineup: $('#ev-lineup').value.split(',').map(s => s.trim()).filter(Boolean),
      price: $('#ev-price').value.trim(),
      description: $('#ev-desc').value.trim(),
      vipEnabled: $('#ev-vip').checked,
      featured: $('#ev-feat').checked
    };
    if (id) await api(`/events/${id}`, { method: 'PUT', body: payload });
    else await api('/events', { method: 'POST', body: payload });
    modal.innerHTML = '';
    loadEvents();
  };
};

window.deleteEvent = async id => {
  if (!confirm('Tem certeza que deseja excluir este evento?')) return;
  await api(`/events/${id}`, { method: 'DELETE' });
  loadEvents();
};

/* ==================== USUÁRIOS & MODERAÇÃO ==================== */
async function loadUsersAndReports() {
  try {
    const [u, r] = await Promise.all([
      api('/users'),
      api('/reports')
    ]);
    state.users = u.users;
    state.reports = r.reports;
    renderUsuariosTables();
  } catch (err) { console.error(err); }
}

async function renderUsuarios() {
  const view = $('#admin-view');
  view.innerHTML = `
    <!-- Denúncias de Segurança -->
    <div class="panel" style="border-color:rgba(255, 60, 90, 0.4);">
      <div class="panel-header">
        <h3 class="panel-title" style="color:#ff8ca0;">🛡️ Denúncias Recebidas na Boate</h3>
        <button class="btn btn-ghost btn-sm" onclick="loadUsersAndReports()">🔄 Atualizar</button>
      </div>
      <div id="reports-container">
        <div style="color:var(--muted);text-align:center;padding:20px;">Carregando denúncias...</div>
      </div>
    </div>

    <!-- Lista de Usuários e Pista -->
    <div class="panel">
      <div class="panel-header">
        <h3 class="panel-title">👥 Usuários Cadastrados & Presença na Pista</h3>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Usuário</th>
              <th>Status na Save</th>
              <th>Idade / Gênero</th>
              <th>Matches</th>
              <th>Denúncias</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody id="user-rows">
            <tr><td colspan="6" style="text-align:center;">Carregando usuários...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
  loadUsersAndReports();
}

function renderUsuariosTables() {
  // Denúncias
  const repEl = $('#reports-container');
  if (repEl) {
    if (!state.reports.length) {
      repEl.innerHTML = `<div style="text-align:center;color:var(--muted);padding:14px;">Nenhuma denúncia aberta no momento. Ambiente seguro! ✨</div>`;
    } else {
      repEl.innerHTML = state.reports.map(r => `
        <div style="background:rgba(255,255,255,0.03);padding:14px;border-radius:12px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
          <div>
            <div style="color:#ff8ca0;font-weight:700;">Denunciado: ${esc(r.targetUser?.name || 'Desconhecido')} (por ${esc(r.fromUser || 'Anônimo')})</div>
            <div style="margin:4px 0;font-size:14px;">Motivo: <b>${esc(r.reason)}</b></div>
            <div style="font-size:11px;color:var(--muted);">${new Date(r.createdAt).toLocaleString('pt-BR')} • Status: <b>${r.status}</b></div>
          </div>
          <div style="display:flex;gap:6px;">
            ${r.targetUser ? `
              <button class="btn btn-danger btn-sm" onclick="banUser('${r.targetUser.id}', ${!r.targetUser.banned})">${r.targetUser.banned ? 'Desbanir' : '🚫 Banir da Save'}</button>
            ` : ''}
            ${r.status === 'open' ? `
              <button class="btn btn-green btn-sm" onclick="resolveReport('${r.id}')">Resolver</button>
            ` : ''}
          </div>
        </div>
      `).join('');
    }
  }

  // Tabela de usuários
  const uRows = $('#user-rows');
  if (uRows) {
    uRows.innerHTML = state.users.map(u => `
      <tr>
        <td>
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:36px;height:36px;border-radius:50%;background:#333;background-image:url('${esc(u.photo || '/img/icon.svg')}');background-size:cover;background-position:center;"></div>
            <div>
              <b>${esc(u.name)}</b> ${u.isBot ? '<span class="tag tag-blue">Demo Bot</span>' : ''}
              <div style="font-size:11px;color:var(--muted);">${esc(u.email || '')}</div>
            </div>
          </div>
        </td>
        <td>
          ${u.banned ? '<span class="tag tag-pink">Banido</span>' :
            u.here ? '<span class="tag tag-green"><span class="pulse-dot"></span> Na Pista</span>' :
            '<span class="tag">Fora da Boate</span>'}
        </td>
        <td>${u.age} anos • ${u.gender === 'f' ? 'Mulher' : u.gender === 'm' ? 'Homem' : 'Não-binárie'}</td>
        <td>${u.matches || 0}</td>
        <td>${u.reports > 0 ? `<b style="color:#ff8ca0;">${u.reports}</b>` : '0'}</td>
        <td>
          ${u.here ? `<button class="btn btn-ghost btn-sm" onclick="checkoutUser('${u.id}')">Tirar da Pista</button>` : ''}
          ${!u.isBot ? `<button class="btn btn-danger btn-sm" onclick="banUser('${u.id}', ${!u.banned})">${u.banned ? 'Desbanir' : 'Banir'}</button>` : ''}
        </td>
      </tr>
    `).join('');
  }
}

window.checkoutUser = async id => {
  if (!confirm('Deseja retirar este usuário da pista? O check-in dele será encerrado.')) return;
  await api(`/users/${id}/checkout`, { method: 'POST' });
  loadUsersAndReports();
};
window.banUser = async (id, banned) => {
  if (!confirm(banned ? 'Tem certeza que deseja BANIR este usuário? Ele será desconectado e não poderá mais usar o app.' : 'Deseja desbanir?')) return;
  await api(`/users/${id}/ban`, { method: 'POST', body: { banned } });
  loadUsersAndReports();
};
window.resolveReport = async id => {
  await api(`/reports/${id}`, { method: 'POST', body: { status: 'resolved' } });
  loadUsersAndReports();
};

/* ==================== CONFIGURAÇÕES ==================== */
async function renderConfig() {
  const view = $('#admin-view');
  const set = state.settings || {};
  view.innerHTML = `
    <div class="panel" style="max-width:700px;margin:0 auto;">
      <h3 class="panel-title">⚙️ Configurações Gerais da Boate Save</h3>
      <form id="form-config" style="margin-top:20px;">
        <div class="field">
          <label>Nome do Estabelecimento</label>
          <input type="text" class="input" id="cfg-name" value="${esc(set.venueName)}" required />
        </div>
        <div class="field">
          <label>Endereço Oficial</label>
          <input type="text" class="input" id="cfg-address" value="${esc(set.venueAddress)}" required />
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="field">
            <label>Latitude</label>
            <input type="number" step="0.0001" class="input" id="cfg-lat" value="${set.venueLat}" required />
          </div>
          <div class="field">
            <label>Longitude</label>
            <input type="number" step="0.0001" class="input" id="cfg-lng" value="${set.venueLng}" required />
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="field">
            <label>Raio de Tolerância GPS (metros)</label>
            <input type="number" class="input" id="cfg-radius" value="${set.venueRadius}" required />
          </div>
          <div class="field">
            <label>Duração do Check-in (horas)</label>
            <input type="number" class="input" id="cfg-hours" value="${set.checkinHours}" required />
          </div>
        </div>

        <div style="background:rgba(255,255,255,0.03);padding:16px;border-radius:12px;margin:16px 0;">
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
            <input type="checkbox" id="cfg-enforce-gps" ${set.enforceGps ? 'checked' : ''} style="width:18px;height:18px;" />
            <div>
              <b>Exigir GPS estrito na portaria</b>
              <div style="font-size:12px;color:var(--muted);">Se desmarcado, qualquer pessoa que ler o QR Code ou digitar o código entra na pista (ideal para testar em casa). Em noites de festa, ative para garantir que só quem está na Lapa acesse a pista.</div>
            </div>
          </label>
        </div>

        <div style="background:rgba(255,255,255,0.03);padding:16px;border-radius:12px;margin:16px 0;">
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
            <input type="checkbox" id="cfg-bots" ${set.demoBots ? 'checked' : ''} style="width:18px;height:18px;" />
            <div>
              <b>Habilitar Perfis de Demonstração (Bots)</b>
              <div style="font-size:12px;color:var(--muted);">Simula clientes na pista para testar matches, likes e chat em tempo real sem precisar de público real no momento.</div>
            </div>
          </label>
        </div>

        <div class="field">
          <label>Instagram Oficial</label>
          <input type="text" class="input" id="cfg-ig" value="${esc(set.instagram || '')}" />
        </div>
        <div class="field">
          <label>WhatsApp da Boate</label>
          <input type="text" class="input" id="cfg-wa" value="${esc(set.whatsapp || '')}" placeholder="Ex: 5521999999999" />
        </div>
        <div class="field">
          <label>Nova Senha do Painel da Equipe</label>
          <input type="text" class="input" id="cfg-pass" placeholder="Deixe em branco para não alterar" />
        </div>

        <button type="submit" class="btn btn-primary" style="width:100%;margin-top:14px;">Salvar Configurações</button>
      </form>
    </div>
  `;

  $('#form-config').onsubmit = async e => {
    e.preventDefault();
    const payload = {
      venueName: $('#cfg-name').value.trim(),
      venueAddress: $('#cfg-address').value.trim(),
      venueLat: parseFloat($('#cfg-lat').value),
      venueLng: parseFloat($('#cfg-lng').value),
      venueRadius: parseInt($('#cfg-radius').value),
      checkinHours: parseInt($('#cfg-hours').value),
      enforceGps: $('#cfg-enforce-gps').checked,
      demoBots: $('#cfg-bots').checked,
      instagram: $('#cfg-ig').value.trim(),
      whatsapp: $('#cfg-wa').value.trim()
    };
    const newPass = $('#cfg-pass').value.trim();
    if (newPass) payload.adminPassword = newPass;

    try {
      const res = await api('/settings', { method: 'PUT', body: payload });
      state.settings = res.settings;
      alert('Configurações atualizadas com sucesso!');
      renderConfig();
    } catch (err) { alert(err.message); }
  };
}

// Início
(async () => {
  if (!state.token) {
    showLogin();
  } else {
    initSocket();
    await loadAll();
  }
})();
