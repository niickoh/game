# ¿Quién chucha revuelve? — en la red de la oficina

> El primer juego de cartas donde no revuelves :D

Versión para jugar entre varios un juego de cartas cooperativo, inspirado en **The Game** (Steffen Benndorf).
Uno levanta el servidor en su computador, el resto entra desde el navegador con la dirección
que aparece en pantalla. Cada uno ve **solo sus cartas**.

🎮 **Jugar online:** <https://the-game.sportspherecenter.com/>

---

## Levantarlo

1. Doble clic en **`INICIAR.bat`**.
2. Se abre una ventana negra con algo así:

   ```
     Quien chucha revuelve  ·  servidor listo
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

**Resumen al final.** La pantalla de fin muestra, sacado del historial:
- **el mejor salto de 10**: el que se hizo con el montón más avanzado, que es cuando más espacio
  devuelve (un 87 → 77 vale más que un 15 → 5);
- **quién colocó más cartas**, descontando las que deshizo;
- **el turno donde se echó a perder**: el que más espacio quemó. Lo ideal es que cada carta avance
  1 su montón; lo que avanza de más es espacio perdido, y un salto de 10 lo devuelve. Si ganan, no
  aparece.

**Estadísticas por sala.** También en la pantalla final: el **mejor resultado** (menos cartas
fuera), el **promedio** de cartas que quedaron y la **racha** de partidas buenas seguidas (hasta
10 cartas fuera), con su récord. Se guardan en `data/estadisticas.json`, así que no se pierden al
reiniciar el servidor. Para empezar de cero, borra ese archivo con el servidor apagado. Las
partidas en que se fueron todos no cuentan.

**Revancha.** Al terminar, el administrador tiene el botón **Revancha**: reparte de inmediato, en
el mismo modo, a todos los que siguen conectados, sin pasar por el lobby. Los desconectados quedan
mirando y entran en la siguiente. **Volver a la sala** sigue llevando al lobby, como antes.

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

## PIN de sala

Mientras el juego vive solo en la red de la oficina no hace falta, pero si no quieres que entre
cualquiera que sepa el nombre de la sala, ponle un PIN:

- Al crear la sala, escribe un **PIN** en la pantalla de entrada. Quien entre despues tendra
  que escribirlo.
- El PIN se ve en el boton **Sala**, para pasarlo junto con el enlace.
- El administrador lo puede cambiar o quitar cuando quiera, desde ahi mismo.
- Si alguien intenta adivinarlo, tras ocho intentos fallidos su conexion queda bloqueada un
  minuto.
- Volver a tu propio asiento (recargar la pagina) no te vuelve a pedir el PIN.

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
- Las partidas viven en la memoria del servidor: si cierras la ventana negra, se pierden las que
  están en curso. Lo único que queda en disco son las estadísticas de cada sala
  (`data/estadisticas.json`). No hay base de datos ni nada que instalar.
- Nadie ve las cartas de nadie: el servidor manda a cada jugador solo su propia mano; del resto
  viaja únicamente cuántas cartas tiene.
- **Funciona sin internet.** Tailwind está guardado en `public/vendor/`. Lo único que se baja de
  afuera son las tipografías; sin internet se ven con las del sistema y el juego anda igual.

---

## Archivos

| Archivo | Qué es |
|---|---|
| `INICIAR.bat` | El doble clic que levanta todo |
| `server.js` | Servidor Node sin dependencias: reglas, turnos, chat, historial y salas |
| `public/index.html` | La página: estructura y estilos |
| `public/app.js` | La lógica del cliente: conexión, mesa, chat, historial, administrador |
| `public/fx.js` | Los efectos visuales (vuelo de cartas, salto de 10, confeti) |
| `public/fx-sound.js` | El sonido sintetizado y la vibración |
| `public/vendor/tailwind.js` | Tailwind local, para no depender de internet |
| `hotseat.html` | Versión suelta para jugar varios en un mismo computador, sin servidor. Doble clic |
| `data/estadisticas.json` | Estadísticas por sala. Se crea sola y no va al repositorio |

El juego original es de Steffen Benndorf, editado por Nürnberger-Spielkarten-Verlag. Esto es una
implementación casera para jugar en la oficina, no un producto.
