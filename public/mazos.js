/* ==========================================================================
   Mazos. Cada uno es una identidad completa: cambia la mesa, los montones,
   las cartas y el tono de la interfaz. La elección es de cada jugador y vive
   en su navegador: no viaja al servidor ni afecta a los demás.

   Un mazo con arte propio se define solo, sin tocar código: basta una carpeta
   en public/assets/mazos/<id>/ con su palette.json. Ese archivo manda sobre
   todo — nombre, imágenes, colores, tipografía y dónde va cada número.
   ========================================================================== */
window.MAZOS = (function(){
  'use strict';

  var LS = 'thegame.mazo';
  var actual = 'warlock';
  var assets = {};                                     // lo que hay en disco, según el servidor
  var ctx = { modo: 'clasico', dobles: [22, 33, 44, 55, 66, 77, 88] };

  function esc(s){
    return String(s).replace(/[&<>"']/g, function(c){
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c];
    });
  }

  /* --------------------------------------------------- palos españoles */
  var SVG_ESP = {
    oro:    '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="3.4" fill="currentColor"/>',
    copa:   '<path d="M7 4h10l-1.2 5.2a3.8 3.8 0 0 1-7.6 0Z" fill="currentColor"/><path d="M12 13v4M8.5 20h7" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/>',
    espada: '<path d="M12 2.5 14 8v8h-4V8Z" fill="currentColor"/><path d="M7.5 17h9M12 17v4" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/>',
    basto:  '<path d="M8 20 17 5" stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M13 7l3-3M15 11l3-3" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/>'
  };
  var ORDEN_ESP = ['oro', 'copa', 'espada', 'basto'];
  var NOMBRE_ESP = { oro:'OROS', copa:'COPAS', espada:'ESPADAS', basto:'BASTOS' };
  function palo(v){ return ORDEN_ESP[v % 4]; }
  function svg(paths, clase){
    return '<svg class="' + clase + '" viewBox="0 0 24 24" fill="none" aria-hidden="true">' + paths + '</svg>';
  }

  var PAL_WARLOCK = ['ALQUIMIA','CRISOL','RUNA','RELICARIO','ORÁCULO','VÓRTICE','ÁMBAR','ECLIPSE',
                     'TÓTEM','CENIZA','QUIMERA','OBSIDIANA','AUGURIO','CÁLIZ','ESPIRAL','FÉNIX',
                     'GRIMORIO','MAREA','NÉCTAR','UMBRAL'];
  /* ===================================================== mazos dibujados
     Son mazos por sí mismos y además el respaldo de los que tienen arte:
     si una imagen no carga, la carta se sigue leyendo. */
  var MAZOS = [
    {
      id: 'warlock', nombre: 'Warlock', emoji: '🔮', desc: 'Runas y alquimia',
      carta: function(v){
        var p = ['♠','♣','♥','♦'][v % 4];
        var w = PAL_WARLOCK[v % PAL_WARLOCK.length];
        return '<div class="absolute top-1 left-1.5 text-[8px] esq opacity-60">✦</div>' +
               '<div class="absolute bottom-1 right-1.5 text-[8px] esq opacity-60">✦</div>' +
               '<div class="flex items-center justify-between leading-none relative z-10">' +
                 '<span class="text-xs sm:text-sm font-black esq">' + v + '</span>' +
                 '<span class="text-xs esq">' + p + '</span>' +
               '</div>' +
               '<div class="relative z-10 my-auto text-center flex flex-col items-center">' +
                 '<span class="num text-2xl sm:text-4xl font-black tracking-tighter">' + v + '</span>' +
                 '<span class="sub text-[8px] sm:text-[9px] tracking-widest uppercase mt-0.5">' + w + '</span>' +
               '</div>' +
               '<div class="flex items-center justify-between leading-none self-end w-full relative z-10">' +
                 '<span class="text-xs esq">' + p + '</span>' +
                 '<span class="text-xs sm:text-sm font-black esq">' + v + '</span>' +
               '</div>';
      }
    },
    {
      id: 'original', nombre: 'Original', emoji: '🂠', desc: 'Cartón y número, nada más',
      carta: function(v){
        return '<div class="flex items-start justify-between leading-none relative z-10">' +
                 '<span class="text-[11px] sm:text-xs font-bold esq">' + v + '</span>' +
               '</div>' +
               '<div class="relative z-10 my-auto text-center">' +
                 '<span class="num text-3xl sm:text-5xl font-black tracking-tight">' + v + '</span>' +
               '</div>' +
               '<div class="flex items-end justify-end leading-none w-full relative z-10">' +
                 '<span class="text-[11px] sm:text-xs font-bold esq rotate-180">' + v + '</span>' +
               '</div>';
      }
    },
    {
      id: 'espanol', nombre: 'Español', emoji: '🗡️', desc: 'Oros, copas, espadas y bastos',
      carta: function(v){
        var s = palo(v);
        var icono = svg(SVG_ESP[s], 'w-3.5 h-3.5 sm:w-4 sm:h-4');
        var grande = svg(SVG_ESP[s], 'w-5 h-5 sm:w-7 sm:h-7 opacity-80');
        return '<div class="absolute inset-1 rounded-[5px] border pointer-events-none" style="border-color:var(--carta-esq);opacity:.35"></div>' +
               '<div class="flex items-center justify-between leading-none relative z-10">' +
                 '<span class="text-xs sm:text-sm font-black esq">' + v + '</span>' +
                 '<span class="esq">' + icono + '</span>' +
               '</div>' +
               '<div class="relative z-10 my-auto text-center flex flex-col items-center gap-0.5">' +
                 '<span class="esq">' + grande + '</span>' +
                 '<span class="num text-2xl sm:text-4xl font-black tracking-tight leading-none">' + v + '</span>' +
                 '<span class="sub text-[8px] sm:text-[9px] tracking-[.2em] uppercase">' + NOMBRE_ESP[s] + '</span>' +
               '</div>' +
               '<div class="flex items-center justify-between leading-none self-end w-full relative z-10">' +
                 '<span class="esq">' + icono + '</span>' +
                 '<span class="text-xs sm:text-sm font-black esq">' + v + '</span>' +
               '</div>';
      }
    }
  ];

  var porId = {};
  MAZOS.forEach(function(m){ porId[m.id] = m; });

  /* ================================================== lectura de palette.json */

  function spec(id){ return (assets[id] || {}).palette || null; }

  function esDura(v){
    var p = spec(actual);
    var lista = (p && p.hardCards) || ctx.dobles;
    return ctx.modo === 'duro' && lista.indexOf(v) !== -1;
  }

  // el archivo de la cáscara, según el JSON o, si no lo dice, lo que haya en disco
  function cascara(id, dura){
    var d = assets[id] || {};
    var a = (d.palette && d.palette.assets) || {};
    var sh = d.shell || {};
    return dura ? (a.hard || sh.duro || a.normal || sh.normal)
                : (a.normal || sh.normal);
  }

  function rutaTapete(id){
    var d = assets[id] || {};
    var a = (d.palette && d.palette.assets) || {};
    var f = a.playmat || d.playmat;
    return f ? '/assets/mazos/' + id + '/' + f : null;
  }

  // qué punto del texto se apoya en (xPercent, yPercent)
  var EJE_X = { left:0, start:0, center:-50, centre:-50, middle:-50, right:-100, end:-100 };
  var EJE_Y = { top:0, hanging:0, middle:-50, center:-50, central:-50,
                alphabetic:-50, bottom:-100, ideographic:-100 };

  var ANCLAS = {
    'center':        'translate(-50%,-50%)',
    'top-left':      'translate(0,0)',
    'top-right':     'translate(-100%,0)',
    'bottom-left':   'translate(0,-100%)',
    'bottom-right':  'translate(-100%,-100%)',
    'top-center':    'translate(-50%,0)',
    'bottom-center': 'translate(-50%,-100%)'
  };

  /*
   * Un número dibujado sobre la cáscara. Las medidas del JSON vienen en
   * porcentaje de la carta, así que se usan unidades de contenedor (cqh):
   * el número queda igual de proporcionado en el celular que en pantalla grande.
   */
  /* Donde se apoya el texto: el 'anchor' del esquema propio, o el par
     align/baseline de los palette.json generados. Por omision, centrado. */
  function apoyo(pos){
    if(pos.anchor && ANCLAS[pos.anchor]) return ANCLAS[pos.anchor];
    var x = EJE_X[String(pos.align || 'center').toLowerCase()];
    var y = EJE_Y[String(pos.baseline || 'middle').toLowerCase()];
    return 'translate(' + (x == null ? -50 : x) + '%,' + (y == null ? -50 : y) + '%)';
  }

  function numero(v, pos, capa, clase){
    var mover = apoyo(pos);
    var giro = pos.rotationDeg ? ' rotate(' + pos.rotationDeg + 'deg)' : '';
    var e = [];
    e.push('left:' + (pos.xPercent == null ? 50 : pos.xPercent) + '%');
    e.push('top:' + (pos.yPercent == null ? 50 : pos.yPercent) + '%');
    e.push('transform:' + mover + giro);
    e.push('font-size:' + (pos.fontSizePercentOfHeight || 28) + 'cqh');
    if(pos.maxWidthPercent) e.push('max-width:' + pos.maxWidthPercent + '%');
    if(capa.fontFamily)    e.push('font-family:' + capa.fontFamily);
    if(capa.fontWeight)    e.push('font-weight:' + capa.fontWeight);
    if(capa.fontStyle)     e.push('font-style:' + capa.fontStyle);
    if(capa.letterSpacing) e.push('letter-spacing:' + capa.letterSpacing);
    if(capa.lineHeight)    e.push('line-height:' + capa.lineHeight);
    if(capa.color)         e.push('color:' + capa.color);
    if(capa.shadow)        e.push('text-shadow:' + capa.shadow);
    if(capa.strokeColor && capa.strokeWidth){
      e.push('-webkit-text-stroke:' + capa.strokeWidth + ' ' + capa.strokeColor);
    }
    if(capa.blendMode && capa.blendMode !== 'normal') e.push('mix-blend-mode:' + capa.blendMode);
    return '<span class="' + clase + '" style="' + e.join(';') + '">' + v + '</span>';
  }

  /* El marco del mazo con los números puestos donde dice el JSON. */
  function caraConCascara(id, v, dura, base){
    var p = spec(id) || {};
    var c = p.card || {};
    var capa = c.numberLayer || {};
    if(dura && c.hardNumberLayer){
      var mezcla = {};
      for(var k in capa) mezcla[k] = capa[k];
      for(var k2 in c.hardNumberLayer) mezcla[k2] = c.hardNumberLayer[k2];
      capa = mezcla;
    }

    var principal = c.mainNumber ||
      { anchor:'center', xPercent:50, yPercent:52, fontSizePercentOfHeight:29 };
    var esquinas = c.cornerNumbers || [];

    var html = (base || '') +
      '<img class="carta-img cascara" src="/assets/mazos/' + id + '/' + cascara(id, dura) +
      '" alt="" draggable="false">' +
      '<span class="carta-capa">' + numero(v, principal, capa, 'num');
    for(var i = 0; i < esquinas.length; i++) html += numero(v, esquinas[i], capa, 'esq');
    return html + '</span>';
  }

  /* --------------------------------------------------- arte por carta suelta */
  function rutaCarta(id, v){
    var a = assets[id];
    if(!a || !a.cards) return null;
    var grupos = [];
    if(esDura(v)) grupos = ['duro', 'dobles-duro', 'hard'];
    else if(ctx.dobles.indexOf(v) !== -1) grupos = ['clasico', 'dobles-clasico'];
    grupos.push('normal');
    for(var i = 0; i < grupos.length; i++){
      var g = a.cards[grupos[i]];
      if(g && g[v]) return '/assets/mazos/' + id + '/cards/' + grupos[i] + '/' + g[v];
    }
    return null;
  }

  function caraConImagen(src, v, base){
    return (base || '') +
           '<img class="carta-img" src="' + src + '" alt="" draggable="false">' +
           '<span class="carta-capa">' +
             '<span class="esq" style="left:11%;top:9%;transform:translate(0,0);font-size:8.5cqh">' + v + '</span>' +
             '<span class="num" style="left:50%;top:52%;transform:translate(-50%,-50%);font-size:29cqh">' + v + '</span>' +
             '<span class="esq" style="left:89%;top:91%;transform:translate(-100%,-100%);font-size:8.5cqh">' + v + '</span>' +
           '</span>';
  }

  /* Algunos palette.json describen el numero en otro nivel y con otros nombres
     (numberLayer arriba del todo, numberPlacement.main, corners[].name). Se
     lleva todo al mismo formato para leerlo en un solo lugar. */
  function normalizar(p){
    // Un palette.json mal formado no puede tumbar el registro de los demas
    // mazos: el .catch de arrancar() se traga la excepcion y no queda ninguno.
    if(!p || typeof p !== 'object' || Array.isArray(p)) return p;
    var c = p.card = (p.card && typeof p.card === 'object') ? p.card : {};
    if(!c.numberLayer && p.numberLayer) c.numberLayer = p.numberLayer;
    if(!c.hardNumberLayer && p.hardNumberLayer) c.hardNumberLayer = p.hardNumberLayer;

    var np = (p.numberPlacement && typeof p.numberPlacement === 'object') ? p.numberPlacement : {};
    var copiar = function(e){
      return {
        anchor: e.anchor, align: e.align, baseline: e.baseline,
        xPercent: e.xPercent,
        yPercent: e.yPercent,
        fontSizePercentOfHeight: e.fontSizePercentOfHeight,
        maxWidthPercent: e.maxWidthPercent,
        rotationDeg: e.rotationDeg
      };
    };
    if(!c.mainNumber && np.main && typeof np.main === 'object') c.mainNumber = copiar(np.main);
    if(!c.cornerNumbers && Array.isArray(np.corners)) c.cornerNumbers = np.corners.map(copiar);
    return p;
  }

  /* ===================================================== paleta a variables CSS */
  var VARS = ['--mesa-bg', '--carta-num', '--carta-esq', '--carta-borde', '--carta-borde-hover',
              '--carta-sel', '--carta-bg', '--carta-grano', '--carta-radio', '--carta-ratio',
              '--acento1', '--acento3', '--tipo-num'];

  function aplicarPaleta(id){
    var raiz = document.documentElement.style;
    VARS.forEach(function(v){ raiz.removeProperty(v); });
    document.documentElement.classList.remove('con-cascara');

    var p = spec(id);
    if(!p) return;
    var pal = p.palette || {};
    var card = p.card || {};

    if(pal.background)      raiz.setProperty('--mesa-bg', pal.background);
    if(pal.number){
      raiz.setProperty('--carta-num', pal.number);
      raiz.setProperty('--carta-esq', pal.number);
    }
    if(pal.normalPrimary){
      raiz.setProperty('--carta-borde-hover', pal.normalPrimary);
      raiz.setProperty('--carta-sel', pal.accent || pal.normalPrimary);
      raiz.setProperty('--acento1', pal.normalPrimary);
    }
    if(pal.accent)          raiz.setProperty('--acento3', pal.accent);
    if(pal.normalSecondary) raiz.setProperty('--carta-bg', pal.normalSecondary);
    if(card.numberLayer && card.numberLayer.fontFamily){
      raiz.setProperty('--tipo-num', card.numberLayer.fontFamily);
    }

    // con cáscara el marco lo trae la imagen: sin bordes ni grano encima
    if(cascara(id, false)){
      document.documentElement.classList.add('con-cascara');
      raiz.setProperty('--carta-grano', 'none');
      raiz.setProperty('--carta-borde', 'transparent');
      raiz.setProperty('--carta-radio', '10px');
      var ar = String(card.aspectRatio || '2:3').split(':');
      if(ar.length === 2) raiz.setProperty('--carta-ratio', ar[0] + '/' + ar[1]);
    }
  }

  /* ===================================================== guardar y aplicar */
  function leer(){
    try { return localStorage.getItem(LS) || 'warlock'; } catch(e){ return 'warlock'; }
  }
  function guardar(id){
    try { localStorage.setItem(LS, id); } catch(e){}
  }

  function aplicar(id, avisar){
    if(!porId[id]) id = MAZOS[0].id;
    actual = id;
    document.documentElement.setAttribute('data-mazo', id);
    aplicarPaleta(id);
    guardar(id);
    if(avisar !== false && typeof window.alCambiarMazo === 'function') window.alCambiarMazo(id);
  }

  /* ===================================================== selector */

  /* La tira de colores sale del propio arte: 'swatches' del palette.json,
     en orden de cuánto pesa cada tono en las imágenes. El de la carta dura
     va al final, separado. Sin swatches se usan los tres de mazos.css. */
  function tonos(p){
    var sw = Array.isArray(p.swatches) ? p.swatches.filter(function(s){
      return s && /^#[0-9a-f]{3,8}$/i.test(s.color);
    }) : [];
    if(!sw.length){
      return '<span class="mazo-tonos" aria-hidden="true"><i class="t1"></i><i class="t2"></i><i class="t3"></i></span>';
    }
    var nombres = sw.map(function(s){ return s.nombre || s.color; }).join(', ');
    return '<span class="mazo-tonos" role="img" aria-label="Paleta: ' + esc(nombres) + '">' +
      sw.map(function(s){
        return '<i' + (s.duro ? ' class="duro"' : '') + ' style="background:' + s.color + '" title="' +
               esc((s.nombre || s.color) + (s.duro ? ' · modo duro' : '')) + '"></i>';
      }).join('') + '</span>';
  }

  function construirSelector(cont, alElegir){
    if(!cont) return;
    cont.innerHTML = '';
    MAZOS.forEach(function(m){
      var b = document.createElement('button');
      b.type = 'button';
      b.dataset.mazo = m.id;
      b.className = 'mazo-op';

      // la ficha se pinta con la paleta de SU mazo; lo que el palette.json
      // no diga se queda con el valor de mazos.css para ese mazo
      var p = spec(m.id) || {};
      var pal = p.palette || {};
      var tipo = ((p.card || {}).numberLayer || {}).fontFamily;
      var est = '';
      if(pal.normalSecondary) est += '--pv-carta:' + pal.normalSecondary + ';';
      if(pal.normalPrimary)   est += '--pv-borde:' + pal.normalPrimary + ';';
      if(pal.hardPrimary)     est += '--pv-dura:' + pal.hardPrimary + ';';
      if(pal.number)          est += '--pv-num:' + pal.number + ';';
      if(tipo)                est += '--pv-tipo:' + tipo + ';';
      if(est) b.setAttribute('style', est);

      // dos caras: la normal y la del modo duro, que es la que cambia
      var cara = function(arte, clase, num){
        return '<span class="mazo-cara ' + clase + '">' +
                 (arte ? '<img src="/assets/mazos/' + m.id + '/' + arte + '" alt="" loading="lazy" decoding="async">'
                       : String(num)) +
               '</span>';
      };
      var tapete = rutaTapete(m.id);

      b.innerHTML =
        '<span class="mazo-escena">' +
          (tapete ? '<span class="mazo-tapete" style="background-image:url(&quot;' + tapete + '&quot;)"></span>' : '') +
          '<span class="mazo-caras">' +
            cara(cascara(m.id, false), '', 7) +
            cara(cascara(m.id, true), 'dura', 88) +
          '</span>' +
          '<span class="mazo-tick" aria-hidden="true">✓</span>' +
        '</span>' +
        '<span class="mazo-txt">' +
          '<span class="mazo-nombre">' + m.emoji + ' ' + esc(m.nombre) + '</span>' +
          '<span class="mazo-desc">' + esc(m.desc || '') + '</span>' +
          tonos(p) +
        '</span>';

      if(m.desc) b.title = m.desc;
      b.addEventListener('click', function(){
        aplicar(m.id);
        marcar(cont);
        leyenda(m.id);
        if(alElegir) alElegir(m.id);
      });
      // al apuntar uno se lee su descripción; al soltarlo vuelve la del elegido
      b.addEventListener('mouseenter', function(){ leyenda(m.id); });
      b.addEventListener('focus', function(){ leyenda(m.id); });
      b.addEventListener('mouseleave', function(){ leyenda(actual); });
      b.addEventListener('blur', function(){ leyenda(actual); });
      cont.appendChild(b);
    });
    marcar(cont);
    leyenda(actual);
  }

  function leyenda(id){
    var el = document.getElementById('mazos-leyenda');
    var m = porId[id];
    if(!el || !m) return;
    el.innerHTML = '<strong>' + m.emoji + ' ' + esc(m.nombre) + '</strong>' +
      (m.desc ? ' · ' + esc(m.desc) : '') + (id === actual ? ' <span class="en-uso">en uso</span>' : '');
  }

  function marcar(cont){
    Array.prototype.forEach.call(cont.querySelectorAll('.mazo-op'), function(b){
      b.classList.toggle('elegido', b.dataset.mazo === actual);
      b.setAttribute('aria-pressed', b.dataset.mazo === actual ? 'true' : 'false');
    });
  }

  /* ===================================================== API */
  return {
    lista: MAZOS,
    get actual(){ return actual; },
    nombre: function(){ return (porId[actual] || MAZOS[0]).nombre; },
    emoji: function(){ return (porId[actual] || MAZOS[0]).emoji; },

    carta: function(v){
      var base = (porId[actual] || MAZOS[0]).carta(v);
      var dura = esDura(v);

      var img = rutaCarta(actual, v);              // arte de esa carta en particular
      if(img) return caraConImagen(img, v, base);

      if(cascara(actual, dura)) return caraConCascara(actual, v, dura, base);

      return base;                                  // el diseño dibujado
    },

    playmat: function(){ return rutaTapete(actual); },
    conImagenes: function(id){ return !!cascara(id || actual, false); },

    // el cliente avisa el modo: hay cáscara distinta para las dobles
    contexto: function(modo, dobles){
      var cambio = (modo && modo !== ctx.modo);
      if(modo) ctx.modo = modo;
      if(dobles && dobles.length) ctx.dobles = dobles;
      return cambio;
    },

    aplicar: aplicar,
    construirSelector: construirSelector,

    arrancar: function(){
      var guardado = leer();
      aplicar(porId[guardado] ? guardado : MAZOS[0].id, false);

      fetch('/api/assets')
        .then(function(r){ return r.json(); })
        .then(function(d){
          assets = d || {};
          Object.keys(assets).forEach(function(id){
            try {
            var p = normalizar(assets[id].palette) || {};
            var m = porId[id];
            if(!m){
              m = { id: id, nombre: id, emoji: '🎴', desc: '', carta: MAZOS[0].carta };
              MAZOS.push(m);
              porId[id] = m;
            }
            if(p.nombre || p.name) m.nombre = p.nombre || p.name;
            if(p.emoji) m.emoji = p.emoji;
            // 'description' es como lo escriben los palette.json generados
            // 'tagline' es la línea corta para la ficha; 'description' suele ser
            // el texto largo con que se generó el arte
            var d = p.tagline || p.desc || p.descripcion || p.description;
            if(d) m.desc = d;
            } catch(e){ /* un mazo torcido se salta; los demas siguen */ }
          });

          aplicar(porId[guardado] ? guardado : actual, false);
          if(typeof window.alRegistrarMazos === 'function') window.alRegistrarMazos();
          if(typeof window.alCambiarMazo === 'function') window.alCambiarMazo(actual);
        })
        .catch(function(){ /* sin assets se juega con los diseños dibujados */ });
    }
  };
})();

MAZOS.arrancar();
