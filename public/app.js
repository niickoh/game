/* ==========================================================================
   ¿Quién chucha revuelve? · cliente.
   El servidor manda el estado completo por SSE; acá se actualiza la mesa
   NODO POR NODO (no se reconstruye con innerHTML) para que las animaciones
   no se corten a medio camino.
   ========================================================================== */
(function(){
  'use strict';

  var $ = function(id){ return document.getElementById(id); };
  var esc = FX.escapar;

  var sesion = null;      // { id, token, room, name }
  var estado = null;      // última vista recibida
  var previo = null;      // instantánea anterior, para saber qué cambió
  var elegida = null;     // valor de la carta seleccionada
  var origenJugada = null;// rect de esa carta, tomado antes de que desaparezca
  var fuente = null;      // EventSource
  var vistoChat = 0, vistoLog = 0;
  var pestana = 'chat';
  var sinLeer = 0;
  var chatListo = false;      // la primera pintada trae el historial: eso no avisa
  // en celular el chat es una hoja que se abre encima de la mesa
  var movil = window.matchMedia('(max-width: 1023px)');

  /* ------------------------------------------------------------ sesión
     El asiento va en sessionStorage, que es POR PESTAÑA: así dos personas en
     el mismo computador (o dos pestañas) son dos jugadores distintos, y una
     recarga te devuelve igual a tu asiento. En localStorage solo queda el
     nombre, para no tener que escribirlo cada vez. */
  var clave = function(sala){ return 'thegame.sesion.' + sala; };

  function leerSesion(sala){
    try { var r = sessionStorage.getItem(clave(sala)); return r ? JSON.parse(r) : null; }
    catch(e){ return null; }
  }
  function guardarSesion(s){
    try {
      sessionStorage.setItem(clave(s.room), JSON.stringify(s));
      localStorage.setItem('thegame.nombre', s.name);
    } catch(e){}
  }
  function borrarSesion(sala){
    try { sessionStorage.removeItem(clave(sala)); } catch(e){}
  }
  function nombreRecordado(){
    try { return localStorage.getItem('thegame.nombre') || ''; } catch(e){ return ''; }
  }
  function salaDeUrl(){
    var q = new URLSearchParams(location.search).get('sala') || '';
    return q.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || 'MESA';
  }

  /* ------------------------------------------------------------ red */
  function api(ruta, cuerpo){
    return fetch(ruta, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo)
    }).then(function(r){
      return r.json().then(function(d){
        if(!r.ok) throw new Error(d.error || ('error ' + r.status));
        return d;
      });
    });
  }

  function enviar(tipo, datos){
    if(!sesion) return Promise.resolve();
    return api('/api/action', {
      room: sesion.room, id: sesion.id, token: sesion.token,
      type: tipo, data: datos || {}
    }).catch(function(err){
      if(/sesión/.test(err.message)){ borrarSesion(sesion.room); location.reload(); }
    });
  }

  function conectar(){
    if(fuente) fuente.close();
    fuente = new EventSource('/api/events?room=' + encodeURIComponent(sesion.room) +
      '&id=' + encodeURIComponent(sesion.id) + '&token=' + encodeURIComponent(sesion.token));

    fuente.onopen = function(){ conexion(true); };
    fuente.onerror = function(){ conexion(false); };
    fuente.onmessage = function(ev){
      conexion(true);
      var s;
      try { s = JSON.parse(ev.data); } catch(e){ return; }
      estado = s;
      pintar();
    };
  }

  function conexion(ok){
    $('conn-dot').className = 'w-2 h-2 rounded-full ' + (ok ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500');
    $('conn-txt').textContent = ok ? 'en línea' : 'reconectando';
    $('conn').className = 'flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ' +
      (ok ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-400'
          : 'bg-rose-950/60 border-rose-500/40 text-rose-400');
  }

  /* ------------------------------------------------------------ reglas (para pintar) */
  function puedeJugar(c, p){
    return p.dir === 'up' ? (c > p.top || c === p.top - 10) : (c < p.top || c === p.top + 10);
  }
  function esSalto(c, p){
    return p.dir === 'up' ? c === p.top - 10 : c === p.top + 10;
  }
  function jugableEnAlguna(c){
    return estado.piles.some(function(p){ return puedeJugar(c, p); });
  }
  function valorSalto(p){
    var v = p.dir === 'up' ? p.top - 10 : p.top + 10;
    return (v >= 2 && v <= 99) ? v : null;
  }

  /* ------------------------------------------------------------ sabor de las cartas */
  var PALABRAS = ['ALQUIMIA','CRISOL','RUNA','RELICARIO','ORÁCULO','VÓRTICE','ÁMBAR','ECLIPSE',
                  'TÓTEM','CENIZA','QUIMERA','OBSIDIANA','AUGURIO','CÁLIZ','ESPIRAL','FÉNIX',
                  'GRIMORIO','MAREA','NÉCTAR','UMBRAL'];
  var PALOS = [
    { s:'♠', c:'text-slate-500', h:'group-hover:text-cyan-400', n:'group-hover:text-cyan-300' },
    { s:'♣', c:'text-slate-500', h:'group-hover:text-cyan-400', n:'group-hover:text-cyan-300' },
    { s:'♥', c:'text-rose-400/70', h:'group-hover:text-rose-400', n:'group-hover:text-rose-300' },
    { s:'♦', c:'text-amber-400/70', h:'group-hover:text-amber-400', n:'group-hover:text-amber-300' }
  ];

  /* ============================================================ pilas */
  var RUNAS = [
    '<path d="M12 2L9 8H15L12 2ZM12 22L15 16H9L12 22ZM2 12L8 9V15L2 12ZM22 12L16 15V9L22 12ZM6.34 6.34L10.59 7.75L7.75 10.59L6.34 6.34ZM17.66 17.66L13.41 16.25L16.25 13.41L17.66 17.66ZM17.66 6.34L16.25 10.59L13.41 7.75L17.66 6.34ZM6.34 17.66L7.75 13.41L10.59 16.25L6.34 17.66Z"/>',
    '<circle cx="12" cy="12" r="6"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" stroke="currentColor" stroke-width="1.5"/>',
    '<path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 4C14.76 4 17.2 5.12 18.96 6.94L12 13.9L5.04 6.94C6.8 5.12 9.24 4 12 4ZM5.33 7.73L10.6 13L5.33 18.27C4.49 17.05 4 15.58 4 12C4 10.42 4.49 8.95 5.33 7.73Z"/>',
    '<path d="M12 2A10 10 0 0 0 2 12A10 10 0 0 0 12 22A10 10 0 0 0 22 12A10 10 0 0 0 12 2M12 4A8 8 0 0 1 20 12A8 8 0 0 1 12 20A8 8 0 0 1 4 12A8 8 0 0 1 12 4M12 8A4 4 0 0 1 16 12A4 4 0 0 1 12 16A4 4 0 0 1 8 12A4 4 0 0 1 12 8Z"/>'
  ];

  function crearPilas(){
    [0,1,2,3].forEach(function(i){
      var arriba = i < 2;
      var dir = arriba ? 'up' : 'down';
      var col = arriba ? 'orange' : 'cyan';
      var el = document.createElement('div');
      el.dataset.pila = i;
      el.className = 'pile-target ' + dir + ' relative rounded-2xl p-3 sm:p-5 flex flex-col justify-between ' +
        'min-h-[150px] sm:min-h-[176px] shadow-pile-subtle group overflow-hidden border-2';

      el.innerHTML =
        '<div class="absolute inset-0 grid place-items-center opacity-10 pointer-events-none">' +
          '<svg class="motivo w-40 h-40 sm:w-48 sm:h-48" fill="currentColor" viewBox="0 0 24 24">' + RUNAS[i] + '</svg>' +
        '</div>' +
        '<div class="flex items-center justify-between relative z-10 gap-2">' +
          '<div class="chapa flex items-center gap-1.5 font-black text-[10px] sm:text-xs tracking-wider uppercase px-2 sm:px-2.5 py-1 rounded-full">' +
            '<span>' + (arriba ? '▲ Sube' : '▼ Baja') + '</span>' +
            '<span class="text-[9px] sm:text-[10px] font-mono font-bold opacity-80">' + (arriba ? '1→99' : '100→2') + '</span>' +
          '</div>' +
          '<button type="button" class="veto-btn w-8 h-8 shrink-0 rounded-full bg-red-950/80 border border-red-500/60 text-red-300 hover:bg-red-800 hover:text-white grid place-items-center transition shadow-lg active:scale-90" ' +
            'title="Avisar al equipo que no jueguen en esta pila" aria-label="Avisar que no jueguen en esta pila">' +
            '<span class="text-sm leading-none font-bold">⛔</span></button>' +
        '</div>' +
        '<div class="cinta-obliga" hidden></div>' +
        '<div class="my-auto py-1 text-center relative z-10">' +
          '<span class="pile-num text-5xl sm:text-7xl font-black tracking-tight"><span>' +
            (arriba ? 1 : 100) + '</span></span>' +
        '</div>' +
        '<div class="avisos relative z-10 mb-1"></div>' +
        '<div class="pie w-full flex flex-wrap items-center justify-between gap-x-2 gap-y-1 pt-2 text-xs relative z-10">' +
          '<span class="cuenta font-medium flex items-center gap-1 whitespace-nowrap">' +
            '<span class="w-1.5 h-1.5 rounded-full bg-slate-500"></span><span class="n">0 cartas</span></span>' +
          '<span class="salto text-[10px] sm:text-[11px] font-semibold text-slate-400 font-mono bg-slate-900/60 px-2 py-0.5 rounded border border-slate-800 whitespace-nowrap">Base inicial</span>' +
        '</div>';

      el.querySelector('.veto-btn').addEventListener('click', function(ev){
        ev.stopPropagation();
        this.classList.remove('pulsa'); void this.offsetWidth; this.classList.add('pulsa');
        enviar('aviso', { pile: i });
      });

      el.addEventListener('click', function(){
        if(elegida === null || !estado || !estado.yourTurn) return;
        if(!puedeJugar(elegida, estado.piles[i])) return;
        var carta = document.querySelector('.card-hand.sel');
        origenJugada = FX.rect(carta);
        var v = elegida;
        elegida = null;
        enviar('play', { card: v, pile: i });
      });

      (arriba ? $('piles-up') : $('piles-down')).appendChild(el);
    });
  }

  function pilaEl(i){ return document.querySelector('.pile-target[data-pila="' + i + '"]'); }

  /* ============================================================ arrastrar cartas
     Con mouse o lápiz se puede tomar la carta y soltarla sobre el montón. En
     pantalla táctil se mantiene tocar-y-tocar: si capturáramos el dedo, no se
     podría desplazar la página. */
  var arrastre = null;
  var suprimirClick = false;

  function caraDeCarta(valor){
    return '<span class="esq bajo-izq">' + valor + '</span>' +
           '<span class="centro">' + valor + '</span>' +
           '<span class="esq alto-der">' + valor + '</span>';
  }

  function pilaBajo(ev){
    var bajo = document.elementFromPoint(ev.clientX, ev.clientY);
    var pila = bajo && bajo.closest ? bajo.closest('.pile-target') : null;
    return pila ? Number(pila.dataset.pila) : null;
  }

  function limpiarEncima(){
    Array.prototype.forEach.call(document.querySelectorAll('.pile-target.encima'),
      function(p){ p.classList.remove('encima'); });
  }

  function empezarArrastre(ev, el, valor){
    if(ev.button !== 0 || ev.pointerType === 'touch') return;
    if(!estado || !estado.yourTurn || el.disabled) return;
    var r = el.getBoundingClientRect();
    arrastre = {
      el: el, valor: valor, activo: false,
      x0: ev.clientX, y0: ev.clientY,
      offX: ev.clientX - r.left, offY: ev.clientY - r.top,
      w: el.offsetWidth || r.width, h: el.offsetHeight || r.height, origen: r, id: ev.pointerId
    };
    try { el.setPointerCapture(ev.pointerId); } catch(e){}
  }

  function activarArrastre(){
    var a = arrastre;
    a.activo = true;
    a.el.classList.add('arrastrando');
    document.body.classList.add('arrastrando');

    var clon = document.createElement('div');
    clon.className = 'fx-arrastre';
    clon.style.width = a.w + 'px';
    clon.style.height = a.h + 'px';
    clon.style.left = '0px';
    clon.style.top = '0px';
    clon.style.fontSize = Math.round(a.w * 0.52) + 'px';
    clon.innerHTML = caraDeCarta(a.valor);
    FX.nodo(clon, 0);
    a.clon = clon;
    elegida = a.valor;      // resalta las pilas donde cabe mientras la llevas
    pintarPilas();
  }

  function moverArrastre(ev){
    if(!arrastre || ev.pointerId !== arrastre.id) return;
    var a = arrastre;
    if(!a.activo){
      if(Math.abs(ev.clientX - a.x0) + Math.abs(ev.clientY - a.y0) < 7) return;
      activarArrastre();
    }
    ev.preventDefault();

    var x = ev.clientX - a.offX, y = ev.clientY - a.offY;
    var inclina = Math.max(-12, Math.min(12, (ev.clientX - a.x0) * 0.06));
    a.clon.style.transform = 'translate(' + x + 'px,' + y + 'px) rotate(' + inclina + 'deg) scale(1.06)';

    var i = pilaBajo(ev);
    if(i !== a.pila){
      a.pila = i;
      limpiarEncima();
      a.clon.classList.remove('sobre-valida', 'sobre-invalida', 'sobre-salto');
      if(i !== null){
        var p = estado.piles[i];
        if(puedeJugar(a.valor, p)){
          pilaEl(i).classList.add('encima');
          a.clon.classList.add(esSalto(a.valor, p) ? 'sobre-salto' : 'sobre-valida');
        } else {
          a.clon.classList.add('sobre-invalida');
        }
      }
    }
  }

  function soltarArrastre(ev){
    if(!arrastre || (ev && ev.pointerId !== arrastre.id)) return;
    var a = arrastre;
    arrastre = null;
    try { a.el.releasePointerCapture(a.id); } catch(e){}
    if(!a.activo) return;

    suprimirClick = true;
    document.body.classList.remove('arrastrando');
    a.el.classList.remove('arrastrando');
    limpiarEncima();

    var i = a.pila;
    var valida = i !== null && estado && estado.yourTurn && puedeJugar(a.valor, estado.piles[i]);

    if(valida){
      // el vuelo arranca donde la soltaste: se ve como que la carta se acomoda sola
      origenJugada = a.clon.getBoundingClientRect();
      if(a.clon.quitar) a.clon.quitar();
      elegida = null;
      enviar('play', { card: a.valor, pile: i });
    } else {
      devolver(a);
    }
  }

  // vuelve a su lugar en la mano si la soltaste en cualquier parte
  function devolver(a){
    var destino = a.el.getBoundingClientRect();
    var actual = a.clon.getBoundingClientRect();
    var anim = a.clon.animate([
      { transform: a.clon.style.transform },
      { transform: 'translate(' + (destino.left) + 'px,' + (destino.top) + 'px) rotate(0deg) scale(1)' }
    ], { duration: 220, easing: 'cubic-bezier(.3,.8,.4,1)', fill: 'forwards' });
    var limpiar = function(){
      if(a.clon.quitar) a.clon.quitar();
      elegida = null;
      pintarMano();
      pintarPilas();
    };
    anim.onfinish = limpiar;
    setTimeout(limpiar, 400);
    void actual;
  }

  document.addEventListener('pointermove', moverArrastre, { passive: false });
  document.addEventListener('pointerup', soltarArrastre);
  document.addEventListener('pointercancel', soltarArrastre);

  function pintarPilas(){
    estado.piles.forEach(function(p, i){
      var el = pilaEl(i);
      if(!el) return;

      if(!FX.enVuelo(i)) FX.rodillo(el.querySelector('.pile-num'), p.top, p.dir);
      el.querySelector('.cuenta .n').textContent = p.count === 1 ? '1 carta' : p.count + ' cartas';
      var punto = el.querySelector('.cuenta span:first-child');
      punto.className = 'w-1.5 h-1.5 rounded-full';
      punto.style.background = p.count
        ? (p.dir === 'up' ? 'var(--sube)' : 'var(--baja)')
        : 'var(--ui-texto3)';

      // el salto de 10 que aceptaría esta pila ahora mismo
      var salto = valorSalto(p);
      var sal = el.querySelector('.salto');
      var tengo = salto !== null && estado.hand.indexOf(salto) !== -1 && estado.yourTurn;
      if(salto === null){
        sal.innerHTML = p.count === 0
          ? 'base<span class="hidden sm:inline"> inicial</span>'
          : 'sin salto<span class="hidden sm:inline"> posible</span>';
        sal.className = 'salto text-[10px] sm:text-[11px] font-semibold text-slate-500 font-mono bg-slate-900/60 px-2 py-0.5 rounded border border-slate-800 whitespace-nowrap';
      } else {
        sal.innerHTML = '⚡ <span class="hidden sm:inline">Salto </span>' +
          (p.dir === 'up' ? '−10' : '+10') + ': <strong>' + salto + '</strong>';
        sal.className = 'salto text-[10px] sm:text-[11px] font-bold font-mono px-2 py-0.5 rounded border whitespace-nowrap ' +
          (tengo ? 'text-amber-200 bg-amber-950/80 border-amber-400/70 shadow-[0_0_14px_rgba(245,158,11,.35)]'
                 : 'text-slate-400 bg-slate-900/60 border-slate-800');
      }

      // pila obligada por una carta doble
      var obl = estado.obligada && estado.obligada.pila === i ? estado.obligada : null;
      var cinta = el.querySelector('.cinta-obliga');
      el.classList.toggle('obligada', !!obl);
      el.classList.toggle('ya', !!(obl && obl.ultima));
      cinta.hidden = !obl;
      if(obl){
        cinta.textContent = obl.ultima
          ? '⚠ Hay que cubrir el ' + obl.carta + ' ahora o se pierde'
          : '⚠ El ' + obl.carta + ' obliga a jugar acá';
      }

      // avisos de «no jueguen acá» que siguen puestos
      var mis = estado.avisos.filter(function(a){ return a.pila === i; });
      var cont = el.querySelector('.avisos');
      cont.innerHTML = mis.map(function(a){
        return '<span class="aviso-chip' + (a.mio ? ' mio' : '') + '">⛔ <b>' + esc(a.nombre) + '</b></span>';
      }).join('');

      var boton = el.querySelector('.veto-btn');
      var tengoAviso = mis.some(function(a){ return a.mio; });
      boton.classList.toggle('activo', tengoAviso);
      boton.title = tengoAviso
        ? 'Sacar tu aviso de esta pila'
        : 'Avisar al equipo que no jueguen en esta pila';

      // resalte según la carta elegida
      el.classList.remove('jugable', 'bloqueada', 'salto-listo');
      if(elegida !== null && estado.yourTurn){
        if(puedeJugar(elegida, p)){
          el.classList.add('jugable');
          if(esSalto(elegida, p)) el.classList.add('salto-listo');
        } else {
          el.classList.add('bloqueada');
        }
      }
    });
  }

  /* ============================================================ jugadores */
  function pintarRoster(){
    var cont = $('roster');
    var vistos = {};

    estado.players.forEach(function(p, idx){
      vistos[p.id] = true;
      var el = cont.querySelector('[data-jug="' + p.id + '"]');
      if(!el){
        el = document.createElement('div');
        el.dataset.jug = p.id;
        cont.appendChild(el);
      }
      var yo = estado.you && p.id === estado.you.id;
      el.className = 'who flex items-center gap-2 whitespace-nowrap rounded-full px-3 sm:px-3.5 py-1.5 text-xs border ' +
        (p.turn
          ? 'turno bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-amber-600/20 border-2 border-amber-400 text-amber-100 font-bold scale-105'
          : 'bg-board-surface/90 border-slate-700/60 text-slate-300 font-medium') +
        (p.online ? '' : ' offline');
      el.innerHTML =
        '<span class="w-2 h-2 rounded-full ' + (p.turn ? 'bg-amber-400 animate-ping' : (p.online ? 'bg-emerald-500/70' : 'bg-slate-600')) + '"></span>' +
        (p.admin ? '<span title="Administrador de la sala">👑</span>' : '') +
        '<span class="' + (p.turn ? 'text-white font-extrabold' : '') + '">' + esc(p.name) + (yo ? ' <span class="text-slate-500">(tú)</span>' : '') + '</span>' +
        '<span class="px-1.5 py-0.5 rounded-full font-mono font-bold text-[11px] ' +
          (p.turn ? 'bg-amber-400 text-slate-950' : 'bg-slate-800/90 text-slate-300') + '">' + p.cards + '</span>' +
        (p.seated ? '' : '<span class="text-[10px] text-slate-500">mirando</span>');
      cont.appendChild(el);   // reordena según el orden del servidor
    });

    Array.prototype.slice.call(cont.children).forEach(function(el){
      if(!vistos[el.dataset.jug]) cont.removeChild(el);
    });
  }

  /* ============================================================ mano */
  /* Cada uno acomoda su mano como quiera; queda guardado en el navegador. */
  var LS_ORDEN = 'thegame.mano.orden', LS_VISTA = 'thegame.mano.vista';
  var ORDENES = { asc:1, desc:1 };
  var VISTAS = {
    rejilla: 'grid grid-cols-3 sm:grid-cols-6 gap-2.5 sm:gap-3.5 min-h-[10rem]',
    fila:    'mano-fila min-h-[10rem]',
    abanico: 'mano-abanico'
  };
  var manoOrden = 'asc', manoVista = 'rejilla';
  try {
    var _o = localStorage.getItem(LS_ORDEN); if(ORDENES[_o]) manoOrden = _o;
    var _v = localStorage.getItem(LS_VISTA); if(VISTAS[_v]) manoVista = _v;
  } catch(e){}

  function ordenarMano(mano){
    return mano.slice().sort(function(a, b){ return manoOrden === 'desc' ? b - a : a - b; });
  }

  /* El abanico se arma con lo que hay: el ancho de la carta lo manda el mazo
     (las de arte van por proporcion) y el ancho util lo manda la pantalla.
     Con eso se calcula cuanto se montan y cuanto se inclinan. */
  function acomodarAbanico(cont, n){
    var carta = cont.firstElementChild;
    if(!carta || !n) return;
    var ancho = carta.offsetWidth || 90, alto = carta.offsetHeight || 140;
    var libre = Math.max(200, cont.clientWidth) - 8;
    var paso = Math.min(6, Math.max(2.4, 34 / n));
    if(libre < 520) paso *= 0.6;                      // en el celular, arco mas plano
    var giroMax = paso * (n - 1) / 2;
    // al rotar, las cartas de los extremos se salen mas alla de su ancho
    var vuelo = Math.sin(giroMax * Math.PI / 180) * alto;
    var util = libre - vuelo * 2 - 6;
    var solape = n > 1 ? ancho - (util - ancho) / (n - 1) : 0;
    solape = Math.max(ancho * 0.10, Math.min(ancho * 0.66, solape));
    cont.style.setProperty('--solape', Math.round(solape) + 'px');
    return paso;
  }
  /* Si la imagen del mazo no carga, se quita y queda la cara dibujada. */
  function respaldoDeImagen(el){
    var img = el.querySelector('.carta-img');
    if(!img) return;
    img.addEventListener('error', function(){
      var capa = el.querySelector('.carta-capa');
      if(capa) capa.parentNode.removeChild(capa);
      img.parentNode.removeChild(img);
      el.classList.add('fallo');    // deja ver el diseño dibujado de respaldo
    }, { once: true });
  }

  function crearCarta(valor){
    var el = document.createElement('button');
    el.type = 'button';
    el.dataset.valor = valor;
    el.className = 'card-hand group relative p-2 sm:p-3 flex flex-col justify-between ' +
      'h-32 sm:h-44 text-left overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400';
    // cada mazo dibuja su propia cara
    el.innerHTML = '<div class="absolute inset-0 card-rune-bg pointer-events-none"></div>' +
                   '<div class="brillo"></div>' + MAZOS.carta(valor);

    respaldoDeImagen(el);

    el.addEventListener('pointerdown', function(ev){ empezarArrastre(ev, el, valor); });
    el.addEventListener('click', function(){
      if(suprimirClick){ suprimirClick = false; return; }   // venía de un arrastre
      if(el.disabled) return;
      elegida = (elegida === valor) ? null : valor;
      pintarMano();
      pintarPilas();
    });
    el.addEventListener('pointermove', function(ev){
      var r = el.getBoundingClientRect();
      el.style.setProperty('--mx', Math.round(((ev.clientX - r.left) / r.width) * 100) + '%');
    });
    return el;
  }

  /* El popup donde cada uno mira sus cartas y decide si parte. */
  var decidiendo = false;   // ya apreté Paso o Yo quiero iniciar, falta la respuesta

  function pintarPartir(){
    var cont = $('partir-mano');
    if(!cont) return;
    cont.innerHTML = '';
    ordenarMano(estado.hand).forEach(function(v){
      var el = document.createElement('div');
      el.className = 'card-hand relative p-2 flex flex-col justify-between h-28 sm:h-32 overflow-hidden';
      el.innerHTML = '<div class="absolute inset-0 card-rune-bg pointer-events-none"></div>' + MAZOS.carta(v);
      respaldoDeImagen(el);
      cont.appendChild(el);
    });

    var txt = $('partir-estado');
    if(estado.pasaron > 0){
      txt.textContent = estado.pasaron === 1
        ? 'Alguien ya pasó. Si pasan todos, parte quien administra la sala.'
        : estado.pasaron + ' jugadores ya pasaron. Si pasan todos, parte quien administra la sala.';
    } else {
      txt.textContent = 'Nadie se ha ofrecido todavía.';
    }
  }

  function pintarMano(){
    var cont = $('hand');
    var mano = ordenarMano(estado.hand);
    // los mensajes de "no hay cartas" se ven mejor en la rejilla
    cont.className = mano.length ? (VISTAS[manoVista] || VISTAS.rejilla) : VISTAS.rejilla;

    if(estado.phase === 'lobby'){
      cont.innerHTML = '<p class="col-span-full text-slate-500 text-sm py-8 text-center">La partida no ha empezado.</p>';
      return;
    }
    // en 'eligiendo' las cartas se ven (para eso es), pero todavía no se juegan
    if(!mano.length){
      cont.innerHTML = '<p class="col-span-full text-slate-500 text-sm py-8 text-center">' +
        (estado.phase === 'over' ? 'Partida terminada.' : 'Estás mirando esta partida.') + '</p>';
      return;
    }
    var vacio = cont.querySelector('p');
    if(vacio) cont.removeChild(vacio);

    var hay = {};
    Array.prototype.slice.call(cont.children).forEach(function(el){
      var v = Number(el.dataset.valor);
      if(mano.indexOf(v) === -1) cont.removeChild(el);
      else hay[v] = el;
    });

    var nuevas = 0;
    var mitad = (mano.length - 1) / 2;
    var paso = manoVista === 'abanico' ? (acomodarAbanico(cont, mano.length) || 5.5) : 0;
    mano.forEach(function(v, i){
      var el = hay[v];
      if(!el){
        el = crearCarta(v);
        if(!FX.reducido()){
          el.classList.add('entrando');
          el.style.setProperty('--retardo', (nuevas * 65) + 'ms');
          el.style.setProperty('--giro', ((v % 2 ? -1 : 1) * (4 + v % 5)) + 'deg');
          el.addEventListener('animationend', function(){ el.classList.remove('entrando'); }, { once: true });
        }
        nuevas++;
        hay[v] = el;
      }
      cont.appendChild(el);

      // el abanico necesita saber donde va cada carta dentro del arco
      el.style.setProperty('--i', i + 1);
      if(manoVista === 'abanico'){
        el.style.setProperty('--giro-ab', ((i - mitad) * paso).toFixed(2) + 'deg');
        el.style.setProperty('--sube-ab', Math.round(Math.abs(i - mitad) * paso * 0.85) + 'px');
      } else {
        el.style.removeProperty('--giro-ab');
        el.style.removeProperty('--sube-ab');
      }

      var muerta = !estado.yourTurn || !jugableEnAlguna(v);
      el.disabled = muerta;
      el.classList.toggle('dead', muerta);
      el.classList.toggle('sel', elegida === v);
      el.setAttribute('aria-pressed', elegida === v ? 'true' : 'false');
    });

    if(elegida !== null && mano.indexOf(elegida) === -1) elegida = null;
  }

  /* ============================================================ chat e historial */
  function cerca(cont){
    return cont.scrollHeight - cont.scrollTop - cont.clientHeight < 90;
  }

  function pintarChat(){
    var cont = $('chat-messages');
    var abajo = cerca(cont);
    var yo = estado.you ? estado.you.id : null;
    var avisa = chatListo;
    chatListo = true;

    estado.chat.forEach(function(m){
      if(m.id <= vistoChat) return;
      vistoChat = m.id;
      var el = document.createElement('div');

      if(m.tipo === 'sistema'){
        el.className = 'text-center text-[11px] text-slate-500 italic py-0.5';
        el.textContent = m.texto;
      } else if(m.tipo === 'aviso'){
        el.className = 'flex items-center gap-2 bg-red-950/50 border border-red-500/40 rounded-xl px-3 py-2 text-red-200';
        el.innerHTML = '<span class="text-base shrink-0">⛔</span><span class="leading-tight"><strong>' +
          esc(m.nombre) + '</strong> pide no jugar en el montón ' +
          (m.dir === 'up' ? '▲' : '▼') + ' de la ' + (m.pila % 2 === 0 ? 'izquierda' : 'derecha') + '</span>';
      } else {
        var mio = m.autor === yo;
        var iniciales = esc(m.nombre).slice(0, 2).toUpperCase();
        var hora = new Date(m.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        el.className = 'flex items-start gap-2.5' + (mio ? ' justify-end' : '');
        el.innerHTML = mio
          ? '<div class="space-y-0.5 text-right min-w-0">' +
              '<div class="flex items-baseline justify-end gap-1.5"><span class="text-[9px] text-slate-500">' + hora + '</span>' +
              '<span class="font-bold text-amber-300 text-[11px]">Tú</span></div>' +
              '<div class="bg-amber-500/20 rounded-2xl rounded-tr-none px-3 py-1.5 text-amber-100 border border-amber-500/40 leading-relaxed text-left break-words">' + esc(m.texto) + '</div>' +
            '</div>' +
            '<div class="w-7 h-7 shrink-0 rounded-full bg-amber-500/30 border border-amber-500/60 grid place-items-center font-bold text-[10px] text-amber-200">' + iniciales + '</div>'
          : '<div class="w-7 h-7 shrink-0 rounded-full bg-slate-700/60 border border-slate-600 grid place-items-center font-bold text-[10px] text-slate-300">' + iniciales + '</div>' +
            '<div class="space-y-0.5 min-w-0">' +
              '<div class="flex items-baseline gap-1.5"><span class="font-bold text-slate-300 text-[11px]">' + esc(m.nombre) + '</span>' +
              '<span class="text-[9px] text-slate-500">' + hora + '</span></div>' +
              '<div class="bg-slate-800/80 rounded-2xl rounded-tl-none px-3 py-1.5 text-slate-200 border border-slate-700/60 leading-relaxed break-words">' + esc(m.texto) + '</div>' +
            '</div>';
        if(!mio && avisa && !chatALaVista()){
          marcarSinLeer();
          avisarMensaje(m);
        }
      }
      cont.appendChild(el);
    });

    while(cont.children.length > 120) cont.removeChild(cont.firstChild);
    if(abajo) cont.scrollTop = cont.scrollHeight;
  }

  function textoLog(e){
    var pilaTxt = function(i, dir){
      return (dir === 'up' ? '▲' : '▼') + ' ' + (i % 2 === 0 ? 'izq' : 'der');
    };
    switch(e.tipo){
      case 'inicio':   return ['🎴', '<strong>' + esc(e.jugador) + '</strong> repartió · ' + e.jugadores + ' jugadores', 'text-amber-300'];
      case 'revancha': return ['🔁', '<strong>' + esc(e.jugador) + '</strong> pidió revancha · ' + e.jugadores + ' jugadores', 'text-amber-300'];
      case 'jugada':   return [e.salto ? '⚡' : '▪',
                               '<strong>' + esc(e.jugador) + '</strong> puso <span class="font-mono font-bold">' + e.carta + '</span> en ' + pilaTxt(e.pila, e.dir) +
                               (e.salto ? ' <span class="text-amber-300 font-bold">salto de 10</span>' : ''),
                               e.salto ? 'text-amber-300' : 'text-slate-400'];
      case 'deshacer': return ['↩', '<strong>' + esc(e.jugador) + '</strong> se arrepintió del ' + e.carta, 'text-slate-500'];
      case 'turno':    return ['→', '<strong>' + esc(e.jugador) + '</strong> cerró con ' + e.jugadas + ' cartas' +
                               (e.siguiente ? ' · ahora ' + esc(e.siguiente) : '') +
                               (e.mazo === 0 ? ' <span class="text-rose-400">mazo agotado</span>' : ''), 'text-slate-400'];
      case 'aviso':    return ['⛔', '<strong>' + esc(e.jugador) + '</strong> pidió no jugar en ' + pilaTxt(e.pila, e.pila < 2 ? 'up' : 'down'), 'text-red-300'];
      case 'reinicio': return ['🔄', '<strong>' + esc(e.jugador) + '</strong> reinició la sala', 'text-slate-400'];
      case 'modo':     return [e.modo === 'duro' ? '💀' : '🃏',
                               '<strong>' + esc(e.jugador) + '</strong> puso el modo ' +
                               (e.modo === 'duro' ? '<strong class="text-rose-300">duro</strong>' : 'clásico'),
                               'text-slate-400'];
      case 'parte':    return ['🚀', '<strong>' + esc(e.jugador) + '</strong> se ofreció a partir', 'text-emerald-300'];
      case 'obliga':   return ['⚠', '<strong>' + esc(e.jugador) + '</strong> puso el <span class="font-mono font-bold">' + e.carta +
                               '</span>: hay que cubrir ' + pilaTxt(e.pila, e.pila < 2 ? 'up' : 'down'), 'text-amber-300'];
      case 'cubre':    return ['✔', '<strong>' + esc(e.jugador) + '</strong> cubrió con el <span class="font-mono font-bold">' + e.carta + '</span>', 'text-emerald-300'];
      case 'desaviso': return ['⛔', '<strong>' + esc(e.jugador) + '</strong> sacó su aviso de ' + pilaTxt(e.pila, e.pila < 2 ? 'up' : 'down'), 'text-slate-500'];
      case 'salta':    return ['⏭', '<strong>' + esc(e.jugador) + '</strong> no estaba: el turno pasó a ' + esc(e.siguiente || 'el siguiente'), 'text-slate-400'];
      case 'devuelve': return ['↩', '<strong>' + esc(e.jugador) + '</strong> dejó la mesa: ' + e.cartas + ' cartas vuelven al mazo', 'text-slate-400'];
      case 'fin':      return [e.won ? '🏆' : '🏁',
                               e.won ? '<strong>Las 98 colocadas</strong>'
                                     : (e.motivo === 'obligada'
                                        ? '<strong>Nadie cubrió la pila obligada</strong> · ' + e.fuera + ' cartas fuera'
                                        : 'Fin · ' + e.fuera + ' cartas quedaron fuera'),
                               e.won ? 'text-emerald-300' : 'text-rose-300'];
      default:         return ['·', esc(e.tipo), 'text-slate-500'];
    }
  }

  function pintarLog(){
    var cont = $('log-list');
    var abajo = cerca(cont);
    estado.log.forEach(function(e){
      if(e.id <= vistoLog) return;
      vistoLog = e.id;
      var t = textoLog(e);
      var el = document.createElement('div');
      el.className = 'flex items-start gap-2 ' + t[2];
      el.innerHTML = '<span class="w-4 shrink-0 text-center">' + t[0] + '</span><span class="leading-snug min-w-0">' + t[1] + '</span>';
      cont.appendChild(el);
    });
    while(cont.children.length > 160) cont.removeChild(cont.firstChild);
    if(abajo) cont.scrollTop = cont.scrollHeight;
  }

  function marcarSinLeer(){
    sinLeer++;
    var b = $('chat-badge');
    b.textContent = sinLeer > 9 ? '9+' : sinLeer;
    b.classList.remove('hidden');
    var fab = $('chat-fab');
    fab.classList.remove('nuevo'); void fab.offsetWidth; fab.classList.add('nuevo');
    fab.setAttribute('aria-label', 'Abrir chat, ' + sinLeer + ' sin leer');
  }

  function leido(){
    sinLeer = 0;
    $('chat-badge').classList.add('hidden');
    $('chat-fab').setAttribute('aria-label', 'Abrir chat');
  }

  function chatAbierto(){ return !movil.matches || $('side-panel').classList.contains('abierto'); }
  function chatALaVista(){ return pestana === 'chat' && chatAbierto(); }

  /* En celular, con la hoja cerrada, cada mensaje asoma arriba unos segundos.
     Tocarlo abre el chat. Nunca más de tres a la vez. */
  function avisarMensaje(m){
    if(chatAbierto()) return;
    var cont = $('chat-avisos');
    var el = document.createElement('button');
    el.type = 'button';
    el.className = 'chat-aviso';
    el.innerHTML = '<span class="ini">' + esc(m.nombre).slice(0, 2).toUpperCase() + '</span>' +
      '<span class="min-w-0"><span class="quien">' + esc(m.nombre) + '</span>' +
      '<span class="que">' + esc(m.texto) + '</span></span>';
    el.onclick = function(){ verPestana('chat'); togglePanel(true); };
    cont.appendChild(el);
    while(cont.children.length > 3) cont.removeChild(cont.firstChild);
    setTimeout(function(){
      el.classList.add('sale');
      setTimeout(function(){ if(el.parentNode) el.parentNode.removeChild(el); }, 260);
    }, 4500);
  }

  /* ============================================================ cabecera y controles */
  function pintarCabecera(){
    $('room-tag').textContent = estado.room;

    // La dificultad se ve arriba siempre; solo el administrador la puede tocar,
    // y no con la partida andando.
    if(MAZOS.contexto(estado.modo, estado.dobles) && estado.hand.length){
      $('hand').innerHTML = '';     // el arte de las dobles cambia con el modo
    }
    var sel = $('modo-sel');
    var editable = estado.soyAdmin && estado.phase !== 'play' && estado.phase !== 'eligiendo';
    sel.classList.remove('hidden');
    sel.classList.toggle('editable', editable);
    sel.title = editable ? 'Cambia la dificultad'
      : (estado.soyAdmin ? 'No se cambia con la partida andando' : 'Dificultad de esta sala');
    Array.prototype.forEach.call(sel.querySelectorAll('.modo-pill'), function(b){
      b.classList.toggle('on', b.dataset.modo === estado.modo);
      b.disabled = !editable;
    });
    $('c-deck').textContent = estado.deck;
    $('c-left').textContent = estado.left;
    $('c-done').textContent = estado.placed;

    var falta = Math.max(0, estado.min - estado.turn.length);
    var nombre = $('turn-name'), req = $('turn-req'), nota = $('note');

    if(estado.phase === 'lobby'){
      nombre.innerHTML = 'Sala <span class="bg-gradient-to-r from-amber-300 to-orange-400 bg-clip-text text-transparent">' + esc(estado.room) + '</span>';
      req.textContent = estado.players.length + (estado.players.length === 1 ? ' jugador esperando' : ' jugadores esperando');
    } else if(estado.phase === 'eligiendo'){
      nombre.innerHTML = '<span class="bg-gradient-to-r from-emerald-300 to-teal-400 bg-clip-text text-transparent">¿Quién parte?</span>';
      req.textContent = 'Miren sus cartas y que parta el que tenga mejor mano';
    } else if(estado.phase === 'over'){
      nombre.textContent = 'Partida terminada';
      req.textContent = estado.over ? (estado.over.placed + ' de 98 colocadas') : '';
    } else {
      nombre.innerHTML = estado.yourTurn
        ? '<span class="bg-gradient-to-r from-amber-300 to-orange-400 bg-clip-text text-transparent">Tu turno</span>'
        : 'Turno de <span class="bg-gradient-to-r from-amber-300 to-orange-400 bg-clip-text text-transparent">' + esc(estado.turnName || '—') + '</span>';
      req.innerHTML = estado.deck
        ? 'Mínimo <strong class="text-white">' + estado.min + ' cartas</strong> · llevas <strong class="text-cyan-400 font-mono">' + estado.turn.length + '</strong>'
        : 'Mazo agotado: basta <strong class="text-white">1</strong> · llevas <strong class="text-cyan-400 font-mono">' + estado.turn.length + '</strong>';
    }

    var etq = $('hand-label');
    etq.innerHTML = '<svg viewBox="0 0 12 15" aria-hidden="true"><rect x=".75" y=".75" width="10.5" height="13.5" rx="2" ' +
      'fill="color-mix(in srgb, var(--acento1) 25%, transparent)" stroke="var(--acento1)" stroke-width="1.5"/></svg>' +
      estado.hand.length;
    etq.classList.toggle('vacia', !estado.hand.length);
    etq.setAttribute('aria-label', estado.hand.length ? 'Tu mano: ' + estado.hand.length + ' cartas' : 'Sin cartas');

    $('btn-end').disabled = !estado.yourTurn || falta > 0;
    $('btn-undo').disabled = !estado.yourTurn || estado.turn.length === 0;

    var enJuego = estado.phase === 'play';
    var repartir = $('btn-deal');
    repartir.hidden = enJuego || estado.phase === 'eligiendo' || !estado.soyAdmin;
    $('btn-deal-txt').textContent = estado.phase === 'over' ? 'Repartir de nuevo' : 'Repartir y empezar';
    $('btn-partir').hidden = !estado.puedoPartir;

    var admin = estado.players.filter(function(p){ return p.admin; })[0];
    nota.className = 'text-xs sm:text-sm font-medium px-3 py-1.5 rounded-lg border flex items-center gap-2 ' +
      'bg-slate-900/60 border-slate-800 text-slate-400';
    if(estado.phase === 'lobby'){
      nota.innerHTML = estado.soyAdmin
        ? '<span class="w-2 h-2 rounded-full bg-amber-400"></span> Cuando estén todos, reparte'
        : '<span class="w-2 h-2 rounded-full bg-slate-500"></span> Esperando que ' + esc(admin ? admin.name : 'el administrador') + ' reparta';
    } else if(estado.phase === 'eligiendo'){
      nota.className = 'text-xs sm:text-sm font-bold px-3 py-1.5 rounded-lg border flex items-center gap-2 bg-emerald-950/60 border-emerald-500/40 text-emerald-300';
      nota.innerHTML = estado.puedoPartir
        ? '<span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Si tienes buena mano, ofrécete'
        : '<span class="w-2 h-2 rounded-full bg-slate-500"></span> Esperando que alguien parta';
    } else if(estado.phase === 'over'){
      nota.innerHTML = '<span class="w-2 h-2 rounded-full bg-slate-500"></span> ' +
        (estado.soyAdmin ? 'Puedes repartir otra' : 'Esperando al administrador');
    } else if(!estado.yourTurn){
      nota.innerHTML = '<span class="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span> Esperando a ' + esc(estado.turnName || '—');
    } else if(falta > 0){
      var puede = estado.hand.some(jugableEnAlguna);
      if(puede){
        nota.innerHTML = '<span class="w-2 h-2 rounded-full bg-amber-400"></span> Te ' +
          (falta === 1 ? 'falta 1 carta' : 'faltan ' + falta + ' cartas') + ' para cerrar';
      } else {
        nota.className = 'text-xs sm:text-sm font-bold px-3 py-1.5 rounded-lg border flex items-center gap-2 bg-rose-950/60 border-rose-500/40 text-rose-300';
        nota.innerHTML = '<span class="w-2 h-2 rounded-full bg-rose-400"></span> Sin jugadas posibles';
      }
    } else {
      nota.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-400"></span> Puedes seguir o terminar el turno';
    }

    // una pila obligada es más urgente que cualquier otro aviso
    if(estado.obligada && enJuego){
      var o = estado.obligada;
      var cual = (o.pila % 2 === 0 ? 'izquierda' : 'derecha') + ' de ' +
                 (estado.piles[o.pila].dir === 'up' ? 'las que suben' : 'las que bajan');
      if(o.ultima){
        nota.className = 'text-xs sm:text-sm font-bold px-3 py-1.5 rounded-lg border flex items-center gap-2 bg-rose-950/70 border-rose-500/60 text-rose-200';
        nota.innerHTML = '<span class="w-2 h-2 rounded-full bg-rose-400 animate-pulse"></span> ' +
          (estado.yourTurn ? 'Cubre la ' : 'Hay que cubrir la ') + cual + ' o se pierde';
      } else {
        nota.className = 'text-xs sm:text-sm font-bold px-3 py-1.5 rounded-lg border flex items-center gap-2 bg-amber-950/60 border-amber-500/50 text-amber-200';
        nota.innerHTML = '<span class="w-2 h-2 rounded-full bg-amber-400"></span> El ' + o.carta +
          ' dejó obligada la ' + cual;
      }
    }
  }

  function pintarSala(){
    $('room-url').value = location.origin + '/?sala=' + estado.room;
    if(document.activeElement !== $('in-nick')){
      $('in-nick').value = estado.you ? estado.you.name : '';
    }

    $('pin-actual').textContent = estado.pin || 'sin PIN';
    $('pin-actual').className = 'flex-1 min-w-0 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono ' +
      (estado.pin ? 'tracking-[.3em] text-cyan-300' : 'text-slate-500');
    $('btn-pin').hidden = !estado.soyAdmin;
    $('btn-pin').textContent = estado.pin ? 'Cambiar' : 'Poner PIN';
    $('seats-count').textContent = '(' + estado.players.length + '/' + estado.maxPlayers + ')';
    $('admin-box').classList.toggle('hidden', !estado.soyAdmin);

    var cont = $('seats');
    cont.innerHTML = '';
    estado.players.forEach(function(p, i){
      var yo = estado.you && p.id === estado.you.id;
      var fila = document.createElement('div');
      fila.className = 'flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900/70 border text-sm ' +
        (yo ? 'border-amber-500/50' : 'border-slate-800');
      fila.innerHTML =
        '<span class="font-mono text-[11px] text-slate-500 w-4">' + (i + 1) + '</span>' +
        (p.admin ? '<span title="Administrador">👑</span>' : '') +
        '<span class="flex-1 min-w-0 truncate ' + (p.online ? 'text-slate-200' : 'text-slate-500') + '">' +
          esc(p.name) + (yo ? ' <span class="text-slate-500 text-xs">(tú)</span>' : '') +
          (p.online ? '' : ' <span class="text-[10px] text-slate-600">desconectado</span>') + '</span>';
      if(estado.soyAdmin && !yo){
        var mando = document.createElement('button');
        mando.type = 'button';
        mando.className = 'px-2 py-1 rounded-lg bg-slate-800 hover:bg-amber-600 hover:text-slate-950 text-[11px] font-bold transition';
        mando.textContent = '👑';
        mando.title = 'Pasarle el mando';
        mando.onclick = function(){ enviar('admin', { id: p.id }); };
        var sacar = document.createElement('button');
        sacar.type = 'button';
        sacar.className = 'px-2 py-1 rounded-lg bg-slate-800 hover:bg-rose-700 text-[11px] font-bold transition';
        sacar.textContent = '✕';
        sacar.title = 'Sacarlo de la sala';
        sacar.onclick = function(){
          if(confirm('¿Sacar a ' + p.name + ' de la sala?')) enviar('kick', { id: p.id });
        };
        fila.appendChild(mando); fila.appendChild(sacar);
      }
      cont.appendChild(fila);
    });
  }

  function pintarFin(){
    var o = estado.over;
    if(!o) return;
    var n = o.left.length;
    var marcador = $('over-score');
    marcador.className = 'font-mono font-black text-6xl leading-none mb-2 tabular-nums ' +
      (o.won ? 'text-emerald-400' : (n <= 10 ? 'text-emerald-400' : (n <= 20 ? 'text-amber-400' : 'text-rose-400')));
    FX.contar(marcador, o.won ? 98 : Math.min(98, n + 14), n, 900);

    $('over-title').textContent = o.won ? 'Las 98 colocadas'
      : (o.motivo === 'obligada' ? 'Quedó la pila sin cubrir'
        : (o.motivo === 'sinjugadores' ? 'Se fueron todos'
          : (n === 1 ? 'Por una carta' : (n <= 10 ? 'Buen resultado' : 'Se acabaron las jugadas'))));
    $('over-msg').textContent = o.won
      ? 'Partida perfecta. Esto no pasa seguido.'
      : (o.motivo === 'obligada'
          ? 'Una carta doble dejó una pila obligada y nadie alcanzó a cubrirla. Quedaron ' + n + ' cartas fuera.'
        : (o.motivo === 'sinjugadores'
          ? 'No quedó nadie en la mesa para seguir jugando.'
        : (n === 1 ? 'Quedó una sola carta fuera. Duele, pero es de las mejores partidas que se pueden jugar.'
          : (n <= 10 ? 'Quedaron ' + n + ' cartas fuera. Bajo 10 el juego ya lo considera un buen resultado.'
            : 'Quedaron ' + n + ' cartas fuera. La meta es bajar de 10.'))));
    $('over-left').innerHTML = o.left.map(function(c){
      return '<span class="font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">' + c + '</span>';
    }).join('');
    pintarResumen(o);
    pintarStats(estado.stats, o.record);
    pintarBotonesFin();
  }

  function nombrePila(i, dir){
    return (dir === 'up' ? '▲' : '▼') + ' ' + (i % 2 === 0 ? 'izq' : 'der');
  }

  // Lo que dejó la partida: lo calcula el servidor con el historial completo.
  function pintarResumen(o){
    var r = o.resumen;
    var caja = $('over-resumen');
    caja.classList.toggle('hidden', !r || !r.turnos);
    if(!r || !r.turnos) return;
    var fila = function(icono, html, color){
      return '<li class="flex items-start gap-2 ' + color + '"><span class="w-5 shrink-0 text-center">' + icono +
        '</span><span class="leading-snug min-w-0">' + html + '</span></li>';
    };
    var num = function(n){ return '<span class="font-mono font-bold">' + n + '</span>'; };
    var html = '';

    var s = r.mejorSalto;
    html += s
      ? fila('⚡', 'Mejor salto: <strong>' + esc(s.jugador) + '</strong> llevó el ' + nombrePila(s.pila, s.dir) +
          ' de ' + num(s.desde) + ' a ' + num(s.carta) + ' <span class="text-slate-500">(turno ' + s.turno +
          (r.saltos > 1 ? ' · ' + r.saltos + ' saltos en total' : '') + ')</span>', 'text-amber-300')
      : fila('⚡', 'Ningún salto de 10 esta vez', 'text-slate-500');

    var m = r.masCartas;
    if(m){
      var quienes = m.jugadores.map(function(n){ return '<strong>' + esc(n) + '</strong>'; });
      html += fila('🃏', 'Más cartas: ' + (quienes.length > 1
        ? quienes.slice(0, -1).join(', ') + ' y ' + quienes[quienes.length - 1] + ', ' + num(m.cartas) + ' cada uno'
        : quienes[0] + ' con ' + num(m.cartas)), 'text-slate-300');
    }

    var t = r.peorTurno;
    if(o.won){
      html += fila('🏆', 'No hubo turno que la echara a perder', 'text-emerald-300');
    } else if(t){
      var cartas = t.cartas.map(function(c){ return num(c.carta) + ' en ' + nombrePila(c.pila, c.dir); }).join(', ');
      html += fila('💥', 'Se echó a perder en el turno ' + t.n + ' de <strong>' + esc(t.jugador) + '</strong>: quemó ' +
        num(t.quemado) + ' de espacio <span class="text-slate-500">(' + cartas + ')</span>', 'text-rose-300');
    }
    $('over-resumen-list').innerHTML = html;
  }

  function pintarStats(st, record){
    var caja = $('over-stats');
    caja.classList.toggle('hidden', !st);
    if(!st) return;
    var ficha = function(valor, etiqueta, nota, color){
      return '<div class="rounded-xl bg-slate-900/70 border border-slate-800 px-2 py-2 text-center">' +
        '<div class="font-mono font-black text-2xl leading-none tabular-nums ' + color + '">' + valor + '</div>' +
        '<div class="text-[11px] font-bold text-slate-300 mt-1">' + etiqueta + '</div>' +
        '<div class="text-[10px] text-slate-500 leading-tight">' + nota + '</div></div>';
    };
    var mejor = st.mejor ? st.mejor.fuera : '—';
    $('over-stats-grid').innerHTML =
      ficha(mejor, record ? '¡Récord!' : 'Mejor', 'cartas fuera', record ? 'text-amber-300' : 'text-emerald-400') +
      ficha(String(st.promedio).replace('.', ','), 'Promedio', 'en ' + st.partidas + (st.partidas === 1 ? ' partida' : ' partidas'), 'text-slate-200') +
      ficha(st.racha, 'Racha', 'hasta ' + st.umbral + ' fuera · récord ' + st.mejorRacha, st.racha ? 'text-cyan-300' : 'text-slate-500');
  }

  // Los botones dependen de quién manda y de quién sigue conectado, que puede
  // cambiar con el modal abierto: se repintan en cada estado.
  function pintarBotonesFin(){
    var conectados = estado.players.filter(function(p){ return p.online; }).length;
    var rev = $('btn-revancha');
    rev.hidden = !estado.soyAdmin;
    rev.disabled = !conectados;
    rev.textContent = 'Revancha · ' + conectados + (conectados === 1 ? ' conectado' : ' conectados');
    $('over-espera').classList.toggle('hidden', !!estado.soyAdmin);
    $('btn-again').textContent = estado.soyAdmin ? 'Volver a la sala' : 'Cerrar';
  }

  /* ============================================================ efectos por diferencia */
  function instantanea(s){
    return {
      phase: s.phase, yourTurn: s.yourTurn, turnName: s.turnName, deck: s.deck,
      hand: s.hand.slice(),
      piles: s.piles.map(function(p){ return { dir: p.dir, top: p.top, count: p.count }; }),
      obligada: s.obligada ? { pila: s.obligada.pila, carta: s.obligada.carta, ultima: s.obligada.ultima } : null,
      chatId: s.chat.length ? s.chat[s.chat.length - 1].id : 0
    };
  }

  function efectos(prev, s){
    if(!prev) return;

    // cartas que aterrizaron
    for(var i = 0; i < 4; i++){
      var a = prev.piles[i], b = s.piles[i];
      if(b.count <= a.count) continue;
      (function(idx, carta, desde, dir, mia, quien){
        var salto = dir === 'up' ? (carta === desde - 10) : (carta === desde + 10);
        var dist = dir === 'up' ? (carta - desde) : (desde - carta);
        var origen = mia ? origenJugada : FX.rect(document.querySelector('[data-jug="' + quien + '"]'));
        var esDobleDura = s.modo === 'duro' && s.dobles && s.dobles.indexOf(carta) !== -1;
        FX.seq(function(){
          var el = pilaEl(idx);
          FX.cartaAPila(origen, el, carta, { salto: salto });
          if(salto){
            setTimeout(function(){ FX.saltoBurst(el, { dir: dir }); }, 380);
            if(!mia) FX.toast(nombreDe(quien) + ' salvó la pila con un salto de 10', 'jump');
          }
          // una doble en modo duro entra con todo: se tiene que notar
          if(esDobleDura && FX.dobleImpacto){
            setTimeout(function(){
              FX.dobleImpacto(el, carta);
              if(FX.sound) FX.sound.play('bum', { force: true });
              FX.toast((mia ? 'Pusiste' : nombreDe(quien) + ' puso') + ' el ' + carta +
                       ': hay que cubrir esa pila', 'aviso');
            }, 340);
          }
          if(FX.sound) FX.sound.play(salto ? 'salto' : 'carta', { tight: Math.max(0, Math.min(1, 1 - (dist - 1) / 19)) });
        }, esDobleDura ? 700 : (salto ? 460 : 260));
      })(i, b.top, a.top, b.dir, prev.yourTurn, idDelTurno(prev.turnName));
      if(prev.yourTurn) origenJugada = null;
    }

    // cartas nuevas en la mano
    var restan = prev.hand.slice();
    var nuevas = s.hand.filter(function(c){
      var k = restan.indexOf(c);
      if(k === -1) return true;
      restan.splice(k, 1);
      return false;
    });
    if(nuevas.length && prev.phase === 'play' && FX.sound) FX.sound.play('robo', { count: nuevas.length });

    // una pila quedó obligada: la viñeta roja queda latiendo hasta que se cubra
    var ob = s.obligada, oa = prev.obligada;
    if(FX.vineta) FX.vineta(!!ob, !!(ob && ob.ultima));
    if(ob && (!oa || oa.pila !== ob.pila || oa.carta !== ob.carta)){
      if(FX.sound) FX.sound.play('turno', { force: true });
    } else if(ob && oa && !oa.ultima && ob.ultima){
      FX.toast('Última oportunidad de cubrir el ' + ob.carta, 'aviso');
      if(FX.sound) FX.sound.play('uh', { force: true });
    } else if(!ob && oa){
      FX.toast('Pila cubierta', 'jump');
    }

    // ya hay quien parte
    if(prev.phase === 'eligiendo' && s.phase === 'play'){
      FX.banner(s.yourTurn ? 'Partes tú' : 'Parte ' + (s.turnName || ''));
    }

    // turno
    if(s.phase === 'play' && s.yourTurn && !prev.yourTurn){
      FX.banner('Te toca');
      FX.tituloAviso('▶ Tu turno');
      if(FX.sound) FX.sound.play('turno');
    }

    // fin
    if(s.phase === 'over' && prev.phase !== 'over' && s.over){
      setTimeout(function(){
        FX.finale(s.over.won, s.over);
        if(FX.sound) FX.sound.play(s.over.won ? 'victoria' : 'derrota');
      }, 350);
    }

    // lo que acaba de llegar al chat: avisos con popup, frases con sonido y voz
    s.chat.forEach(function(m){
      if(m.id <= prev.chatId) return;

      if(m.tipo === 'aviso'){
        var mio = estado.you && m.autor === estado.you.id;
        if(mio){
          FX.toast('Aviso enviado al equipo', 'aviso');
        } else {
          FX.avisoPopup(m, pilaEl(m.pila));
          if(FX.sound) FX.sound.play('turno', { haptic: true });
        }
        return;
      }

      if(m.tipo === 'texto'){
        if(m.voz || m.efecto) avisarSonido(false);
        if(m.efecto && FX.sound) FX.sound.play(m.efecto, { force: true });
        if(m.efecto === 'bum' && FX.chispas) FX.chispas($('side-panel'));
        if(m.efecto === 'tada' && FX.chispas) FX.chispas($('side-panel'), 'fiesta');
        // la voz entra después del efecto, para que no se pisen
        if(m.voz && FX.hablar){
          setTimeout(function(){ FX.hablar(m.voz); }, m.efecto ? 430 : 80);
        }
      }
    });
  }

  function idDelTurno(nombre){
    var p = estado.players.filter(function(x){ return x.name === nombre; })[0];
    return p ? p.id : null;
  }
  function nombreDe(id){
    var p = estado.players.filter(function(x){ return x.id === id; })[0];
    return p ? p.name : 'Alguien';
  }

  /* ============================================================ pintado */
  function pintar(){
    if(!estado) return;
    var prev = previo;

    // las pilas que reciben carta retienen su número hasta que ésta aterrice
    if(prev) for(var i = 0; i < 4; i++){
      if(estado.piles[i].count > prev.piles[i].count) FX.reservar(i);
    }

    pintarCabecera();
    pintarPilas();
    pintarRoster();
    pintarMano();
    pintarChat();
    pintarLog();
    if(!$('modal-room').classList.contains('hidden')) pintarSala();

    var fin = estado.phase === 'over';
    if(fin && (!prev || prev.phase !== 'over')){ pintarFin(); abrirModal('modal-over'); }
    else if(fin) pintarBotonesFin();
    if(!fin) cerrarModal('modal-over');

    // mientras se elige quien parte, el popup manda; se cierra solo al decidir.
    // 'decidiendo' es el pestillo local: entre el clic y la respuesta del
    // servidor pueden llegar otros estados, y sin él el popup reaparecía.
    if(estado.phase !== 'eligiendo') decidiendo = false;
    if(estado.phase === 'eligiendo' && estado.puedoPartir && !estado.yaPase && !decidiendo){
      pintarPartir();
      abrirModal('modal-partir');
    } else cerrarModal('modal-partir');

    previo = instantanea(estado);
    efectos(prev, estado);
  }

  /* ============================================================ interfaz */
  window.abrirModal = function(id){
    var m = $(id);
    m.classList.remove('hidden');
    if(id === 'modal-room' && estado) pintarSala();
  };
  window.cerrarModal = function(id){ $(id).classList.add('hidden'); };

  // abre o cierra la hoja del chat en celular; sin argumento, alterna
  window.togglePanel = function(abrir){
    var p = $('side-panel');
    if(typeof abrir !== 'boolean') abrir = !p.classList.contains('abierto');
    p.classList.toggle('abierto', abrir);
    document.body.classList.toggle('chat-abierto', abrir);
    $('chat-fab').setAttribute('aria-expanded', abrir ? 'true' : 'false');
    if(!abrir) return;
    $('chat-avisos').innerHTML = '';
    if(pestana === 'chat'){
      leido();
      var c = $('chat-messages'); c.scrollTop = c.scrollHeight;
    }
  };
  document.addEventListener('keydown', function(ev){
    if(ev.key === 'Escape' && $('side-panel').classList.contains('abierto')) togglePanel(false);
  });
  // si la ventana crece a escritorio con la hoja abierta, se suelta el bloqueo del scroll
  var alCambiarAncho = function(){ if(!movil.matches) togglePanel(false); };
  if(movil.addEventListener) movil.addEventListener('change', alCambiarAncho);

  function verPestana(cual){
    pestana = cual;
    $('tab-chat').classList.toggle('hidden', cual !== 'chat');
    $('tab-chat').classList.toggle('flex', cual === 'chat');
    $('tab-log').classList.toggle('hidden', cual !== 'log');
    $('tab-log').classList.toggle('flex', cual === 'log');
    Array.prototype.forEach.call(document.querySelectorAll('.tab-btn'), function(b){
      var on = b.dataset.tab === cual;
      b.className = 'tab-btn px-3 py-1.5 rounded-lg text-xs font-bold transition ' +
        (on ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200');
    });
    if(cual === 'chat'){
      if(chatAbierto()) leido();
      var c = $('chat-messages'); c.scrollTop = c.scrollHeight;
    } else {
      var l = $('log-list'); l.scrollTop = l.scrollHeight;
    }
  }

  /* Frases rápidas. `t` es lo que se escribe en el chat; `v` es lo mismo pero
     escrito fonético, para que la voz del navegador lo pronuncie como se dice
     acá y no lo lea raro. `fx` es el efecto de sonido que lo acompaña. */
  var FRASES = [
    { e:'✋',  l:'No jueguen ahí',  t:'No jueguen ahí po',                 v:'no jueguen ahí po' },
    { e:'✨',  l:'Tengo salto',     t:'Tengo salto, espérenme',            v:'tengo salto, espérenme' },
    { e:'🙏',  l:'Déjenme esa',     t:'Déjenme esa pila po',               v:'déjenme esa pila po' },
    { e:'👍',  l:'Dale nomás',      t:'Ya po, dale nomás',                 v:'ya po, dale nomás' },
    { e:'⏰',  l:'Ya po, juega',    t:'Ya po hermano, juega la wea',       v:'ya po hermano, juega la güeá',   tono:'apuro' },
    { e:'😤',  l:'Quién revolvió',  t:'¿Quién chucha revolvió??',          v:'quién chucha revolvió',          tono:'apuro' },
    { e:'🐌',  l:'Se durmió',       t:'Oe, este qlo se durmió',            v:'oe, este culiao se durmió',      tono:'apuro' },
    { e:'🃏',  l:'Tira todo',       t:'Yaaaa tira todo entonces po weea',  v:'yaaa, tira todo entonces po güeá', tono:'apuro' },
    { e:'🔥',  l:'¡Bum!',           t:'¡Bum! Qué wena jugada',             v:'qué güena jugada',    fx:'bum',      tono:'fuego' },
    { e:'🙌',  l:'La wea wena',     t:'Yaaaa la wea wena',                 v:'yaaa, la güeá güena', fx:'tada',     tono:'fuego' },
    { e:'👏',  l:'Bravo',           t:'Bravo maestro',                     v:'bravo maestro',       fx:'aplausos', tono:'fuego' },
    { e:'💪',  l:'Vamos',           t:'¡Vamo que se puede loco!',          v:'vamo que se puede loco',            tono:'fuego' },
    { e:'🤖',  l:'Soy una máquina', t:'¡Soy una máquina!',                 v:'soy una máquina',   fx:'tada',   tono:'fuego' },
    { e:'😬',  l:'Uuuh',            t:'Uuuh, nos fuimos a la cresta',      v:'nos fuimos a la cresta', fx:'uh',    tono:'frio' },
    { e:'👻',  l:'Buuu',            t:'Buuu 👻',                           v:'buuu',                fx:'uh',       tono:'frio' }
  ];

  var TONOS = {
    base:  'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700',
    apuro: 'bg-amber-950/60 hover:bg-amber-900 text-amber-200 border-amber-600/50',
    fuego: 'bg-orange-950/60 hover:bg-orange-900 text-orange-200 border-orange-600/50',
    frio:  'bg-cyan-950/60 hover:bg-cyan-900 text-cyan-200 border-cyan-700/50'
  };

  // El sonido nace apagado (esto es una oficina). Si alguien aprieta una frase
  // con voz y no escucha nada, hay que decirle por que.
  var avisadoSonido = false;
  function avisarSonido(insistir){
    if(!FX.sound || FX.sound.enabled()) return;
    if(avisadoSonido && !insistir) return;
    avisadoSonido = true;
    FX.toast('El sonido esta apagado. Enciendelo con el boton de arriba a la derecha.', 'jump');
    var b = $('btn-sound');
    if(b){
      b.classList.remove('fx-snd-beat');
      void b.offsetWidth;
      b.classList.add('fx-snd-beat');
      setTimeout(function(){ b.classList.remove('fx-snd-beat'); }, 500);
    }
  }

  function montarFrases(){
    var cont = $('frases');
    FRASES.forEach(function(f){
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'text-[11px] px-2.5 py-1 rounded-full border whitespace-nowrap transition ' +
        'active:scale-95 shrink-0 ' + (TONOS[f.tono] || TONOS.base);
      b.textContent = f.e + ' ' + f.l;
      b.title = f.t + (f.fx ? ' (con sonido)' : '');
      b.onclick = function(){
        if(f.v || f.fx) avisarSonido(true);
        enviar('chat', { texto: f.t, voz: f.v, hablar: true, efecto: f.fx || null });
      };
      cont.appendChild(b);
    });
  }

  /* ============================================================ eventos */
  /* orden y disposicion de la mano */
  function opsMano(attr){
    return Array.prototype.slice.call(document.querySelectorAll('#mano-ops [data-' + attr + ']'));
  }
  function pintarOpsMano(){
    opsMano('orden').forEach(function(b){
      b.setAttribute('aria-pressed', b.dataset.orden === manoOrden ? 'true' : 'false');
    });
    opsMano('vista').forEach(function(b){
      b.setAttribute('aria-pressed', b.dataset.vista === manoVista ? 'true' : 'false');
    });
  }
  opsMano('orden').forEach(function(b){
    b.onclick = function(){
      manoOrden = b.dataset.orden;
      try { localStorage.setItem(LS_ORDEN, manoOrden); } catch(e){}
      pintarOpsMano();
      if(estado) pintarMano();
    };
  });
  opsMano('vista').forEach(function(b){
    b.onclick = function(){
      manoVista = b.dataset.vista;
      try { localStorage.setItem(LS_VISTA, manoVista); } catch(e){}
      pintarOpsMano();
      if(estado) pintarMano();
    };
  });
  pintarOpsMano();

  $('btn-end').onclick = function(){ elegida = null; enviar('end'); };
  $('btn-undo').onclick = function(){ elegida = null; enviar('undo'); };
  $('btn-deal').onclick = function(){ elegida = null; enviar('start'); };
  $('btn-deal2').onclick = function(){ elegida = null; cerrarModal('modal-room'); enviar('start'); };
  $('btn-reset').onclick = function(){
    if(confirm('Esto bota la partida en curso y devuelve a todos a la sala. ¿Seguro?')){
      cerrarModal('modal-room');
      enviar('reset');
    }
  };
  $('btn-again').onclick = function(){
    cerrarModal('modal-over');
    if(estado && estado.soyAdmin) enviar('reset');
  };
  // el modal se cierra solo cuando llega el reparto nuevo
  $('btn-revancha').onclick = function(){ elegida = null; enviar('revancha'); };

  Array.prototype.forEach.call(document.querySelectorAll('.modo-pill'), function(b){
    b.onclick = function(){
      if(b.disabled) return;
      enviar('modo', { modo: b.dataset.modo });
    };
  });

  function cambiarNick(){
    var n = ($('in-nick').value || '').trim();
    if(!n || (estado && estado.you && n === estado.you.name)) return;
    enviar('rename', { name: n }).then(function(){
      // el nombre también se guarda para la próxima vez que entres
      if(sesion){ sesion.name = n; guardarSesion(sesion); }
    });
  }
  $('btn-nick').onclick = cambiarNick;
  $('in-nick').onkeydown = function(ev){ if(ev.key === 'Enter') cambiarNick(); };

  $('btn-partir').onclick = function(){ enviar('partir'); };
  $('btn-partir-si').onclick = function(){ decidiendo = true; cerrarModal('modal-partir'); enviar('partir'); };
  $('btn-paso').onclick = function(){ decidiendo = true; cerrarModal('modal-partir'); enviar('paso'); };

  $('btn-salir').onclick = function(){
    var enJuego = estado && estado.phase === 'play';
    var aviso = enJuego
      ? 'Vas a salirte de la mesa. Tus cartas vuelven al mazo y los demás siguen jugando. ¿Seguro?'
      : '¿Salirte de la sala?';
    if(!window.confirm(aviso)) return;
    cerrarModal('modal-room');
    enviar('leave').then(function(){
      if(sesion) borrarSesion(sesion.room);
      setTimeout(function(){ location.reload(); }, 300);
    });
  };

  $('btn-pin').onclick = function(){
    var actual = estado && estado.pin ? estado.pin : '';
    var nuevo = window.prompt('PIN de la sala (déjalo vacío para quitarlo):', actual);
    if(nuevo === null) return;
    enviar('pin', { pin: nuevo.trim() });
  };

  $('btn-copy').onclick = function(){
    var b = $('btn-copy');
    var url = $('room-url').value;
    var listo = function(){ b.textContent = 'Copiado'; setTimeout(function(){ b.textContent = 'Copiar'; }, 1600); };
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(url).then(listo, function(){ $('room-url').select(); });
    } else { $('room-url').select(); }
  };

  $('chat-form').onsubmit = function(ev){
    ev.preventDefault();
    var i = $('chat-input');
    var t = i.value.trim();
    if(!t) return;
    enviar('chat', { texto: t });
    i.value = '';
    $('chat-warn').classList.add('hidden');
  };

  $('chat-input').oninput = function(){
    var w = $('chat-warn');
    if(/\d/.test(this.value)){
      w.textContent = '🤫 Ojo: la regla es no decir números exactos.';
      w.classList.remove('hidden');
    } else {
      w.classList.add('hidden');
    }
  };

  Array.prototype.forEach.call(document.querySelectorAll('.tab-btn'), function(b){
    b.onclick = function(){ verPestana(b.dataset.tab); };
  });

  document.addEventListener('keydown', function(ev){
    if(ev.target && /^(INPUT|TEXTAREA)$/.test(ev.target.tagName)) return;
    if(ev.key === 'Escape'){
      ['modal-rules','modal-room','modal-mazo'].forEach(cerrarModal);
      if(elegida !== null){ elegida = null; pintarMano(); pintarPilas(); }
      return;
    }
    // un botón con el foco ya recibe su propio clic con Enter/Espacio: si el
    // atajo también dispara, apretar "Paso" terminaba partiendo la partida
    if(ev.target && ev.target.tagName === 'BUTTON') return;
    if(estado && estado.phase === 'eligiendo' && (ev.key === 'Enter' || ev.key === ' ')){
      if(estado.puedoPartir && !estado.yaPase && !decidiendo){ decidiendo = true; enviar('partir'); }
      return;
    }
    if(!estado || !estado.yourTurn) return;
    if(ev.key === 'Enter' && !$('btn-end').disabled){ elegida = null; enviar('end'); return; }
    if(elegida !== null && ev.key >= '1' && ev.key <= '4'){
      var i = Number(ev.key) - 1;
      if(puedeJugar(elegida, estado.piles[i])){
        origenJugada = FX.rect(document.querySelector('.card-hand.sel'));
        var v = elegida; elegida = null;
        enviar('play', { card: v, pile: i });
      }
    }
  });

  /* ============================================================ entrar */
  function entrar(){
    var nombre = $('in-name').value.trim();
    var sala = ($('in-room').value || 'MESA').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || 'MESA';
    if(!nombre){ $('join-err').textContent = 'Escribe tu nombre para entrar.'; $('in-name').focus(); return; }
    $('join-err').textContent = '';
    $('btn-join').disabled = true;

    // Solo se recupera el asiento si vuelves con el mismo nombre; si escribes
    // otro, entras como jugador nuevo en vez de renombrar al anterior.
    var previa = leerSesion(sala);
    var mismo = previa && previa.name === nombre;
    api('/api/join', {
      room: sala, name: nombre,
      pin: ($('in-pin').value || '').trim(),
      id: mismo ? previa.id : null,
      token: mismo ? previa.token : null
    }).then(function(r){
      sesion = { id: r.id, token: r.token, room: r.room, name: nombre };
      guardarSesion(sesion);
      try {
        var u = new URL(location.href);
        u.searchParams.set('sala', r.room);
        history.replaceState(null, '', u);
      } catch(e){}
      cerrarModal('modal-join');
      conectar();
    }).catch(function(err){
      $('join-err').textContent = err.message || 'No se pudo entrar.';
      if(/PIN|intentos/i.test(err.message || '')){ $('in-pin').focus(); $('in-pin').select(); }
    }).then(function(){ $('btn-join').disabled = false; });
  }

  // Mientras escribes la sala, el servidor dice si ya existe y si pide PIN.
  var consulta = null;
  function mirarSala(){
    var sala = ($('in-room').value || 'MESA').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || 'MESA';
    clearTimeout(consulta);
    consulta = setTimeout(function(){
      fetch('/api/sala?room=' + encodeURIComponent(sala))
        .then(function(r){ return r.json(); })
        .then(function(d){
          var hint = $('room-hint'), pin = $('pin-hint'), nota = $('pin-nota');
          if(!d.existe){
            hint.textContent = 'Sala nueva: la creas tú y quedas de administrador.';
            pin.textContent = '(opcional)';
            nota.textContent = 'Si vas a compartir el juego fuera de la oficina, ponle uno.';
            $('in-pin').placeholder = 'sin PIN';
          } else if(d.conPin){
            hint.textContent = 'Sala con ' + d.jugadores + (d.jugadores === 1 ? ' jugador' : ' jugadores') +
              (d.enJuego ? ', partida en curso.' : '.');
            pin.textContent = '(esta sala pide PIN)';
            nota.textContent = 'Pídeselo a quien la creó.';
            $('in-pin').placeholder = '••••';
          } else {
            hint.textContent = 'Sala con ' + d.jugadores + (d.jugadores === 1 ? ' jugador' : ' jugadores') +
              (d.enJuego ? ', partida en curso.' : '.');
            pin.textContent = '(esta sala no pide PIN)';
            nota.textContent = 'Déjalo vacío.';
            $('in-pin').placeholder = 'sin PIN';
          }
        }).catch(function(){});
    }, 250);
  }
  $('in-room').addEventListener('input', mirarSala);

  $('btn-join').onclick = entrar;
  $('in-name').onkeydown = function(ev){ if(ev.key === 'Enter') entrar(); };
  $('in-room').onkeydown = function(ev){ if(ev.key === 'Enter') entrar(); };
  $('in-pin').onkeydown = function(ev){ if(ev.key === 'Enter') entrar(); };

  /* ============================================================ arranque */
  FX.alAterrizar = function(){ if(estado) pintarPilas(); };

  // El mazo es de cada jugador: al cambiarlo se repinta su propia mesa.
  window.alCambiarMazo = function(){
    var b = $('btn-mazo-emoji');
    if(b) b.textContent = MAZOS.emoji();

    // el tapete del mazo, si trae uno
    var tapete = $('mesa-tapete');
    var img = MAZOS.playmat();
    tapete.style.setProperty('--tapete', img ? 'url("' + img + '")' : 'none');
    tapete.classList.toggle('con-tapete', !!img);

    if(!estado) return;
    $('hand').innerHTML = '';     // las caras las dibuja el mazo nuevo
    pintarMano();
    pintarPilas();
    if(!$('modal-partir').classList.contains('hidden')) pintarPartir();
  };

  /* ============================================================ service worker
     Guarda la app y el arte para que abra al tiro. Solo corre en https o en
     localhost: por la IP de la oficina (http) el navegador no lo permite, y
     el juego anda igual, sin caché propia. */
  function registrarSW(){
    if(!('serviceWorker' in navigator)) return;
    var seguro = location.protocol === 'https:' ||
                 location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if(!seguro) return;

    var habiaUno = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', function(){
      if(!habiaUno){ habiaUno = true; return; }    // primera instalación: nada que avisar
      // sin partida andando se recarga solo; jugando, se pregunta
      if(!sesion || !estado || estado.phase !== 'play'){ location.reload(); return; }
      avisarVersion();
    });

    navigator.serviceWorker.register('/sw.js').then(function(reg){
      // las partidas son largas: cada media hora se mira si hay versión nueva
      setInterval(function(){ reg.update().catch(function(){}); }, 30 * 60 * 1000);
    }).catch(function(){ /* sin service worker se juega igual */ });
  }

  function avisarVersion(){
    if($('aviso-version')) return;
    var el = document.createElement('div');
    el.id = 'aviso-version';
    el.setAttribute('role', 'status');
    el.innerHTML = '<span>✨ Hay una versión nueva del juego.</span>' +
      '<button type="button">Actualizar</button>';
    el.querySelector('button').onclick = function(){ location.reload(); };
    document.body.appendChild(el);
  }

  registrarSW();
  crearPilas();
  montarFrases();
  MAZOS.construirSelector($('mazos'));
  // cuando llegan los mazos con carpeta propia, el selector se rehace
  window.alRegistrarMazos = function(){ MAZOS.construirSelector($('mazos')); };
  $('btn-mazo-emoji').textContent = MAZOS.emoji();
  verPestana('chat');

  (function arrancar(){
    var sala = salaDeUrl();
    var guardada = leerSesion(sala);
    $('in-room').value = sala;
    $('in-name').value = (guardada && guardada.name) || nombreRecordado();
    mirarSala();

    if(guardada && guardada.id && guardada.token){
      // el servidor se pudo haber reiniciado: valida antes de abrir el stream
      api('/api/sesion', { room: sala, id: guardada.id, token: guardada.token })
        .then(function(){
          sesion = guardada;
          cerrarModal('modal-join');
          conectar();
        })
        .catch(function(){
          borrarSesion(sala);
          abrirModal('modal-join');
          $('in-name').focus();
        });
    } else {
      abrirModal('modal-join');
      $('in-name').focus();
    }
  })();
})();
