# Seguridad del portal (SPA)

Revisión del 29 de septiembre de 2026, rama `seguridad-revision`. Cubre este
repositorio: el portal en Vite + JavaScript que se publica en dos lugares:

- **Demo público** (GitHub Pages): datos de ejemplo guardados en el navegador de
  cada visitante.
- **Portal real** (`cstravelgroup.com/portal-app/`): los datos vienen de Wix a
  través de `/api` del sitio `cstravelgroup`. El servidor no está en este
  repositorio: lo que depende de él queda anotado como pendiente.

## En una frase

El portal ya no pinta ningún dato sin escaparlo, no deja que un enlace guardado
ejecute código, tiene una política de seguridad de contenido (CSP) que bloquea
el código que no sea suyo, el bundle del portal real no lleva contraseñas ni
datos de ejemplo, y cerrar sesión limpia el navegador. Lo que falta es del
servidor y del historial de git.

## Qué se revisó

1. **Inyección de código (XSS).** Todas las plantillas HTML del código (unas
   3.200 interpolaciones `${...}`) se recorrieron con el analizador de Rollup,
   más cada `innerHTML`, `insertAdjacentHTML`, `document.write`, las ventanas de
   confirmación y los paneles laterales. Se probó en el navegador sembrando
   `<img src=x onerror=...>` en nombres de empresas, pacientes, observaciones,
   motivos de cancelación, notas, códigos, referidos, eventos, cuentas e
   invitados, y en la URL de la pasarela.
2. **Enlaces y redirecciones.** `target="_blank"`, `window.open`, navegación con
   `data-href` y `location.hash`, enlaces de pago (`payHref`) y montos.
3. **Sesión y datos en el navegador** (`localStorage` / `sessionStorage`).
4. **El bundle del portal real** (`scripts/rebundle-local.mjs`,
   `vite.config.js`): contraseñas, datos demo, mapas de fuente, login demo.
5. **Controles que solo dependen de la interfaz** (botones ocultos).
6. **Archivos del repositorio público.**
7. **Dependencias** (`npm audit`).
8. **Cabeceras**: CSP y política de referencia.

## Qué se corrigió

| Tema | Antes | Ahora |
|---|---|---|
| Datos en HTML | La mayoría ya se escapaba, pero quedaban sin escapar ids en atributos, valores de formularios (`value="..."`), la prioridad de las cotizaciones, el estado de un documento del expediente, el mensaje de error del router (puede traer texto del servidor) y los errores de la búsqueda de inventario. | Todo pasa por `escapeHtml`. Los atributos con datos se escapan siempre. |
| Enlaces con datos | El certificado de firma y el visor del expediente aceptaban cualquier dirección (un `javascript:` corría al hacer clic). | `safeUrl()` (`src/utils/safeUrl.js`) solo deja pasar http(s), blob, mailto, tel y rutas relativas. |
| Navegación | `navigate()` aceptaba cualquier texto. | Solo rutas internas `#/...` (`safeHashRoute`). No hay forma de sacar a alguien del portal con un dato. |
| Pestañas nuevas | `rel="noopener"`. | `rel="noopener noreferrer"` en todos; la pestaña del documento propio se abre sin acceso de vuelta. |
| Enlace de pago | El demo aceptaba montos negativos o texto. | El monto nunca viaja al portal real (lo decide el servidor). En el demo solo enteros positivos; referencia y concepto recortados. |
| Ventana de cotización (PDF) | Imprimía con un `<script>` escrito dentro de la ventana. | Imprime desde la página; así funciona con la CSP. |
| Librería de QR (cdnjs) | Se cargaba sin comprobar su contenido. | Con integridad SRI: si el archivo del CDN cambia, el navegador no lo ejecuta. |
| CSP | No había. | `<meta http-equiv="Content-Security-Policy">` en `index.html`: solo scripts propios y el QR de cdnjs, sin código en línea ni `onclick=""`. Estilos en línea permitidos (la interfaz los usa), fuentes de Google, imágenes propias/data/blob/https, visor y descargas con blob, conexiones al mismo sitio. |
| Referencia | Por defecto del navegador. | `same-origin`: WhatsApp y otros sitios no ven desde qué página del portal se llegó. |
| Login demo en el portal real | Solo lo impedía el router. | Además `authService.login()` y el cambio de contraseña del primer ingreso se niegan en `/portal-app/`. |
| Cerrar sesión | Solo borraba la sesión. | En el portal real borra también la copia local de datos, el evento elegido, las notificaciones vistas y el expediente demo; en ambos, las marcas de `sessionStorage`. Se conservan solo el tema y las guías vistas. |
| Bundle del portal real | No llevaba contraseñas, pero sí las empresas, médicos, casos, solicitudes, códigos y referidos de ejemplo (con sus correos). | Solo lleva lo necesario: la semilla sale vacía de todo lo que el portal real lee de Wix. La revisión previa a copiar se detiene si encuentra una contraseña demo, un correo de usuario demo o un archivo `.map`. |
| Script viejo `scripts/rebundle-portal.sh` | Compilaba el portal real con la semilla completa (contraseñas incluidas). | Retirado: solo avisa y llama a `rebundle-local.mjs`. |
| Mapas de fuente | Apagados por defecto. | `sourcemap: false` explícito en `vite.config.js`. |
| Repositorio público | Transcripciones de audios de WhatsApp, el resumen de requerimientos, el alcance de la primera versión, la auditoría del panel admin, `.claude/settings.local.json`, y las contraseñas demo en el README y en un comentario de `src/utils/env.js`. | Fuera del árbol y en `.gitignore` (siguen en el disco de quien los tenía). README y comentario remiten a `src/data/db.json`. |
| Dependencias | 10 avisos de `npm audit` (2 críticos). | `npm audit fix` sin cambios mayores: quedan 2 (ver pendientes). |

Pruebas: `tests/seguridad.test.mjs` (escape, `safeUrl`, `safeHashRoute`,
`payHref`). Recorrido en el navegador (demo en `vite dev` y en el build, y el
bundle real bajo `/portal-app/`): admin, empresa, médico, organizador de
evento, registro, pasarela e invitado, con la trampa XSS sembrada; sin errores
de consola ni avisos de la CSP, y la trampa se ve como texto sin ejecutarse.

## Qué guarda el navegador en el portal real

- `cs_travel_session`: nombre, correo, rol e ids de la persona. **No** hay
  contraseñas ni tokens: la sesión real es una cookie `httpOnly` del servidor.
  El rol de aquí solo decide qué pantallas se muestran; los datos los filtra el
  servidor.
- `cs_travel_settings`: tasa USD y el asesor por defecto (preferencia del
  navegador, sin datos de clientes).
- Tema y guías vistas: preferencias sin datos personales.

Todo lo que identifica a la persona se borra al cerrar sesión.

## Pendientes (y por qué no se hicieron aquí)

**Del servidor (`cstravelgroup`, no se puede editar desde este repositorio):**

1. **Alta: cualquiera con sesión puede borrar códigos de referido.** En
   `/api/data/[resource]/[id]`, borrar (por `DELETE` o por `POST` con
   `_method: 'DELETE'`) solo pide `canAccessItem`, y para `codes` esa función
   responde que sí a todos los roles. Además un médico o una empresa pueden
   borrar sus propios casos, solicitudes, referidos y su ficha de empresa o
   médico. Borrar debería ser solo del admin (o pasar por la misma lista blanca
   que editar).
2. **Media: el médico puede escribir `finalPatientValue` a mano** mientras la
   cotización está enviada, y la orden de pago toma el monto de ese campo. El
   servidor debería recalcularlo (costo + margen CS + margen del médico, con el
   tope `doctorMarginMax`) en vez de aceptarlo.
3. **Baja: la búsqueda de vuelos y hoteles (`/api/travel/*`)** la puede llamar
   cualquier persona con sesión (consume cupo de Amadeus). En la interfaz solo
   la usa el admin.
4. La lectura de un código por id (`GET /api/data/codes/:id`) devuelve también
   códigos inactivos a cualquier rol (en la lista solo salen los activos).
5. La CSP del servidor está en modo "solo informe"; cuando se confirme que no
   hay avisos, conviene pasarla a obligatoria. Las cabeceras `frame-ancestors`,
   HSTS y `nosniff` solo las puede poner el servidor (ya lo hace).

Los controles que en la interfaz dependen de ocultar algo (menú Eventos en el
portal real, pantallas de admin para quien cambie su rol en `localStorage`)
no exponen datos: el servidor responde 403 y, en el portal real, la semilla
local va vacía.

**Del repositorio:**

6. **El historial de git sigue teniendo** las transcripciones, los documentos
   internos y las contraseñas demo que se sacaron del árbol. Para que dejen de
   verse hay que hacer el repositorio privado o reescribir el historial (por
   ejemplo con `git filter-repo`) y forzar el push. No se hizo: es una decisión
   del dueño del repositorio y cambia el historial de todos.
7. **Vite 5 / esbuild** (aviso de `npm audit`, alto y moderado): afecta solo al
   servidor de desarrollo, no al bundle publicado. La corrección exige Vite 8
   (cambio mayor); mientras tanto, no exponer `npm run dev` fuera del equipo
   (Vite escucha solo en localhost por defecto).
8. Las contraseñas de prueba siguen en `src/data/db.json` y en el bundle del
   **demo** público: es a propósito (el demo necesita su login) y no dan acceso
   al portal real. No reutilizarlas en ninguna cuenta real.
9. `public/pagar.html` es una página vieja que no enlaza nada del portal; se
   revisó (pinta el concepto con `textContent`) pero conviene borrarla si ya no
   se usa.

## Cómo mantenerlo

- Todo dato que se pinte con `innerHTML` va con `escapeHtml(...)`; si es una
  dirección, además `safeUrl(...)`.
- No escribir `<script>` en línea ni atributos `onclick=""`: la CSP los bloquea.
  Si se agrega una librería externa, sumarla a `script-src` en `index.html` y
  cargarla con `integrity`.
- Para publicar el portal real usar solo `node scripts/rebundle-local.mjs`
  (con `--solo-build --out <carpeta>` se compila y revisa sin copiar nada).
