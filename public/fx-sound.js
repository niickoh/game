/* ============================================================
   Capa FX · sonido y háptica
   Audio sintético con WebAudio, sin archivos ni dependencias.
   Apagado por defecto. Un solo AudioContext, creado en el
   primer gesto del usuario (los navegadores bloquean el audio
   antes de eso).
   API: FX.sound.init() · FX.sound.play(nombre, opts)
        FX.sound.enabled(bool) · FX.haptic(patron)
   ============================================================ */
(function(){
  'use strict';

  if(!window.FX) window.FX = {};   // el orquestador ya lo crea; esto es solo red de seguridad
  var fx = window.FX;

  var LS_KEY  = 'thegame.sonido';
  var MASTER  = 0.22;   // ganancia maestra baja: esto suena en una oficina
  var MAX_VOZ = 16;     // tope de nodos simultáneos
  var DEDUPE  = 70;     // ms: ignora el mismo sonido repetido (dos capas diffeando el estado)

  var ctx = null, master = null, ruidoBuf = null;
  var activo = false, listo = false, desbloqueado = false;
  var gestoReal = false;   // el navegador solo permite vibrar tras un toque de verdad
  var voces = 0, proxima = 0, ultimoDe = {};
  var btn = null;

  function nada(){}
  function clamp(v, a, b){ return v < a ? a : (v > b ? b : v); }

  /* -------------------------------------------------- preferencia */
  function leerPref(){
    try { return localStorage.getItem(LS_KEY) === '1'; } catch(e){ return false; }
  }
  function guardarPref(v){
    try { localStorage.setItem(LS_KEY, v ? '1' : '0'); } catch(e){}
  }

  /* -------------------------------------------------- contexto */
  function ensure(){
    if(ctx){
      if(ctx.state === 'suspended') ctx.resume().then(function(){ desbloqueado = true; }, nada);
      else desbloqueado = true;
      return ctx;
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    if(!AC) return null;
    try { ctx = new AC(); } catch(e){ ctx = null; return null; }

    master = ctx.createGain();
    master.gain.value = MASTER;

    // compresor suave: dos efectos encimados no saturan
    var comp = ctx.createDynamicsCompressor();
    try {
      comp.threshold.value = -16;
      comp.knee.value = 24;
      comp.ratio.value = 6;
      comp.attack.value = 0.004;
      comp.release.value = 0.18;
    } catch(e){}

    master.connect(comp);
    comp.connect(ctx.destination);

    if(ctx.state === 'suspended') ctx.resume().then(function(){ desbloqueado = true; }, nada);
    else desbloqueado = true;
    return ctx;
  }

  function ruido(){
    if(ruidoBuf) return ruidoBuf;
    var n = Math.floor(ctx.sampleRate * 0.4);
    ruidoBuf = ctx.createBuffer(1, n, ctx.sampleRate);
    var d = ruidoBuf.getChannelData(0);
    for(var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return ruidoBuf;
  }

  // suelta los nodos apenas termina la voz
  function soltar(lista){
    voces--;
    for(var i = 0; i < lista.length; i++){
      try { lista[i].disconnect(); } catch(e){}
    }
  }

  /* -------------------------------------------------- ladrillos */
  // o = {t, f, to, dur, g, atk, type}
  function tono(o){
    if(voces >= MAX_VOZ) return;
    var t = o.t;
    var dur = o.dur;
    var atk = Math.min(o.atk == null ? 0.006 : o.atk, dur * 0.4);
    var pico = o.g == null ? 0.25 : o.g;

    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = o.type || 'triangle';
    osc.frequency.setValueAtTime(o.f, t);
    if(o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + dur);

    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(pico, t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    osc.connect(g);
    g.connect(master);
    voces++;
    osc.start(t);
    osc.stop(t + dur + 0.02);
    osc.onended = function(){ soltar([osc, g]); };
  }

  // o = {t, dur, f, to, q, g, type}  — ruido filtrado (ticks y papel)
  function chasquido(o){
    if(voces >= MAX_VOZ) return;
    var t = o.t;
    var dur = o.dur;

    var src = ctx.createBufferSource();
    src.buffer = ruido();

    var filtro = ctx.createBiquadFilter();
    filtro.type = o.type || 'bandpass';
    filtro.frequency.setValueAtTime(o.f, t);
    if(o.to) filtro.frequency.exponentialRampToValueAtTime(Math.max(60, o.to), t + dur);
    filtro.Q.value = o.q == null ? 1 : o.q;

    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.g == null ? 0.2 : o.g, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.connect(filtro);
    filtro.connect(g);
    g.connect(master);
    voces++;
    src.start(t, Math.random() * 0.25);
    src.stop(t + dur + 0.02);
    src.onended = function(){ soltar([src, filtro, g]); };
  }

  /* -------------------------------------------------- paleta */
  // pentatónica de sol menor: cualquier combinación suena bien
  var PENTA = [196.00, 233.08, 261.63, 311.13, 349.23, 392.00, 466.16, 523.25];

  function vCarta(t, o){
    // cuanto más justa la jugada, más arriba la nota
    var justa = clamp(o && typeof o.tight === 'number' ? o.tight : 0.5, 0, 1);
    var f = PENTA[Math.round(justa * (PENTA.length - 1))];
    chasquido({ t:t, dur:0.045, f:1900 + justa * 1200, q:0.9, g:0.16 });   // el tick
    tono({ t:t, f:f, to:f * 0.94, dur:0.16, g:0.30, type:'triangle', atk:0.004 });
    tono({ t:t, f:f / 2, dur:0.12, g:0.11, type:'sine', atk:0.006 });      // cuerpo
  }

  function vSalto(t){
    var ns = [392.00, 523.25, 659.25, 783.99];   // sol do mi sol
    for(var i = 0; i < ns.length; i++){
      tono({ t:t + i * 0.055, f:ns[i], dur:0.42 - i * 0.05, g:0.24, type:'triangle', atk:0.008 });
      tono({ t:t + i * 0.055, f:ns[i] * 2, dur:0.16, g:0.06, type:'sine', atk:0.006 });
    }
    chasquido({ t:t, dur:0.24, f:3200, to:900, q:0.7, g:0.09 });
  }

  function vTurno(t){
    tono({ t:t, f:587.33, dur:0.26, g:0.20, type:'sine', atk:0.02 });
    tono({ t:t + 0.16, f:880.00, dur:0.34, g:0.19, type:'sine', atk:0.02 });
  }

  function vVictoria(t){
    var ns = [392.00, 523.25, 659.25, 783.99, 1046.50];
    for(var i = 0; i < ns.length; i++){
      tono({ t:t + i * 0.085, f:ns[i], dur:0.5, g:0.19, type:'triangle', atk:0.01 });
    }
    var acorde = [523.25, 659.25, 783.99];
    for(var j = 0; j < acorde.length; j++){
      tono({ t:t + 0.44, f:acorde[j], dur:1.1, g:0.12, type:'sine', atk:0.03 });
    }
  }

  function vDerrota(t){
    tono({ t:t, f:349.23, dur:0.34, g:0.19, type:'triangle', atk:0.015 });
    tono({ t:t + 0.22, f:261.63, to:246.94, dur:0.75, g:0.17, type:'triangle', atk:0.02 });
    tono({ t:t + 0.22, f:130.81, dur:0.7, g:0.08, type:'sine', atk:0.03 });
  }

  function vRobo(t, o){
    var n = clamp((o && o.count) || 2, 1, 4);   // papel: un roce por carta, máximo cuatro
    for(var i = 0; i < n; i++){
      var d = t + i * 0.075 + Math.random() * 0.015;
      chasquido({ t:d, dur:0.09, f:2600, to:1200, q:0.6, g:0.12 });
      chasquido({ t:d + 0.012, dur:0.05, f:5200, to:3000, q:0.8, g:0.05, type:'highpass' });
    }
  }

  function vOn(t){
    tono({ t:t, f:523.25, dur:0.13, g:0.20, type:'sine', atk:0.006 });
    tono({ t:t + 0.09, f:783.99, dur:0.20, g:0.17, type:'sine', atk:0.006 });
  }

  /* -------------------------------------------------- efectos del chat */
  function vBum(t){
    chasquido({ t:t, dur:0.09, f:3000, to:600, q:0.6, g:0.18 });          // el crack
    chasquido({ t:t, dur:0.45, f:240, to:55, q:0.8, g:0.34, type:'lowpass' });
    tono({ t:t, f:118, to:36, dur:0.52, g:0.36, type:'sine', atk:0.002 });
    tono({ t:t + 0.012, f:68, to:28, dur:0.62, g:0.24, type:'triangle', atk:0.002 });
  }

  function vAplausos(t){
    for(var i = 0; i < 28; i++){
      var d = t + i * 0.034 + Math.random() * 0.03;
      chasquido({ t:d, dur:0.05 + Math.random() * 0.04, f:1500 + Math.random() * 2300,
                  to:700, q:0.7, g:0.055 + Math.random() * 0.05 });
    }
  }

  function vUh(t){
    tono({ t:t, f:311.13, to:293.66, dur:0.3, g:0.2, type:'sawtooth', atk:0.02 });
    tono({ t:t + 0.26, f:233.08, to:196.00, dur:0.62, g:0.19, type:'sawtooth', atk:0.03 });
    tono({ t:t + 0.26, f:116.54, dur:0.5, g:0.08, type:'sine', atk:0.04 });
  }

  function vTada(t){
    var ns = [523.25, 659.25, 783.99, 1046.50];
    for(var i = 0; i < ns.length; i++){
      tono({ t:t + i * 0.055, f:ns[i], dur:0.42, g:0.19, type:'triangle', atk:0.008 });
    }
  }

  var VOZ = {
    carta:vCarta, salto:vSalto, turno:vTurno,
    victoria:vVictoria, derrota:vDerrota, robo:vRobo, on:vOn,
    bum:vBum, aplausos:vAplausos, uh:vUh, tada:vTada
  };

  /* -------------------------------------------------- háptica */
  var VIBRA = {
    bum:[0, 60, 40, 90],
    aplausos:[0, 12, 40, 12, 40, 12],
    uh:[0, 70, 60, 40],
    tada:[0, 20, 50, 20, 50, 40],
    carta:[14],
    salto:[0, 18, 45, 28],
    turno:[0, 24, 70, 24],
    victoria:[0, 16, 55, 16, 55, 38],
    derrota:[0, 45, 80, 22],
    robo:[0, 9, 35, 9],
    on:[12]
  };

  fx.haptic = function(patron){
    if(!activo || !gestoReal || !navigator.vibrate) return;
    var p = (typeof patron === 'string') ? VIBRA[patron] : patron;
    if(typeof p === 'number') p = [p];
    if(!p) return;
    try { navigator.vibrate(p); } catch(e){}
  };

  /* -------------------------------------------------- botón */
  function pintar(){
    if(!btn) return;
    btn.setAttribute('aria-pressed', activo ? 'true' : 'false');
    if(activo) btn.classList.add('fx-snd-on');
    else btn.classList.remove('fx-snd-on');
    var ico = btn.querySelector('.ico'), txt = btn.querySelector('.txt');
    if(ico) ico.textContent = activo ? '🔊' : '🔇';
    if(txt) txt.textContent = activo ? 'Sonido' : 'Activar sonido';
    btn.classList.toggle('fx-snd-off', !activo);
    btn.title = activo
      ? 'Sonido y voz activados'
      : 'Sonido apagado: enciéndelo para escuchar las frases del chat';
  }

  function latido(){
    if(!btn) return;
    btn.classList.remove('fx-snd-beat');
    void btn.offsetWidth;            // reinicia la animación
    btn.classList.add('fx-snd-beat');
  }

  /* -------------------------------------------------- reproducir */
  function play(nombre, opts){
    opts = opts || {};
    var voz = VOZ[nombre];
    if(!voz || !activo) return;

    // con la pestaña oculta solo pasa el aviso de turno
    if(document.hidden && nombre !== 'turno') return;

    // dos capas pueden diffear el mismo estado: no lo toquemos dos veces
    var ahoraMs = Date.now();
    if(!opts.force && ultimoDe[nombre] && ahoraMs - ultimoDe[nombre] < DEDUPE) return;
    ultimoDe[nombre] = ahoraMs;

    if(opts.haptic !== false) fx.haptic(nombre);

    if(!ensure()) return;
    // si el usuario todavía no ha hecho ningún gesto, descartamos el sonido
    // en vez de dejarlo agendado: si no, se dispararía viejo al primer clic
    if(!desbloqueado && ctx.state !== 'running') return;

    var t = Math.max(ctx.currentTime + 0.02, proxima);
    proxima = t + 0.03;              // 30 ms mínimo entre sonidos
    try { voz(t, opts); } catch(e){ return; }
    latido();
  }

  /* -------------------------------------------------- primer gesto */
  var GESTOS = ['pointerdown', 'keydown', 'touchstart'];
  function armarGesto(){
    function abrir(){
      for(var i = 0; i < GESTOS.length; i++) document.removeEventListener(GESTOS[i], abrir, true);
      desbloqueado = true;
      gestoReal = true;
      if(activo) ensure();
    }
    for(var i = 0; i < GESTOS.length; i++){
      document.addEventListener(GESTOS[i], abrir, { capture:true, passive:true });
    }
  }

  /* -------------------------------------------------- la voz (el "loquendo")
     speechSynthesis viene en el navegador: no hay archivos que descargar.
     Usa la voz en español que encuentre instalada en el sistema. */
  var vozElegida = null;

  function buscarVoz(){
    if(!window.speechSynthesis) return null;
    var vs = [];
    try { vs = speechSynthesis.getVoices() || []; } catch(e){ return null; }
    if(!vs.length) return null;
    var pref = ['es-cl', 'es-mx', 'es-ar', 'es-us', 'es-es', 'es'];
    for(var i = 0; i < pref.length; i++){
      for(var j = 0; j < vs.length; j++){
        var l = (vs[j].lang || '').toLowerCase().replace('_', '-');
        if(l.indexOf(pref[i]) === 0) return vs[j];
      }
    }
    return null;
  }

  fx.hablar = function(texto){
    if(!activo || !texto || !window.speechSynthesis) return;
    if(document.hidden) return;                 // nada de voces misteriosas de fondo
    if(!vozElegida) vozElegida = buscarVoz();
    try {
      speechSynthesis.cancel();                 // no se encolan: manda el último
      var u = new SpeechSynthesisUtterance(String(texto).slice(0, 90));
      if(vozElegida){ u.voice = vozElegida; u.lang = vozElegida.lang; }
      else { u.lang = 'es-ES'; }
      u.rate = 1.06; u.pitch = 0.9; u.volume = 1;
      speechSynthesis.speak(u);
      latido();
    } catch(e){}
  };

  fx.hayVoz = function(){
    if(!window.speechSynthesis) return false;
    if(!vozElegida) vozElegida = buscarVoz();
    return !!vozElegida;
  };

  if(window.speechSynthesis){
    try {
      speechSynthesis.getVoices();
      speechSynthesis.addEventListener('voiceschanged', function(){ vozElegida = buscarVoz(); });
    } catch(e){}
  }

  /* -------------------------------------------------- API */
  fx.sound = {
    init: function(){
      if(listo) return fx.sound;
      listo = true;
      activo = leerPref();

      btn = document.getElementById('btn-sound');
      if(btn){
        btn.addEventListener('click', function(){ fx.sound.enabled(!activo); });
        btn.addEventListener('animationend', function(ev){
          if(ev.animationName === 'fx-snd-beat') btn.classList.remove('fx-snd-beat');
        });
      }
      pintar();
      armarGesto();

      // móvil suspende el contexto al irse a segundo plano
      document.addEventListener('visibilitychange', function(){
        if(!document.hidden && activo && ctx && ctx.state === 'suspended') ctx.resume().then(nada, nada);
      });
      return fx.sound;
    },

    play: play,

    enabled: function(v){
      if(v === undefined) return activo;
      activo = !!v;
      guardarPref(activo);
      pintar();
      if(activo){
        desbloqueado = true;        // esto viene de un clic: ya hay gesto
        ensure();
        play('on', { force:true });
      } else {
        proxima = 0;
        if(navigator.vibrate){ try { navigator.vibrate(0); } catch(e){} }
      }
      return activo;
    },

    // OPCIONAL: diff completo en una llamada. Úsalo SOLO si render() no
    // dispara los play() a mano; si no, el dedupe igual evita el doble.
    diff: function(prev, s){
      if(!prev || !s) return;

      if(s.phase === 'play' && s.placed > prev.placed){
        var suena = null, gap = 99;
        for(var i = 0; i < s.piles.length; i++){
          var a = prev.piles[i], b = s.piles[i];
          if(!a || !b || a.top === b.top) continue;
          var salto = (b.dir === 'up') ? (b.top === a.top - 10) : (b.top === a.top + 10);
          if(salto){ suena = 'salto'; break; }
          var d = Math.abs(b.top - a.top);
          if(d < gap){ gap = d; suena = 'carta'; }
        }
        if(suena === 'salto') play('salto');
        else if(suena) play('carta', { tight: clamp(1 - (gap - 1) / 19, 0, 1) });
      }

      if(s.phase !== 'over' && s.hand && prev.hand && s.hand.length > prev.hand.length){
        play('robo', { count: s.hand.length - prev.hand.length });
      }
      if(s.phase === 'play' && s.yourTurn && !prev.yourTurn) play('turno');
      if(s.phase === 'over' && prev.phase !== 'over' && s.over){
        play(s.over.won ? 'victoria' : 'derrota');
      }
    }
  };

  // auto-arranque por si el orquestador no llama a init()
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){ fx.sound.init(); });
  } else {
    fx.sound.init();
  }
})();