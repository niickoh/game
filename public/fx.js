/* ==========================================================================
   FX · capa de efectos visuales de The Game.
   Vive fuera del pintado: sus nodos cuelgan de #fx y de #fx-canvas, así que
   nada de lo que hace acá se pierde cuando el cliente actualiza la mesa.
   El módulo de sonido (fx-sound.js) se cuelga después como FX.sound.
   ========================================================================== */
window.FX = (function(){
  'use strict';

  var layer = null, canvas = null, ctx = null;
  var particulas = [];
  var raf = 0, ultimo = 0;
  var cola = Promise.resolve();
  var vuelos = {};        // pilas con una carta en el aire: su número espera

  var PALETA = ['#f97316', '#06b6d4', '#fbbf24', '#34d399', '#f43f5e', '#e2e8f0'];

  function reducido(){
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /* ------------------------------------------------ canvas de partículas */
  function medir(){
    if(!canvas) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function tick(t){
    var dt = Math.min((t - (ultimo || t)) / 1000, 0.05);
    ultimo = t;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    for(var i = particulas.length - 1; i >= 0; i--){
      var p = particulas[i];
      p.edad += dt;
      if(p.edad >= p.vida || p.y > window.innerHeight + 60){ particulas.splice(i, 1); continue; }

      var roce = p.roce || 0;
      p.vx *= (1 - roce * dt);
      p.vy = p.vy * (1 - roce * dt) + (p.g || 0) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot = (p.rot || 0) + (p.vrot || 0) * dt;

      var k = p.edad / p.vida;
      var alpha = (p.alpha == null ? 1 : p.alpha) * (k > 0.75 ? (1 - k) / 0.25 : 1);

      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.translate(p.x, p.y);
      if(p.rot) ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if(p.forma === 'circulo'){
        ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2); ctx.fill();
      } else if(p.forma === 'raya'){
        ctx.fillRect(-p.r * 0.3, -p.r * 2.2, p.r * 0.6, p.r * 4.4);
      } else {
        ctx.fillRect(-p.r, -p.r * 0.6, p.r * 2, p.r * 1.2);
      }
      ctx.restore();
    }

    if(particulas.length) raf = requestAnimationFrame(tick);
    else { raf = 0; ultimo = 0; ctx.clearRect(0, 0, window.innerWidth, window.innerHeight); }
  }

  /* ------------------------------------------------------------- utilidades */
  function rect(el){
    if(!el || !el.getBoundingClientRect) return null;
    var r = el.getBoundingClientRect();
    return (r.width || r.height) ? r : null;
  }

  function nodo(el, ms){
    if(!layer || !el) return null;
    layer.appendChild(el);
    var fuera = function(){ if(el.parentNode === layer) layer.removeChild(el); };
    if(ms) setTimeout(fuera, ms);
    else el.addEventListener('animationend', fuera, { once: true });
    el.quitar = fuera;
    return el;
  }

  function div(clase, estilo){
    var d = document.createElement('div');
    if(clase) d.className = clase;
    if(estilo) for(var k in estilo) d.style[k] = estilo[k];
    return d;
  }

  var FX = {
    reducido: reducido,
    rect: rect,
    nodo: nodo,

    init: function(){
      layer = document.getElementById('fx');
      canvas = document.getElementById('fx-canvas');
      if(canvas){
        ctx = canvas.getContext('2d');
        medir();
        window.addEventListener('resize', medir, { passive: true });
      }
      return FX;
    },

    /* Las jugadas de un turno llegan casi juntas: se animan en orden. */
    seq: function(fn, ms){
      cola = cola.then(function(){
        try { fn(); } catch(e){ /* un efecto roto no puede frenar la cola */ }
        return new Promise(function(r){ setTimeout(r, reducido() ? 0 : (ms || 0)); });
      });
      return cola;
    },

    emitir: function(lista){
      if(reducido() || !ctx) return;
      for(var i = 0; i < lista.length && particulas.length < 800; i++){
        var p = lista[i];
        p.edad = 0; p.r = p.r || 3; p.vida = p.vida || 1;
        particulas.push(p);
      }
      if(!raf && particulas.length) raf = requestAnimationFrame(tick);
    },

    limpiar: function(){
      particulas.length = 0;
      if(raf){ cancelAnimationFrame(raf); raf = 0; ultimo = 0; }
      if(ctx) ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    },

    /* ============================================ la carta viaja a la pila
       Mientras una carta va en el aire, la pila NO cambia su número: si no,
       el montón se actualiza antes de que la carta llegue y el vuelo no se
       entiende. El número lo destapa el aterrizaje. */
    enVuelo: function(i){ return !!vuelos[i]; },

    reservar: function(i){
      if(reducido()) return;
      if(vuelos[i]) clearTimeout(vuelos[i]);
      // red de seguridad: si el vuelo no llega a ocurrir, se libera igual
      vuelos[i] = setTimeout(function(){ FX.aterrizar(i); }, 1800);
    },

    aterrizar: function(i){
      if(!vuelos[i]) return;
      clearTimeout(vuelos[i]);
      delete vuelos[i];
      if(FX.alAterrizar) FX.alAterrizar();   // el cliente repinta la pila
    },

    cartaAPila: function(origen, pilaEl, valor, opts){
      opts = opts || {};
      var destino = rect(pilaEl);
      var idx = pilaEl ? Number(pilaEl.dataset.pila) : -1;

      var fin = function(){
        FX.aterrizar(idx);
        FX.recibe(pilaEl);
      };
      if(!destino || reducido() || !layer){ fin(); return; }

      var o = origen || rect(document.getElementById('c-deck')) || {
        left: destino.left, top: destino.top - 140, width: 64, height: 88
      };

      var w = Math.max(50, Math.min(o.width || 64, 88));
      var h = w * 1.36;
      var x0 = o.left + (o.width || w) / 2 - w / 2;
      var y0 = o.top + (o.height || h) / 2 - h / 2;
      var x1 = destino.left + destino.width / 2 - w / 2;
      var y1 = destino.top + destino.height / 2 - h / 2;

      var el = div('fx-carta' + (opts.salto ? ' salto' : ''), {
        width: w + 'px', height: h + 'px',
        left: x0 + 'px', top: y0 + 'px',
        fontSize: Math.round(w * 0.42) + 'px'
      });
      el.innerHTML = '<span class="esq bajo-izq">' + valor + '</span>' +
                     '<span class="centro">' + valor + '</span>' +
                     '<span class="esq alto-der">' + valor + '</span>';
      nodo(el, 1400);

      var dx = x1 - x0, dy = y1 - y0;
      var largo = Math.sqrt(dx * dx + dy * dy);
      // arco: mientras más lejos, más se eleva; un tiro corto casi no curva
      var arco = Math.min(110, largo * 0.22 + 14);
      var giro = (dx > 0 ? 1 : -1) * Math.min(16, largo * 0.05);
      var dur = Math.round(Math.min(620, 230 + largo * 0.55)) * (opts.salto ? 1.15 : 1);

      var anim = el.animate([
        { transform: 'translate(0,0) rotate(0deg) scale(1)', opacity: 1, offset: 0 },
        { transform: 'translate(' + (dx * 0.5) + 'px,' + (dy * 0.5 - arco) + 'px) rotate(' + giro + 'deg) scale(1.1)', opacity: 1, offset: 0.5 },
        { transform: 'translate(' + (dx * 0.92) + 'px,' + (dy * 0.92) + 'px) rotate(' + (giro * 0.2) + 'deg) scale(1.02)', opacity: 1, offset: 0.86 },
        { transform: 'translate(' + dx + 'px,' + dy + 'px) rotate(0deg) scale(.88)', opacity: 0, offset: 1 }
      ], { duration: dur, easing: 'cubic-bezier(.34,.62,.28,1)', fill: 'forwards' });

      anim.onfinish = function(){
        if(el.quitar) el.quitar();
        fin();
      };
      // si la pestaña se oculta, la animación se congela: destapa igual
      setTimeout(function(){ if(vuelos[idx]) fin(); }, dur + 350);
    },

    /* El número de la pila cambia con rodillo, en la dirección de la pila. */
    rodillo: function(numEl, valor, dir){
      if(!numEl) return;
      var actual = numEl.querySelector('span:not(.saliendo)');
      if(actual && actual.textContent === String(valor)) return;

      if(reducido()){
        numEl.innerHTML = '<span>' + valor + '</span>';
        return;
      }

      var sale = dir === 'up' ? 'sale-up' : 'sale-down';
      var entra = dir === 'up' ? 'entra-up' : 'entra-down';

      if(actual){
        actual.className = sale + ' saliendo';
        setTimeout(function(){ if(actual.parentNode === numEl) numEl.removeChild(actual); }, 360);
      }
      var nuevo = document.createElement('span');
      nuevo.className = entra;
      nuevo.textContent = valor;
      numEl.appendChild(nuevo);
    },

    recibe: function(pilaEl){
      if(!pilaEl) return;
      pilaEl.classList.remove('recibe');
      void pilaEl.offsetWidth;
      pilaEl.classList.add('recibe');
      setTimeout(function(){ pilaEl.classList.remove('recibe'); }, 400);
    },

    /* ============================================ el salto de 10 */
    saltoBurst: function(pilaEl, opts){
      opts = opts || {};
      var r = rect(pilaEl);
      if(!r) return;
      var cx = r.left + r.width / 2, cy = r.top + r.height / 2;

      if(!reducido() && layer){
        nodo(div('fx-anillo', { left: cx + 'px', top: cy + 'px' }), 800);
        var marca = div('fx-marca', { left: cx + 'px', top: (cy - r.height * 0.18) + 'px' });
        marca.textContent = opts.dir === 'up' ? '−10' : '+10';
        nodo(marca, 1200);
      }

      // las chispas salen en contra de la dirección de la pila: el salto devuelve terreno
      var hacia = opts.dir === 'up' ? 1 : -1;
      var lista = [];
      for(var i = 0; i < 34; i++){
        var ang = (Math.PI * 2 * i) / 34 + Math.random() * 0.2;
        var vel = 150 + Math.random() * 230;
        lista.push({
          x: cx, y: cy,
          vx: Math.cos(ang) * vel,
          vy: Math.sin(ang) * vel * 0.75 + hacia * 90,
          g: 380 * hacia, roce: 1.3,
          r: 2 + Math.random() * 3.5,
          rot: Math.random() * 6, vrot: (Math.random() - 0.5) * 12,
          vida: 0.75 + Math.random() * 0.5,
          forma: i % 3 === 0 ? 'circulo' : 'raya',
          color: i % 4 === 0 ? '#fde68a' : '#fbbf24'
        });
      }
      FX.emitir(lista);
    },

    /* Chispas para las reacciones del chat: salen del panel si está a la vista,
       y si no del centro de la pantalla. */
    chispas: function(desde, estilo){
      if(reducido() || !ctx) return;
      var r = rect(desde);
      var cx = r ? r.left + r.width / 2 : window.innerWidth / 2;
      var cy = r ? Math.min(r.top + r.height * 0.35, window.innerHeight * 0.6) : window.innerHeight / 2;

      var fiesta = estilo === 'fiesta';
      var colores = fiesta ? PALETA : ['#fb923c', '#fbbf24', '#f87171', '#fde68a'];
      var lista = [];
      for(var i = 0; i < 38; i++){
        var ang = (Math.PI * 2 * i) / 38 + Math.random() * 0.25;
        var vel = (fiesta ? 130 : 190) + Math.random() * 240;
        lista.push({
          x: cx, y: cy,
          vx: Math.cos(ang) * vel,
          vy: Math.sin(ang) * vel - (fiesta ? 120 : 40),
          g: fiesta ? 460 : 620, roce: 1.1,
          r: 2 + Math.random() * 3.6,
          rot: Math.random() * 6, vrot: (Math.random() - 0.5) * 14,
          vida: 0.8 + Math.random() * 0.7,
          forma: i % 3 === 0 ? 'circulo' : 'cuadro',
          color: colores[i % colores.length]
        });
      }
      FX.emitir(lista);
    },

    /* ============================================ avisos y carteles */
    banner: function(texto){
      if(!layer || reducido()) return;
      var el = div('fx-banner');
      el.textContent = texto;
      nodo(el, 2100);
    },

    toast: function(texto, tipo){
      if(!layer) return;
      var caja = document.getElementById('fx-toasts');
      if(!caja){
        caja = div('');
        caja.id = 'fx-toasts';
        layer.appendChild(caja);
      }
      while(caja.children.length >= 3) caja.removeChild(caja.firstChild);
      var el = div('fx-toast' + (tipo ? ' ' + tipo : ''));
      el.textContent = texto;
      caja.appendChild(el);
      setTimeout(function(){ if(el.parentNode === caja) caja.removeChild(el); }, 3200);
    },

    /* Popup de «no jueguen acá»: avisa fuerte y se va solo. No bloquea nada. */
    avisoPopup: function(datos, pilaEl){
      if(!layer) return;
      var anterior = layer.querySelector('.fx-aviso');
      if(anterior && anterior.quitar) anterior.quitar();

      var flecha = datos.dir === 'up' ? '▲' : '▼';
      var cual = (datos.pila % 2 === 0) ? 'izquierda' : 'derecha';
      var grupo = datos.dir === 'up' ? 'que sube' : 'que baja';

      var el = div('fx-aviso');
      el.innerHTML =
        '<div style="font-size:34px;line-height:1;margin-bottom:8px">⛔</div>' +
        '<div style="font-family:Cinzel,serif;font-weight:900;font-size:19px;color:#fecaca;margin-bottom:4px">' +
          escapar(datos.nombre) + ' pide que no jueguen acá</div>' +
        '<div style="font-size:13px;color:#fca5a5;font-weight:600">' +
          flecha + ' montón ' + grupo + ' de la ' + cual + '</div>';
      nodo(el, 2900);
      setTimeout(function(){ el.classList.add('saliendo'); }, 2500);

      if(pilaEl){
        pilaEl.classList.remove('avisada');
        void pilaEl.offsetWidth;
        pilaEl.classList.add('avisada');
        setTimeout(function(){ pilaEl.classList.remove('avisada'); }, 2200);
      }
    },

    /* ============================================ final de partida */
    contar: function(el, desde, hasta, ms){
      if(!el) return;
      if(reducido()){ el.textContent = hasta; return; }
      var t0 = performance.now();
      (function paso(t){
        var k = Math.min(1, (t - t0) / ms);
        var suave = 1 - Math.pow(1 - k, 3);
        el.textContent = Math.round(desde + (hasta - desde) * suave);
        if(k < 1) requestAnimationFrame(paso);
      })(t0);
    },

    finale: function(gano, over){
      if(reducido() || !ctx) return;
      if(!gano){
        // derrota: una lluvia corta y apagada, sin fiesta
        var caida = [];
        for(var j = 0; j < 26; j++){
          caida.push({
            x: Math.random() * window.innerWidth, y: -20 - Math.random() * 120,
            vx: (Math.random() - 0.5) * 30, vy: 90 + Math.random() * 90,
            g: 120, r: 1.5 + Math.random() * 2,
            vida: 2.2, alpha: 0.5, forma: 'circulo', color: '#475569'
          });
        }
        FX.emitir(caida);
        return;
      }

      // victoria: tres oleadas de confeti
      var oleada = function(retardo){
        setTimeout(function(){
          var lista = [];
          for(var i = 0; i < 90; i++){
            lista.push({
              x: Math.random() * window.innerWidth,
              y: -20 - Math.random() * 160,
              vx: (Math.random() - 0.5) * 220,
              vy: 120 + Math.random() * 260,
              g: 420, roce: 0.4,
              r: 3 + Math.random() * 4,
              rot: Math.random() * 6, vrot: (Math.random() - 0.5) * 14,
              vida: 2.6 + Math.random() * 1.4,
              forma: i % 5 === 0 ? 'circulo' : 'cuadro',
              color: PALETA[i % PALETA.length]
            });
          }
          FX.emitir(lista);
        }, retardo);
      };
      oleada(0); oleada(420); oleada(900);
    },

    /* Aviso en el título cuando la pestaña está en segundo plano. */
    tituloAviso: (function(){
      var original = document.title, timer = null, encendido = false;
      return function(texto){
        if(!document.hidden || timer) return;
        timer = setInterval(function(){
          encendido = !encendido;
          document.title = encendido ? texto : original;
        }, 900);
        var apagar = function(){
          if(document.hidden) return;
          clearInterval(timer); timer = null;
          document.title = original;
          document.removeEventListener('visibilitychange', apagar);
        };
        document.addEventListener('visibilitychange', apagar);
      };
    })()
  };

  function escapar(s){
    return String(s).replace(/[&<>"']/g, function(c){
      return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c];
    });
  }
  FX.escapar = escapar;

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){ FX.init(); });
  } else {
    FX.init();
  }

  return FX;
})();
