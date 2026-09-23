#!/usr/bin/env node
'use strict';

/*
 * Publica el juego en internet con un túnel de Cloudflare, para que entre
 * alguien que no está en la red de la oficina.
 *
 *   node publicar.js            -> puerto 8080
 *   node publicar.js 3000       -> puerto 3000
 *   node publicar.js OFICINA    -> arma el enlace apuntando a esa sala
 *
 * Levanta el servidor si no está corriendo, abre el túnel, copia la dirección
 * al portapapeles y la deja escrita en URL-PARA-COMPARTIR.txt.
 * Al cerrar esta ventana la dirección deja de existir.
 */

const { spawn, spawnSync } = require('child_process');
const net = require('net');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const CF_ID = 'Cloudflare.cloudflared';
const ARCHIVO = path.join(__dirname, 'URL-PARA-COMPARTIR.txt');

// El argumento puede ser el puerto (número) o el nombre de la sala (texto).
const ARG = String(process.argv[2] || '').trim();
const PORT = Number(process.env.PORT || (/^\d+$/.test(ARG) ? ARG : 0)) || 8080;
const SALA = /^\d+$/.test(ARG) ? '' : ARG.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);

let servidor = null;
let tunel = null;
let urlPublica = null;
let cf = process.env.CF_BIN || 'cloudflared';

/* ------------------------------------------------------------ utilidades */

function linea(txt) { process.stdout.write(txt + '\n'); }

function puertoOcupado(port) {
  return new Promise(resolve => {
    const s = net.connect({ host: '127.0.0.1', port }, () => { s.destroy(); resolve(true); });
    s.on('error', () => resolve(false));
    s.setTimeout(1200, () => { s.destroy(); resolve(false); });
  });
}

function corre(bin) {
  const r = spawnSync(bin, ['--version'], { encoding: 'utf8' });
  return !r.error && r.status === 0;
}

/*
 * Busca cloudflared de verdad. Después de instalarlo con winget, el PATH de
 * ESTE proceso sigue siendo el viejo (Windows solo se lo entrega a las ventanas
 * que se abren después), así que además del PATH hay que mirar dónde queda
 * instalado y releer el PATH desde el registro.
 */
function buscarCloudflared() {
  if (process.env.CF_BIN && corre(process.env.CF_BIN)) return process.env.CF_BIN;
  if (corre('cloudflared')) return 'cloudflared';

  const candidatos = [
    'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
    'C:\\Program Files\\cloudflared\\cloudflared.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft\\WinGet\\Links\\cloudflared.exe')
  ];

  // el PATH fresco, tal como quedó en el registro tras instalar
  try {
    const ps = spawnSync('powershell', ['-NoProfile', '-Command',
      "[Environment]::GetEnvironmentVariable('Path','Machine') + ';' + " +
      "[Environment]::GetEnvironmentVariable('Path','User')"
    ], { encoding: 'utf8' });
    if (ps.stdout) {
      ps.stdout.split(';').forEach(d => {
        d = d.trim();
        if (d) candidatos.push(path.join(d, 'cloudflared.exe'));
      });
    }
  } catch (e) { /* si falla, quedan los candidatos fijos */ }

  for (const c of candidatos) {
    try { if (c && fs.existsSync(c) && corre(c)) return c; } catch (e) {}
  }
  return null;
}

function preguntar(txt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(txt, r => { rl.close(); resolve(r.trim().toLowerCase()); }));
}

function marco(lineas) {
  const ancho = Math.max(...lineas.map(l => l.length)) + 4;
  linea('');
  linea('  ╔' + '═'.repeat(ancho) + '╗');
  lineas.forEach(l => linea('  ║  ' + l + ' '.repeat(Math.max(0, ancho - l.length - 2)) + '║'));
  linea('  ╚' + '═'.repeat(ancho) + '╝');
  linea('');
}

// saca la dirección pública de lo que va escupiendo cloudflared
function urlDe(txt) {
  const m = String(txt).match(/https:\/\/[a-z0-9][a-z0-9-]*\.trycloudflare\.com/i);
  return m ? m[0] : null;
}

function alPortapapeles(texto) {
  return new Promise(resolve => {
    try {
      const c = spawn('clip');
      c.on('error', () => resolve(false));
      c.on('close', code => resolve(code === 0));
      c.stdin.end(texto, 'utf8');
    } catch (e) { resolve(false); }
  });
}

function guardarArchivo(url) {
  try {
    fs.writeFileSync(ARCHIVO,
      'The Game Online\r\n' +
      '===============\r\n\r\n' +
      url + '\r\n\r\n' +
      'Abierta el ' + new Date().toLocaleString('es-CL') + '.\r\n' +
      'Deja de funcionar apenas cierres la ventana negra del tunel.\r\n' +
      (SALA ? 'Sala: ' + SALA + '\r\n' : '') +
      'Acuerdate de pasarle tambien el PIN de la sala.\r\n', 'utf8');
    return true;
  } catch (e) { return false; }
}

/* ------------------------------------------------------------ pasos */

async function asegurarServidor() {
  if (await puertoOcupado(PORT)) {
    linea('  El servidor ya estaba corriendo en el puerto ' + PORT + '.');
    return;
  }
  linea('  Levantando el servidor en el puerto ' + PORT + '...');
  servidor = spawn(process.execPath, [path.join(__dirname, 'server.js'), String(PORT)], {
    stdio: ['ignore', 'ignore', 'inherit']
  });
  for (let i = 0; i < 40; i++) {
    if (await puertoOcupado(PORT)) { linea('  Servidor listo.'); return; }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error('El servidor no levantó. Prueba primero con INICIAR.bat.');
}

async function asegurarCloudflared() {
  const hallado = buscarCloudflared();
  if (hallado) {
    cf = hallado;
    if (hallado !== 'cloudflared') linea('  cloudflared: ' + hallado);
    return;
  }

  linea('');
  linea('  No tienes cloudflared instalado. Es lo que abre el túnel.');
  linea('  Se instala con:  winget install --id ' + CF_ID);
  linea('');
  const r = await preguntar('  ¿Lo instalo ahora? (s/n): ');
  if (r !== 's' && r !== 'si' && r !== 'sí') {
    throw new Error('Sin cloudflared no se puede abrir el túnel.');
  }

  linea('');
  linea('  Instalando (puede pedirte permiso de Windows)...');
  spawnSync('winget', [
    'install', '--id', CF_ID, '-e',
    '--accept-source-agreements', '--accept-package-agreements'
  ], { stdio: 'inherit' });

  // Recién instalado: el PATH de este proceso todavía no lo tiene, hay que buscarlo.
  const despues = buscarCloudflared();
  if (!despues) {
    throw new Error(
      'Winget dijo que lo instaló, pero no lo encuentro.\n' +
      '  Cierra esta ventana y vuelve a abrir PUBLICAR.bat: con el PATH nuevo debería andar.'
    );
  }
  cf = despues;
  linea('  Instalado en: ' + cf);
}

function abrirTunel() {
  linea('');
  linea('  Abriendo el túnel... (puede demorar unos segundos)');

  tunel = spawn(cf, ['tunnel', '--url', 'http://localhost:' + PORT, '--no-autoupdate']);

  const mirar = async txt => {
    const u = urlDe(txt);
    if (!u || urlPublica) return;
    urlPublica = u + (SALA ? '/?sala=' + SALA : '');

    const copiada = await alPortapapeles(urlPublica);
    const guardada = guardarArchivo(urlPublica);

    marco([
      'Pásale esta dirección a quien está afuera:',
      '',
      urlPublica,
      '',
      copiada ? 'Ya quedó copiada: pégala con Ctrl+V donde quieras.'
              : 'No pude copiarla sola: selecciónala y cópiala a mano.',
      guardada ? 'También quedó en URL-PARA-COMPARTIR.txt, aquí al lado.' : null,
      '',
      'Ojo: ponle PIN a la sala antes de compartirla.',
      'La dirección muere cuando cierras esta ventana.'
    ].filter(l => l !== null));

    linea('  Escribe  c  y Enter para copiarla de nuevo, o  q  para cerrar.');
    linea('');

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.on('line', async l => {
      const t = l.trim().toLowerCase();
      if (t === 'c') {
        const ok = await alPortapapeles(urlPublica);
        linea(ok ? '  Copiada de nuevo: ' + urlPublica : '  No se pudo copiar.');
      } else if (t === 'q') {
        linea('  Cerrando el túnel...');
        apagar();
      }
    });
  };

  tunel.stdout.on('data', mirar);
  tunel.stderr.on('data', mirar);

  tunel.on('exit', code => {
    if (!urlPublica) linea('\n  cloudflared se cerró (código ' + code + ') sin entregar una dirección.');
    apagar();
  });
}

function apagar() {
  try { if (fs.existsSync(ARCHIVO)) fs.unlinkSync(ARCHIVO); } catch (e) {}
  if (tunel) { try { tunel.kill(); } catch (e) {} tunel = null; }
  if (servidor) { try { servidor.kill(); } catch (e) {} servidor = null; }
  process.exit(0);
}

process.on('SIGINT', () => { linea('\n  Cerrando el túnel...'); apagar(); });

/* ------------------------------------------------------------ arranque */

async function arrancar() {
  linea('');
  linea('  The Game Online  ·  publicar en internet');
  linea('  ----------------------------------------');
  if (SALA) linea('  Sala: ' + SALA);
  try {
    await asegurarServidor();
    await asegurarCloudflared();
    abrirTunel();
  } catch (err) {
    linea('');
    linea('  ' + err.message);
    linea('');
    apagar();
  }
}

// solo arranca si lo ejecutas; si lo importas, expone las piezas para probarlas
if (require.main === module) arrancar();

module.exports = { urlDe, buscarCloudflared, alPortapapeles };
