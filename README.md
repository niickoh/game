# The Game — en la red de la oficina

Versión para jugar entre varios el juego de cartas cooperativo **The Game** (Steffen Benndorf).
Uno levanta el servidor en su computador, el resto entra desde el navegador con la dirección
que aparece en pantalla. Cada uno ve **solo sus cartas**.

---

## Levantarlo

1. Doble clic en **`INICIAR.bat`**.
2. Se abre una ventana negra con algo así:

   ```
     The Game Online  ·  servidor listo
     ----------------------------------------
     En este equipo:   http://localhost:8080

     Comparte esta URL con tus compañeros:
       http://172.16.37.81:8080   (Wi-Fi)
   ```

3. Pásales esa dirección (la de Wi-Fi, no la de `localhost`) por Teams, WhatsApp o como sea.
4. Cada uno escribe su nombre y entra. **El primero que entra queda de administrador** y es
   quien reparte.

Para apagarlo: cierra la ventana negra o aprieta `Ctrl+C`.

**Requisito**: Node.js instalado en el computador que hace de servidor (`node -v` para
comprobarlo). El resto solo necesita un navegador; funciona igual en celular.

### Si los demás no logran entrar

- **El firewall de Windows**: la primera vez aparece un cuadro preguntando si permites el acceso.
  Hay que marcar **redes privadas** y aceptar. Si lo rechazaste, se vuelve a permitir en
  Firewall de Windows Defender → Permitir una aplicación → Node.js.
- **Tienen que estar en la misma red.** El mismo Wi-Fi de la oficina. Con VPN encendida
  normalmente no funciona.
- **El puerto ocupado**: si dice que el 8080 está en uso, `node server.js 3000` y compartes
  la dirección con `:3000`.
- Si aparecen varias direcciones IP, la buena suele ser la de `Wi-Fi` o `Ethernet`. Las de
  `vEthernet` son de máquinas virtuales y no sirven.

---

## Qué tiene

**Mesa en vivo.** Los cuatro montones, con el número grande de cada uno, cuántas cartas lleva
y **qué carta exacta sería el salto de 10** ahí. Si tú tienes esa carta en la mano, el dato se
enciende en dorado.

**Chat de sala, con voz.** Doce botones de frases rápidas para no escribir: las tácticas
(`No jueguen ahí`, `Tengo salto`, `Déjenme esa`), las de apuro (`Ya po, juega`,
`Quién revolvió`, `Se durmió`) y las reacciones (`¡Bum!`, `Bravo`, `Vamos`, `Uuuh`, `Buuu`).

Si tienes el sonido encendido, **una voz robótica en español lee la frase en voz alta** a todos
los de la sala, y las reacciones traen además su efecto: un estruendo con chispas para el
`¡Bum!`, aplausos para el `Bravo`, un trombón triste para el `Uuuh`. La voz sale del propio
navegador (no se descarga nada) y usa la voz en español que tengas instalada en Windows.

Si escribes un número te avisa, porque decir números exactos va contra la regla del juego —
avisa, no bloquea: la regla la hacen cumplir ustedes.

**Historial de jugadas.** La pestaña de al lado guarda todo: quién puso qué carta en qué montón,
quién hizo un salto de 10 (en dorado), quién cerró turno y con cuántas cartas, cuándo se agotó
el mazo. Sirve para reconstruir en qué momento se echó a perder la partida.

**Aviso de «no jueguen acá».** El botón ⛔ de cada montón le manda un **popup a todos** diciendo
quién lo pidió y en qué montón. El montón parpadea un momento y vuelve a la normalidad: **no
queda bloqueado ni marcado**, es solo un aviso. Queda registrado en el chat y en el historial.

**Administrador.** Quien crea la sala reparte, reinicia y, desde el botón **Sala**, puede pasarle
el mando a otro o sacar a alguien. Si se desconecta, el mando lo hereda automáticamente el
siguiente jugador conectado.

**Efectos.** La carta vuela desde la mano (o desde la ficha de quien la jugó) hasta el montón,
el número cambia con rodillo en la dirección del montón, el salto de 10 estalla en dorado, las
cartas nuevas entran escalonadas y la victoria larga confeti. Todo se apaga solo si tienes
activado «reducir movimiento» en el sistema.

**Arrastrar cartas.** Con mouse puedes tomar la carta y soltarla sobre el montón: el borde te
avisa si cabe (verde), si es un salto de 10 (dorado) o si no entra (rojo). En celular se mantiene
tocar la carta y después el montón, porque capturar el dedo impediría desplazar la página.

**Sonido y voz.** Apagados por defecto —es una oficina—. El botón **«Activar sonido»** de la
barra de arriba los enciende y recuerda tu preferencia; mientras está apagado late en ámbar para
que no pase inadvertido, y si aprietas una frase sin haberlo encendido te lo avisa. Los sonidos son sintetizados, afinados en escala pentatónica, y el de la carta
suena más agudo mientras más justa fue la jugada.

---

## Que entre alguien de fuera de la oficina

Doble clic en **`PUBLICAR.bat`**. Levanta el servidor si hace falta, abre un tunel de
Cloudflare y te deja la direccion lista para pasar:

```
  ╔══════════════════════════════════════════════════════════════╗
  ║  Pasale esta direccion a quien esta afuera:                  ║
  ║                                                              ║
  ║  https://follow-limitation-structural-jim.trycloudflare.com  ║
  ║                                                              ║
  ║  Ya quedo copiada: pegala con Ctrl+V donde quieras.          ║
  ║  Tambien quedo en URL-PARA-COMPARTIR.txt, aqui al lado.      ║
  ║                                                              ║
  ║  Ojo: ponle PIN a la sala antes de compartirla.              ║
  ║  La direccion muere cuando cierras esta ventana.             ║
  ╚══════════════════════════════════════════════════════════════╝
```

**No tienes que copiarla a mano**: queda en el portapapeles sola, lista para pegar en Teams o
WhatsApp. Si se te fue, escribe `c` y Enter en esa ventana y la copia de nuevo. Tambien queda
escrita en `URL-PARA-COMPARTIR.txt`, en esta misma carpeta, y ese archivo se borra al cerrar
para que no te quede una direccion vieja dando vueltas. Con `q` y Enter cierras el tunel.

Si le pasas el nombre de una sala, el enlace ya viene apuntando ahi:

```
PUBLICAR.bat OFICINA     ->  https://....trycloudflare.com/?sala=OFICINA
PUBLICAR.bat 3000        ->  usa el puerto 3000
```

Esa direccion funciona desde cualquier parte del mundo, con HTTPS, sin tocar el router.

La primera vez te va a pedir instalar `cloudflared` (el programa que abre el tunel); dile que
si y se instala solo con winget. Si lo tienes en una ruta rara, define `CF_BIN` con la ruta
completa al ejecutable.

### Ponle PIN antes de compartir

Mientras el juego vive solo en la red de la oficina, no hace falta. Apenas lo publicas en
internet, **cualquiera con el link puede entrar a la sala** — y si llega primero queda de
administrador, o se pone a apretar los botones de voz, que suenan en voz alta donde ustedes
estan. Asi que:

- Al crear la sala, escribe un **PIN** en la pantalla de entrada. Quien entre despues tendra
  que escribirlo.
- El PIN se ve en el boton **Sala**, para que lo puedas pasar junto con el link.
- El administrador lo puede cambiar o quitar cuando quiera, desde ahi mismo.
- Si alguien intenta adivinarlo, tras ocho intentos fallidos su conexion queda bloqueada un
  minuto.
- Volver a tu propio asiento (recargar la pagina) no te vuelve a pedir el PIN.

### Otras formas, si esta se te queda corta

- **Tailscale**: una VPN privada. El de afuera la instala, entra a tu misma red y juega como si
  estuviera en la oficina. Mas engorroso para el invitado, pero nadie ajeno puede llegar.
- **Subirlo a un servidor**: el juego es un Node sin dependencias ni base de datos, cabe en
  cualquier plan gratuito. Queda siempre prendido y nadie tiene que dejar el computador encendido.
- **Abrir el puerto en el router**: no se recomienda. En Chile la mayoria de las conexiones estan
  detras de CGNAT y ni siquiera funciona; y cuando funciona, expones el equipo directo a internet.

---

## Salas

Todos los que entren con el **mismo nombre de sala** juegan la misma partida. Por defecto es
`MESA`. Para tener dos partidas en paralelo, basta con que un grupo use otra:

```
http://172.16.37.81:8080/?sala=CONTABILIDAD
```

El botón **Sala** muestra el enlace listo para copiar.

---

## Las reglas, en corto

- 98 cartas, del **2 al 99**. Cuatro montones: dos **suben** desde 1, dos **bajan** desde 100.
- En tu turno colocas **mínimo 2 cartas** (una sola cuando el mazo se acaba). Puedes poner más.
- **El salto de 10**: en un montón que sube puedes colocar una carta exactamente 10 *menor*
  que la de arriba; en uno que baja, exactamente 10 *mayor*. Es la jugada que salva partidas.
- Al terminar tu turno robas hasta volver a tener 6 cartas.
- **Se gana** colocando las 98. Se pierde apenas alguien no puede cumplir el mínimo.
  Quedar bajo 10 cartas ya es buen resultado; quedar en 0 casi no pasa.
- **Se puede hablar**, pero nunca decir números.

---

## Detalles prácticos

- **Si recargas la página** vuelves a tu asiento con tus cartas intactas. Si cierras la pestaña
  entera pierdes el asiento: el administrador puede sacarte de la lista.
- **Dos personas en el mismo computador** (dos pestañas) son dos jugadores distintos, no uno.
- **El que llega tarde** entra como espectador: ve la mesa y el chat, y juega desde la partida
  siguiente.
- **Caben 10 jugadores** por sala. Con más de 5 el juego original no está pensado, pero funciona.
- El estado vive en la memoria del servidor: si cierras la ventana negra, se pierden las partidas
  en curso. No hay base de datos ni nada que instalar.
- Nadie ve las cartas de nadie: el servidor manda a cada jugador solo su propia mano; del resto
  viaja únicamente cuántas cartas tiene.
- **Funciona sin internet.** Tailwind está guardado en `public/vendor/`. Lo único que se baja de
  afuera son las tipografías; sin internet se ven con las del sistema y el juego anda igual.

---

## Archivos

| Archivo | Qué es |
|---|---|
| `INICIAR.bat` | El doble clic que levanta todo |
| `PUBLICAR.bat` | Abre un tunel para que entre gente de fuera de la oficina |
| `publicar.js` | Lo que hace el tunel: levanta el servidor y muestra la URL publica |
| `server.js` | Servidor Node sin dependencias: reglas, turnos, chat, historial y salas |
| `public/index.html` | La página: estructura y estilos |
| `public/app.js` | La lógica del cliente: conexión, mesa, chat, historial, administrador |
| `public/fx.js` | Los efectos visuales (vuelo de cartas, salto de 10, confeti) |
| `public/fx-sound.js` | El sonido sintetizado y la vibración |
| `public/vendor/tailwind.js` | Tailwind local, para no depender de internet |
| `hotseat.html` | Versión suelta para jugar varios en un mismo computador, sin servidor. Doble clic |

El juego original es de Steffen Benndorf, editado por Nürnberger-Spielkarten-Verlag. Esto es una
implementación casera para jugar en la oficina, no un producto.
