# Grabar recorridos de una página (scroll-through / demo reel)

Cómo sacar un vídeo MP4 de una página web bajando por ella sola, sin cursor, sin
barra de scroll y sin banners, a 60 fps reales. El script es
[`scripts/record-page.mjs`](../scripts/record-page.mjs) y sirve para cualquier
URL: la landing de producción, el portal en local, o una página suelta.

---

## 1. Para pegar en otro chat

Si abres una conversación nueva y Claude no sabe nada de esto, pégale esto:

> En este repo hay un script para grabar recorridos de páginas web:
> `scripts/record-page.mjs`. Úsalo (no inventes otro método, no uses OBS ni
> capturas de pantalla). Antes de grabar, lee la cabecera del script, que lleva
> todas las opciones documentadas, y lee `docs/GRABAR-RECORRIDOS.md`.
>
> Quiero un recorrido de **<URL>**, de **<N>** segundos, en **<1920x1080 |
> 1080x1920>**, guardado en **docs/video/<nombre>.mp4**.
>
> Antes de grabar, abre la página y mira si hay banner de cookies, burbuja de
> chat o algún widget flotante que estorbe, y quítalos con `--click` / `--hide`.
> Cuando termines, extrae 8 fotogramas repartidos por el vídeo y compruébalos:
> cada uno tiene que mostrar una sección distinta de la página. Si dos
> fotogramas seguidos se ven iguales, el scroll no está avanzando — arréglalo
> antes de dármelo.

Ese último párrafo es lo importante: es la comprobación que separa un vídeo
bueno de uno que parece bueno.

---

## 2. Qué hace por dentro (resumen)

- **Chrome headless** controlado con **Puppeteer** (`puppeteer-core`, usa el
  Chrome que ya tienes instalado; no descarga un Chromium aparte).
- Los fotogramas salen del **screencast del Chrome DevTools Protocol**
  (`Page.startScreencast`): no son capturas una por una, es el compositor del
  navegador entregando cada fotograma según lo pinta. De ahí los 60 fps de
  verdad.
- **ffmpeg** los monta en MP4 respetando los *timestamps* reales de cada
  fotograma, así que el tiempo del vídeo coincide con el tiempo real.

Ventaja sobre grabar la pantalla con OBS: no hay cursor, ni barra de scroll, ni
notificaciones, ni caídas de fotogramas, y el tamaño es exacto y repetible.

---

## 3. Requisitos

| Qué | Cómo se comprueba | Si falta |
|---|---|---|
| Node 18+ | `node -v` | instalar Node |
| `puppeteer-core` | `ls node_modules/puppeteer-core` | `NODE_ENV=development npm install --save-dev --include=dev puppeteer-core` |
| ffmpeg en el PATH | `ffmpeg -version` | instalar ffmpeg |
| Chrome instalado | se autodetecta | pasar `--chrome "ruta\chrome.exe"` o `CHROME_PATH` |

> Ojo con npm en este equipo: si `NODE_ENV` vale `production`, `npm install`
> se salta las devDependencies. Por eso el comando de arriba lleva
> `NODE_ENV=development --include=dev`.

---

## 4. Uso básico

```bash
node scripts/record-page.mjs --url https://www.cstravelgroup.com/
```

Sale en `docs/video/<host><ruta>.mp4` con los valores por defecto.

### El comando que generó el recorrido bueno de la home

```bash
node scripts/record-page.mjs --url https://www.cstravelgroup.com/ --out docs/video/cstravelgroup-home-1080p.mp4 --width 1920 --height 1080 --fps 60 --duration 26 --hold-start 2.5 --hold-end 2.5 --wait 3 --click ".cookie-banner__btn--accept"
```

Resultado: 1920×1080, 60 fps, 31 s, ~18 MB.

### Vertical para Reels / Stories

```bash
node scripts/record-page.mjs --url https://www.cstravelgroup.com/ --out docs/video/cstravelgroup-home-reel.mp4 --width 1080 --height 1920 --duration 20 --click ".cookie-banner__btn--accept"
```

---

## 5. Todas las opciones

| Opción | Por defecto | Para qué |
|---|---|---|
| `--url` | *(obligatoria)* | página a grabar |
| `--out` | `docs/video/<host><ruta>.mp4` | MP4 de salida |
| `--width` / `--height` | 1920 / 1080 | tamaño del viewport CSS |
| `--scale` | 1 | deviceScaleFactor. 2 = retina; pesa y va más lento |
| `--fps` | 60 | fotogramas por segundo del MP4 |
| `--duration` | 20 | segundos del barrido de scroll |
| `--hold-start` | 2 | segundos quieto arriba antes de bajar |
| `--hold-end` | 2 | segundos quieto abajo al terminar |
| `--wait` | 2.5 | espera extra tras cargar, para fuentes y animaciones |
| `--quality` | 95 | calidad JPEG del screencast, 1-100 |
| `--ramp` | 0.15 | fracción del barrido usada para acelerar y frenar. 0 = velocidad constante seca |
| `--click` | — | selector CSS a clicar antes de grabar (banner de cookies) |
| `--hide` | — | selectores CSS a ocultar, separados por coma |
| `--headful` | — | abre Chrome con ventana, para depurar |
| `--keep` | — | conserva los fotogramas sueltos en el temporal |
| `--chrome` | autodetecta | ruta al ejecutable de Chrome |

---

## 6. Cómo elegir la duración

Mide la altura de la página y divide: **250-300 px por segundo** se lee cómodo.

La home de cstravelgroup.com mide **7977 px** de alto; con un viewport de 1080
quedan unos 6900 px de recorrido → **26 segundos**.

- Menos de 200 px/s: se hace lento y aburrido.
- Más de 400 px/s: no da tiempo a leer los titulares.

---

## 7. Los dos fallos que ya están arreglados (no repetirlos)

Quedan documentados porque son exactamente los que estropearon la primera toma.

### `scroll-behavior: smooth`

La landing lleva `html { scroll-behavior: smooth }`. Si el barrido llama a
`scrollTo` en cada fotograma, **cada llamada reinicia la animación suave del
navegador** y ninguna termina: el scroll real se queda clavado (medido: 67 px
con el objetivo ya en 6897) y, al soltar el bucle, la última animación corre de
golpe y la página salta al final en un segundo.

El script lo neutraliza inyectando `scroll-behavior: auto !important` y usando
`scrollTo({ behavior: 'instant' })`. Además, si al terminar el scroll real no
coincide con el objetivo, **avisa por consola** en vez de entregar un vídeo
roto. Si ves ese aviso, la página está controlando el scroll por su cuenta
(Lenis, ScrollSmoother, locomotive) y hay que empujarla de otra forma.

### El easing sobre todo el barrido

Un `easeInOutCubic` aplicado a los 26 segundos enteros se arrastra ~7 s al
principio y llega al footer a los 24 s. El script usa **velocidad constante con
rampas cortas** al arrancar y al frenar (`--ramp`, 0.15 por defecto → el 70 %
del recorrido va a ritmo uniforme).

---

## 8. Comprobar el resultado (paso obligatorio)

Un vídeo puede pesar poco y verse "bien" en el primer fotograma y estar roto.
La comprobación rápida es sacar 8 fotogramas repartidos y mirarlos juntos:

```bash
ffmpeg -v error -y -i docs/video/cstravelgroup-home-1080p.mp4 -vf "select='eq(n\,150)+eq(n\,390)+eq(n\,630)+eq(n\,870)+eq(n\,1110)+eq(n\,1350)+eq(n\,1550)+eq(n\,1750)',scale=380:-1,tile=4x2:margin=6:padding=6:color=white" -frames:v 1 -fps_mode passthrough contacto.jpg
```

Los ocho tienen que ser secciones distintas. Si se repiten, el scroll no avanzó.

Datos técnicos del MP4:

```bash
ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate,nb_frames,duration -of default=nw=1 docs/video/cstravelgroup-home-1080p.mp4
```

Una pista más: **el peso delata el movimiento**. La toma rota pesaba 6.9 MB y la
buena 18.5 MB con la misma duración y ajustes. Si un recorrido de 30 s a 1080p
te sale por debajo de 10 MB, sospecha.

---

## 9. Cosas que tapar en cstravelgroup.com

- **Banner de cookies** → `--click ".cookie-banner__btn--accept"`
- **Burbuja de chat** (abajo a la derecha, sale en todo el vídeo) → `--hide` con
  su selector, si quieres el reel limpio. En la toma actual se dejó a propósito,
  porque forma parte del sitio real.

En una página nueva: ábrela antes, mira qué flota por encima y decide.

---

## 10. Dónde guardar los vídeos

Los MP4 van a `docs/video/`. Pesan bastante (18 MB los 30 s a 1080p), así que
piensa si quieren entrar al repo o si es mejor ignorarlos y compartirlos por
otro canal. El script sí conviene versionarlo.
