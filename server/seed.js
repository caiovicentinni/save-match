// Dados iniciais: configurações, eventos de exemplo e perfis DEMO (bots)
// Os bots servem apenas para testar o app sem público real. Desative em Admin > Configurações.
const crypto = require('crypto');
const { db, save } = require('./db');

const id = () => crypto.randomBytes(8).toString('hex');

const DEFAULT_SETTINGS = {
  venueName: 'Boate Save',
  venueAddress: 'Rua Gomes Freire, 595 - Lapa, Rio de Janeiro - RJ',
  venueLat: -22.9118,
  venueLng: -43.1836,
  venueRadius: 150,            // metros
  enforceGps: false,           // em produção: true (no modo teste fica desligado para testar de casa)
  checkinCode: 'SAVE' + Math.floor(1000 + Math.random() * 9000),
  checkinHours: 8,             // validade do check-in
  adminPassword: 'save2026',   // TROQUE em Admin > Configurações
  demoBots: true,
  instagram: 'https://instagram.com/',
  whatsapp: ''
};

const BOTS = [
  ['Juliana', 'f', 'm', 24, 'Carioca da gema, viciada em funk e pista cheia 💃', 'women/44'],
  ['Rafa', 'm', 'f', 27, 'DJ nas horas vagas. Me chama pra dançar 🎧', 'men/32'],
  ['Camila', 'f', 'all', 26, 'Lapa é minha segunda casa. Drinks? 🍹', 'women/68'],
  ['Bruno', 'm', 'all', 29, 'Fotógrafo, sorriso fácil e passinho duvidoso', 'men/75'],
  ['Larissa', 'f', 'f', 23, 'Só vim pela música... e talvez por você 😏', 'women/21'],
  ['Thiago', 'm', 'm', 25, 'Pop, eletrônico e muito glitter ✨', 'men/46'],
  ['Bia', 'f', 'm', 22, 'Estudante de design. Me pague um gin 😅', 'women/12'],
  ['Lucas', 'm', 'f', 30, 'Engenheiro de dia, dançarino de madrugada', 'men/11'],
  ['Mari', 'f', 'all', 28, 'Signo? Pergunta na pista 🔮', 'women/90'],
  ['Pedro', 'm', 'all', 24, 'Novo no Rio, me mostra a Lapa?', 'men/64'],
  ['Nanda', 'f', 'm', 27, 'Rindo alto perto do bar 🍸', 'women/33'],
  ['Gabi', 'nb', 'all', 25, 'Arte, techno e boas conversas 🖤', 'women/57']
];

function nextWeekday(dow, hour, addWeeks = 0) {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  let diff = (dow - d.getDay() + 7) % 7;
  if (diff === 0 && Date.now() > d.getTime() + 6 * 3600e3) diff = 7;
  d.setDate(d.getDate() + diff + addWeeks * 7);
  return d;
}
const plusHours = (d, h) => new Date(d.getTime() + h * 3600e3);

function seedEvents() {
  const evs = [
    { title: 'SAVE FRIDAY', subtitle: 'Pop • Funk • Hits', d: nextWeekday(5, 23), color: '#c501e2',
      lineup: ['DJ Lia Neon', 'MC Lapa', 'Residentes SAVE'], price: 'R$ 40 (lista até 0h) / R$ 60',
      description: 'A sexta mais animada da Lapa. Open bar de vodka até 00h30 para quem estiver na lista VIP pelo app.' },
    { title: 'SATURDAY NIGHT SAVE', subtitle: 'Eletrônico • House', d: nextWeekday(6, 23), color: '#35ACE8',
      lineup: ['Kiko Beats', 'Marina V', 'B2B Residentes'], price: 'R$ 50 / R$ 80 (camarote)',
      description: 'Sábado de pista cheia com house e eletrônico até o sol nascer.' },
    { title: 'BAILE DA SAVE', subtitle: 'Funk 150 BPM', d: nextWeekday(5, 23, 1), color: '#f82d97',
      lineup: ['DJ Thai', 'MC Convidado Surpresa'], price: 'R$ 40 / R$ 60',
      description: 'O baile mais quente do Centro. Vista seu melhor look neon!' },
    { title: 'NEON PARTY', subtitle: 'Festa temática • Glow', d: nextWeekday(6, 23, 1), color: '#2ef8a0',
      lineup: ['DJ Glow', 'Lia Neon', 'Performances'], price: 'R$ 60 / R$ 90',
      description: 'Pinturas neon, pulseiras de LED e muito brilho. Use branco ou neon!' },
    { title: 'SAVE ANIVERSARIANTES', subtitle: 'Aniversariantes do mês', d: nextWeekday(5, 23, 2), color: '#E8B432',
      lineup: ['Residentes SAVE'], price: 'Aniversariante free + 5 amigos na lista',
      description: 'Aniversariante do mês entra free e ganha espumante. Peça sua lista VIP pelo app.' }
  ];
  return evs.map((e, i) => ({
    id: id(), title: e.title, subtitle: e.subtitle, start: e.d.toISOString(),
    end: plusHours(e.d, 6).toISOString(), color: e.color, lineup: e.lineup, price: e.price,
    description: e.description, flyer: null, ticketUrl: '', vipEnabled: true, vipLimit: 200,
    featured: i === 0, createdAt: new Date().toISOString()
  }));
}

function ensureSeed() {
  db.settings = Object.assign({}, DEFAULT_SETTINGS, db.settings);

  if (!db.events.length) db.events = seedEvents();

  if (!db.announcements.length) {
    db.announcements.push(
      { id: id(), type: 'promo', title: 'Bem-vindo ao SAVE Match! 💜',
        body: 'Faça check-in na entrada da boate e descubra quem está na pista agora mesmo.',
        createdAt: new Date().toISOString() },
      { id: id(), type: 'event', title: 'Lista VIP liberada',
        body: 'Coloque seu nome na lista dos próximos eventos direto na aba Agenda.',
        createdAt: new Date(Date.now() - 3600e3).toISOString() }
    );
  }

  if (!db.users.some(u => u.isBot)) {
    BOTS.forEach(([name, gender, interestedIn, age, bio, pic]) => {
      const birth = new Date(); birth.setFullYear(birth.getFullYear() - age); birth.setMonth(birth.getMonth() - 2);
      db.users.push({
        id: id(), isBot: true, name, email: `${name.toLowerCase()}@demo.save`, pass: null,
        birthdate: birth.toISOString().slice(0, 10), gender, interestedIn, bio,
        instagram: '@' + name.toLowerCase() + '.save',
        photos: [`https://randomuser.me/api/portraits/${pic}.jpg`],
        createdAt: new Date().toISOString(), banned: false
      });
    });
  }
  save();
}

module.exports = { ensureSeed, DEFAULT_SETTINGS, id };
