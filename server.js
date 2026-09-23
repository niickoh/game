#!/usr/bin/env node
'use strict';

/*
 * The Game Online - servidor de red local.
 * Sin dependencias: solo Node. Estado en memoria, sin base de datos.
 *
 *   node server.js            -> puerto 8080
 *   node server.js 3000       -> puerto 3000
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || process.argv[2] || 8080);
const PUBLIC_DIR = path.join(__dirname, 'public');

const HAND_SIZE = 6;
const MAX_PLAYERS = 10;
const MIN_CARD = 2;
const MAX_CARD = 99;
const TOTAL_CARDS = MAX_CARD - MIN_CARD + 1; // 98

const MAX_CHAT = 120;        // mensajes guardados por sala
const CHAT_VISIBLE = 60;     // cuántos viajan al cliente
const MAX_LOG = 160;
const LOG_VISIBLE = 60;
const CHAT_MAX_LARGO = 240;
const CHAT_MIN_MS = 400;     // anti-spam por jugador
// efectos de sonido que un mensaje puede traer (lista cerrada: llega del cliente)
const EFECTOS_CHAT = ['bum', 'aplausos', 'uh', 'tada'];
const VOZ_MAX = 90;          // no se lee en voz alta nada más largo que esto
const PIN_INTENTOS = 8;      // intentos antes de bloquear una IP
const PIN_BLOQUEO_MS = 60000;
const AVISO_MIN_MS = 1500;

/* ------------------------------------------------------------------ salas */

const rooms = new Map();

function roomCode(raw) {
  const code = String(raw || 'MESA').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  return code || 'MESA';
}

function getRoom(raw) {
  const code = roomCode(raw);
  if (!rooms.has(code)) {
    rooms.set(code, {
      code,
      players: [],        // { id, token, name, hand:[], online:0, ultimoChat:0, ultimoAviso:0 }
      clients: new Set(), // respuestas SSE abiertas
      game: null,
      adminId: null,      // manda la sala: reparte, reinicia y puede sacar gente
      pin: null,          // si la sala tiene PIN, hay que darlo para entrar
      intentos: new Map(),// IP -> intentos fallidos de PIN
      chat: [],
      log: [],
      seq: 0,
      lastSeen: Date.now()
    });
  }
  const room = rooms.get(code);
  room.lastSeen = Date.now();
  return room;
}

const findPlayer = (room, id) => room.players.find(p => p.id === id) || null;

function auth(room, id, token) {
  const p = findPlayer(room, id);
  return p && token && p.token === token ? p : null;
}

const esAdmin = (room, player) => !!player && room.adminId === player.id;

/* ------------------------------------------------------------------- PIN */

function limpiarPin(raw) {
  return String(raw || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase();
}

function ipDe(req) {
  return String(req.socket.remoteAddress || '').replace(/^::ffff:/, '');
}

function pinBloqueado(room, ip) {
  const e = room.intentos.get(ip);
  return !!(e && e.hasta > Date.now());
}

function pinFallo(room, ip) {
  const e = room.intentos.get(ip) || { n: 0, hasta: 0 };
  e.n++;
  if (e.n >= PIN_INTENTOS) { e.hasta = Date.now() + PIN_BLOQUEO_MS; e.n = 0; }
  room.intentos.set(ip, e);
}

// El primero que llega manda; si se va, hereda el siguiente conectado.
function asegurarAdmin(room) {
  if (room.adminId && findPlayer(room, room.adminId)) return;
  const heredero = room.players.find(p => p.online > 0) || room.players[0];
  room.adminId = heredero ? heredero.id : null;
  if (heredero) sistema(room, heredero.name + ' quedó a cargo de la sala');
}

/* --------------------------------------------------------- chat e historial */

function pushChat(room, entrada) {
  entrada.id = ++room.seq;
  entrada.t = Date.now();
  room.chat.push(entrada);
  if (room.chat.length > MAX_CHAT) room.chat.splice(0, room.chat.length - MAX_CHAT);
  return entrada;
}

function pushLog(room, entrada) {
  entrada.id = ++room.seq;
  entrada.t = Date.now();
  room.log.push(entrada);
  if (room.log.length > MAX_LOG) room.log.splice(0, room.log.length - MAX_LOG);
  return entrada;
}

const sistema = (room, texto) => pushChat(room, { tipo: 'sistema', texto });

/* ------------------------------------------------------------- reglas */

function newDeck() {
  const d = [];
  for (let n = MIN_CARD; n <= MAX_CARD; n++) d.push(n);
  for (let i = d.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

const topOf = pile => pile.cards[pile.cards.length - 1];

const isJump = (card, pile) =>
  pile.dir === 'up' ? card === topOf(pile) - 10 : card === topOf(pile) + 10;

function canPlay(card, pile) {
  if (pile.dir === 'up') return card > topOf(pile) || card === topOf(pile) - 10;
  return card < topOf(pile) || card === topOf(pile) + 10;
}

const minPlay = game => (game.deck.length > 0 ? 2 : 1);

function seatedPlayers(room) {
  if (!room.game) return [];
  return room.game.seats.map(id => findPlayer(room, id)).filter(Boolean);
}

function turnPlayer(room) {
  const g = room.game;
  if (!g) return null;
  return findPlayer(room, g.seats[g.current]);
}

function cardsLeft(room) {
  const g = room.game;
  if (!g) return TOTAL_CARDS;
  return seatedPlayers(room).reduce((n, p) => n + p.hand.length, g.deck.length);
}

function hasMove(room, player) {
  if (!player || !room.game) return false;
  return player.hand.some(c => room.game.piles.some(p => canPlay(c, p)));
}

// Si el asiento del turno quedó sin jugador (alguien fue expulsado), avanza al siguiente válido.
function asientoValido(room) {
  const g = room.game;
  if (!g || !g.seats.length) return;
  for (let i = 0; i < g.seats.length; i++) {
    if (findPlayer(room, g.seats[g.current])) return;
    g.current = (g.current + 1) % g.seats.length;
  }
}

function startGame(room) {
  const seats = room.players.slice(0, MAX_PLAYERS).map(p => p.id);
  if (!seats.length) return;

  const deck = newDeck();
  room.players.forEach(p => { p.hand = []; });

  for (let k = 0; k < HAND_SIZE; k++) {
    for (const id of seats) {
      const p = findPlayer(room, id);
      if (p && deck.length) p.hand.push(deck.pop());
    }
  }
  seats.forEach(id => {
    const p = findPlayer(room, id);
    if (p) p.hand.sort((a, b) => a - b);
  });

  room.game = {
    seats,
    deck,
    piles: [
      { dir: 'up', cards: [1] },
      { dir: 'up', cards: [1] },
      { dir: 'down', cards: [100] },
      { dir: 'down', cards: [100] }
    ],
    current: 0,
    turn: [],          // [{ card, pile }] jugadas del turno en curso
    phase: 'play',
    over: null
  };
}

// Se pierde apenas quien tiene el turno no puede cumplir el mínimo.
function checkLoss(room) {
  const g = room.game;
  if (!g || g.phase !== 'play') return false;
  if (g.turn.length >= minPlay(g)) return false;
  if (hasMove(room, turnPlayer(room))) return false;
  endGame(room, false);
  return true;
}

function endGame(room, won) {
  const g = room.game;
  let left = g.deck.slice();
  seatedPlayers(room).forEach(p => { left = left.concat(p.hand); });
  left.sort((a, b) => a - b);
  g.over = { won, left, placed: TOTAL_CARDS - left.length };
  g.phase = 'over';
  pushLog(room, { tipo: 'fin', won, fuera: left.length, colocadas: g.over.placed });
  sistema(room, won
    ? 'Partida perfecta: las 98 cartas colocadas'
    : 'Fin de la partida: quedaron ' + left.length + ' cartas fuera');
}

/* ------------------------------------------------------------ acciones */

const actions = {
  start(room, player) {
    if (!esAdmin(room, player)) return;
    if (room.game && room.game.phase === 'play') return;
    startGame(room);
    if (!room.game) return;
    room.log.length = 0;
    pushLog(room, { tipo: 'inicio', jugador: player.name, jugadores: room.game.seats.length });
    sistema(room, player.name + ' repartió. Cada uno con ' + HAND_SIZE + ' cartas');
    checkLoss(room);
  },

  play(room, player, data) {
    const g = room.game;
    if (!g || g.phase !== 'play') return;
    if (turnPlayer(room) !== player) return;

    const pileIdx = Number(data.pile);
    const card = Number(data.card);
    const pile = g.piles[pileIdx];
    const handIdx = player.hand.indexOf(card);
    if (!pile || handIdx === -1 || !canPlay(card, pile)) return;

    const desde = topOf(pile);
    const salto = isJump(card, pile);

    player.hand.splice(handIdx, 1);
    pile.cards.push(card);
    g.turn.push({ card, pile: pileIdx });

    pushLog(room, {
      tipo: 'jugada',
      jugador: player.name,
      carta: card,
      pila: pileIdx,
      dir: pile.dir,
      desde,
      salto,
      distancia: pile.dir === 'up' ? card - desde : desde - card
    });

    checkLoss(room);
  },

  undo(room, player) {
    const g = room.game;
    if (!g || g.phase !== 'play') return;
    if (turnPlayer(room) !== player || !g.turn.length) return;

    const last = g.turn.pop();
    g.piles[last.pile].cards.pop();
    player.hand.push(last.card);
    player.hand.sort((a, b) => a - b);
    pushLog(room, { tipo: 'deshacer', jugador: player.name, carta: last.card, pila: last.pile });
  },

  end(room, player) {
    const g = room.game;
    if (!g || g.phase !== 'play') return;
    if (turnPlayer(room) !== player) return;
    if (g.turn.length < minPlay(g)) return;

    const jugadas = g.turn.length;
    let robadas = 0;
    while (player.hand.length < HAND_SIZE && g.deck.length) { player.hand.push(g.deck.pop()); robadas++; }
    player.hand.sort((a, b) => a - b);

    if (cardsLeft(room) === 0) { endGame(room, true); return; }

    g.current = (g.current + 1) % g.seats.length;
    asientoValido(room);
    g.turn = [];

    const siguiente = turnPlayer(room);
    pushLog(room, {
      tipo: 'turno',
      jugador: player.name,
      jugadas,
      robadas,
      siguiente: siguiente ? siguiente.name : null,
      mazo: g.deck.length
    });
    checkLoss(room);
  },

  // Aviso puntual: avisa a todos y se va solo. No bloquea ni marca la pila.
  aviso(room, player, data) {
    const idx = Number(data.pile);
    if (!(idx >= 0 && idx < 4)) return;
    const ahora = Date.now();
    if (ahora - (player.ultimoAviso || 0) < AVISO_MIN_MS) return;
    player.ultimoAviso = ahora;

    const pila = room.game ? room.game.piles[idx] : null;
    pushChat(room, {
      tipo: 'aviso',
      autor: player.id,
      nombre: player.name,
      pila: idx,
      dir: pila ? pila.dir : (idx < 2 ? 'up' : 'down'),
      texto: 'pide no jugar en esta pila'
    });
    pushLog(room, { tipo: 'aviso', jugador: player.name, pila: idx });
  },

  chat(room, player, data) {
    const ahora = Date.now();
    if (ahora - (player.ultimoChat || 0) < CHAT_MIN_MS) return;
    const texto = String(data.texto || '')
      .replace(/[ --]/g, '')
      .trim()
      .slice(0, CHAT_MAX_LARGO);
    if (!texto) return;
    player.ultimoChat = ahora;

    const efecto = EFECTOS_CHAT.includes(String(data.efecto || '')) ? String(data.efecto) : null;
    const hablar = data.hablar === true && texto.length <= VOZ_MAX;
    const voz = hablar ? String(data.voz || texto).slice(0, VOZ_MAX) : null;

    pushChat(room, {
      tipo: 'texto', autor: player.id, nombre: player.name,
      texto, efecto, voz
    });
  },

  reset(room, player) {
    if (!esAdmin(room, player)) return;
    room.game = null;
    room.players.forEach(p => { p.hand = []; });
    pushLog(room, { tipo: 'reinicio', jugador: player.name });
    sistema(room, player.name + ' reinició la sala');
  },

  kick(room, player, data) {
    if (!esAdmin(room, player)) return;
    const objetivo = findPlayer(room, String(data.id || ''));
    if (!objetivo || objetivo.id === player.id) return;
    room.players = room.players.filter(p => p.id !== objetivo.id);
    sistema(room, player.name + ' sacó a ' + objetivo.name + ' de la sala');
    if (room.game) { asientoValido(room); checkLoss(room); }
    asegurarAdmin(room);
  },

  admin(room, player, data) {
    if (!esAdmin(room, player)) return;
    const objetivo = findPlayer(room, String(data.id || ''));
    if (!objetivo) return;
    room.adminId = objetivo.id;
    sistema(room, objetivo.name + ' quedó a cargo de la sala');
  },

  pin(room, player, data) {
    if (!esAdmin(room, player)) return;
    const nuevo = limpiarPin(data.pin) || null;
    if (nuevo === room.pin) return;
    room.pin = nuevo;
    room.intentos.clear();
    sistema(room, nuevo
      ? player.name + ' le puso PIN a la sala'
      : player.name + ' le quitó el PIN a la sala');
  },

  rename(room, player, data) {
    const name = cleanName(data.name);
    if (!name || name === player.name) return;
    sistema(room, player.name + ' ahora se llama ' + name);
    player.name = name;
  },

  leave(room, player) {
    const g = room.game;
    const sentado = g && g.seats.includes(player.id);
    if (g && g.phase === 'play' && sentado) return; // no se abandona a mitad de partida
    room.players = room.players.filter(p => p.id !== player.id);
    sistema(room, player.name + ' salió de la sala');
    asegurarAdmin(room);
  }
};

/* ------------------------------------------------- vista por jugador */

function view(room, pid) {
  const me = findPlayer(room, pid);
  const g = room.game;
  const turnP = turnPlayer(room);

  const base = {
    room: room.code,
    you: me ? { id: me.id, name: me.name } : null,
    admin: room.adminId,
    soyAdmin: !!me && room.adminId === me.id,
    pin: room.pin,
    phase: g ? g.phase : 'lobby',
    handSize: HAND_SIZE,
    maxPlayers: MAX_PLAYERS,
    chat: room.chat.slice(-CHAT_VISIBLE),
    log: room.log.slice(-LOG_VISIBLE),
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      cards: p.hand.length,
      online: p.online > 0,
      admin: p.id === room.adminId,
      seated: !g || g.seats.includes(p.id),
      turn: !!(turnP && turnP.id === p.id)
    }))
  };

  if (!g) {
    return Object.assign(base, {
      piles: [
        { dir: 'up', top: 1, count: 0 },
        { dir: 'up', top: 1, count: 0 },
        { dir: 'down', top: 100, count: 0 },
        { dir: 'down', top: 100, count: 0 }
      ],
      deck: 0, left: TOTAL_CARDS, placed: 0,
      hand: [], turn: [], min: 2,
      yourTurn: false, turnName: null, over: null
    });
  }

  return Object.assign(base, {
    piles: g.piles.map(p => ({ dir: p.dir, top: topOf(p), count: p.cards.length - 1 })),
    deck: g.deck.length,
    left: cardsLeft(room),
    placed: TOTAL_CARDS - cardsLeft(room),
    hand: me ? me.hand.slice() : [],   // solo la mano propia sale del servidor
    turn: g.turn.slice(),
    min: minPlay(g),
    yourTurn: !!(me && turnP && turnP.id === me.id && g.phase === 'play'),
    turnName: turnP ? turnP.name : null,
    over: g.over
  });
}

function broadcast(room) {
  for (const client of room.clients) {
    try {
      client.res.write('data: ' + JSON.stringify(view(room, client.pid)) + '\n\n');
    } catch (e) { /* la conexión se limpia sola en 'close' */ }
  }
}

/* ------------------------------------------------------------ utilidades */

function cleanName(raw) {
  return String(raw || '').replace(/[ -<>]/g, '').trim().slice(0, 18);
}

function sendJSON(res, code, obj) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 1e5) { req.destroy(); reject(new Error('body demasiado grande')); }
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon'
};

function serveStatic(req, res, urlPath) {
  const rel = urlPath === '/' ? 'index.html' : decodeURIComponent(urlPath).replace(/^\/+/, '');
  const file = path.join(PUBLIC_DIR, path.normalize(rel));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403).end('403'); return; }

  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('No encontrado'); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(buf);
  });
}

/* --------------------------------------------------------------- rutas */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  const route = url.pathname;

  if (route === '/api/join' && req.method === 'POST') {
    let body;
    try { body = await readBody(req); } catch (e) { return sendJSON(res, 400, { error: 'json inválido' }); }

    const room = getRoom(body.room);
    const existing = body.id && body.token ? auth(room, body.id, body.token) : null;

    if (existing) {
      const name = cleanName(body.name);
      if (name) existing.name = name;
      asegurarAdmin(room);
      broadcast(room);
      return sendJSON(res, 200, { id: existing.id, token: existing.token, room: room.code });
    }

    if (room.players.length >= MAX_PLAYERS) {
      return sendJSON(res, 409, { error: 'La sala está llena (' + MAX_PLAYERS + ' jugadores).' });
    }

    // Sala nueva: quien llega primero define el PIN (puede dejarlo vacío).
    // Sala con PIN: hay que darlo, con freno para que nadie lo adivine a la fuerza.
    const ip = ipDe(req);
    if (!room.players.length && !room.pin) {
      room.pin = limpiarPin(body.pin) || null;
    } else if (room.pin) {
      if (pinBloqueado(room, ip)) {
        return sendJSON(res, 429, { error: 'Demasiados intentos. Espera un minuto.', pin: true });
      }
      if (limpiarPin(body.pin) !== room.pin) {
        pinFallo(room, ip);
        return sendJSON(res, 403, { error: 'PIN incorrecto.', pin: true });
      }
      room.intentos.delete(ip);
    }

    const player = {
      id: crypto.randomUUID(),
      token: crypto.randomBytes(16).toString('hex'),
      name: cleanName(body.name) || ('Jugador ' + (room.players.length + 1)),
      hand: [],
      online: 0,
      ultimoChat: 0,
      ultimoAviso: 0
    };
    room.players.push(player);
    if (!room.adminId) room.adminId = player.id;
    sistema(room, player.name + ' entró a la sala');
    broadcast(room);
    return sendJSON(res, 200, { id: player.id, token: player.token, room: room.code });
  }

  if (route === '/api/action' && req.method === 'POST') {
    let body;
    try { body = await readBody(req); } catch (e) { return sendJSON(res, 400, { error: 'json inválido' }); }

    const room = getRoom(body.room);
    const player = auth(room, body.id, body.token);
    if (!player) return sendJSON(res, 401, { error: 'sesión no válida' });

    const fn = Object.prototype.hasOwnProperty.call(actions, body.type) ? actions[body.type] : null;
    if (!fn) return sendJSON(res, 400, { error: 'acción desconocida' });

    fn(room, player, body.data && typeof body.data === 'object' ? body.data : {});
    broadcast(room);
    return sendJSON(res, 200, { ok: true });
  }

  if (route === '/api/events' && req.method === 'GET') {
    const room = getRoom(url.searchParams.get('room'));
    const player = auth(room, url.searchParams.get('id'), url.searchParams.get('token'));
    if (!player) return sendJSON(res, 401, { error: 'sesión no válida' });

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.write('retry: 2000\n\n');

    const client = { res, pid: player.id };
    room.clients.add(client);
    player.online++;
    asegurarAdmin(room);
    broadcast(room);

    const beat = setInterval(() => {
      try { res.write(': latido\n\n'); } catch (e) { /* ignora */ }
    }, 25000);

    req.on('close', () => {
      clearInterval(beat);
      room.clients.delete(client);
      player.online = Math.max(0, player.online - 1);
      // En el lobby, quien cierra la pestaña deja de ocupar un puesto.
      if (player.online === 0 && !room.game) {
        setTimeout(() => {
          if (player.online === 0 && !room.game && findPlayer(room, player.id)) {
            room.players = room.players.filter(p => p.id !== player.id);
            sistema(room, player.name + ' salió de la sala');
            asegurarAdmin(room);
            broadcast(room);
          }
        }, 20000);
      }
      broadcast(room);
    });
    return;
  }

  if (route === '/api/sesion' && req.method === 'POST') {
    let body;
    try { body = await readBody(req); } catch (e) { return sendJSON(res, 400, { error: 'json inválido' }); }
    const room = getRoom(body.room);
    const player = auth(room, body.id, body.token);
    if (!player) return sendJSON(res, 401, { error: 'sesión no válida' });
    return sendJSON(res, 200, { ok: true, name: player.name });
  }

  // ¿existe la sala y pide PIN? No la crea: solo mira.
  if (route === '/api/sala' && req.method === 'GET') {
    const code = roomCode(url.searchParams.get('room'));
    const room = rooms.get(code);
    return sendJSON(res, 200, {
      room: code,
      existe: !!(room && room.players.length),
      conPin: !!(room && room.pin),
      jugadores: room ? room.players.length : 0,
      enJuego: !!(room && room.game && room.game.phase === 'play')
    });
  }

  if (route === '/api/salud') return sendJSON(res, 200, { ok: true, salas: rooms.size });

  if (req.method !== 'GET') { res.writeHead(405).end('405'); return; }
  serveStatic(req, res, route);
});

/* ------------------------------------------------------------ arranque */

function lanAddresses() {
  const out = [];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) out.push({ name, address: net.address });
    }
  }
  return out;
}

server.listen(PORT, '0.0.0.0', () => {
  const lines = [
    '',
    '  The Game Online  ·  servidor listo',
    '  ----------------------------------------',
    '  En este equipo:   http://localhost:' + PORT
  ];
  const lan = lanAddresses();
  if (lan.length) {
    lines.push('');
    lines.push('  Comparte esta URL con tus compañeros:');
    lan.forEach(n => lines.push('    http://' + n.address + ':' + PORT + '   (' + n.name + ')'));
  } else {
    lines.push('  (No se detectó red local activa)');
  }
  lines.push('');
  lines.push('  El primero que entra a una sala queda como administrador.');
  lines.push('  Si Windows pregunta por el firewall, permite el acceso en redes privadas.');
  lines.push('  Ctrl+C para detener.');
  lines.push('');
  console.log(lines.join('\n'));
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error('\n  El puerto ' + PORT + ' ya está ocupado. Prueba:  node server.js 3000\n');
  } else {
    console.error(err);
  }
  process.exit(1);
});

// Limpia salas vacías cada 10 minutos.
setInterval(() => {
  const ahora = Date.now();
  for (const [code, room] of rooms) {
    if (!room.clients.size && !room.players.length && ahora - room.lastSeen > 30 * 60 * 1000) {
      rooms.delete(code);
    }
  }
}, 10 * 60 * 1000).unref();
