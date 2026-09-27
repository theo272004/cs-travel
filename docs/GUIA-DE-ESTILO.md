# Guía de estilo del portal CS Travel

Reglas para que **todas** las pantallas se vean y se muevan igual: administrador,
empresas, médicos, eventos, registro y lo que venga. Antes de crear o tocar una
pantalla, revisa esta guía. Si algo nuevo necesita una regla que no está aquí,
agrégala aquí primero.

La referencia visual son **Dashboard, Operaciones, Seguimiento y Cotizaciones**
(admin) y el **registro de aliados** (`#/registro`) para el movimiento.

---

## 1. Superficie de la página

- La página va **sobre el fondo del cielo** (`dashboard-bg.png`), sin «hoja»
  beige ni caja contenedora. Cada bloque es un `.panel` **blanco**, con radio
  `--radius-lg` (24px), borde `rgba(10,37,64,.1)` y sombra
  `0 10px 28px rgba(2,20,52,.08)`.
- Encabezado de página: `.page-title` + `.page-subtitle` a la izquierda y, si
  hay cifras, la tira de KPI a la derecha (`.qb-page-hero` + `.qb-hero-kpis`).
  Nada de estilos `<style>` dentro de las vistas: todo va en `src/styles/`.

## 2. Color

| Uso | Token | Valor |
|---|---|---|
| Títulos, texto fuerte, menú | `--blue-900` | #0a2540 |
| Acción principal, enlaces, resaltado | `--accent-blue` | #0058c1 |
| Hover de la acción principal | `--accent-blue-dark` | #06244d |
| Fondo suave de chips e íconos | `--blue-100` | #e7f0fb |
| Texto secundario | `--gray-500` | #6b7787 |
| Bordes y separadores | `--gray-200` | #e9edf2 |
| Error / peligro | `--red-600` sobre `--red-100` | solo errores y borrar |
| Advertencia | `--amber-600` sobre `--amber-100` | **solo** para algo que requiere atención (vencido, por facturar). Nunca como decoración ni como fondo de filas. |

- **Una sola familia de azul.** No mezclar verdes, naranjas o morados sueltos
  para decorar: los estados usan los colores de `StatusBadge`.
- El **amarillo de marca** (`#ffd322`) solo en el registro de aliados y en el
  sitio público (botón principal). Dentro del portal, la acción principal es azul.
- Avisos informativos (`.notice`): fondo `--blue-100`, texto `--blue-900`,
  ícono azul. Nada de cajas amarillas o beige.

## 3. Íconos

- **Sin emojis** en la interfaz (tampoco en notificaciones ni en toasts).
- Íconos SVG de línea, trazo 1.8–2, `stroke="currentColor"`, 24×24, como los
  del menú lateral (`NAV_ICONS` en `Sidebar.js`) y los de `src/utils/icons.js`.
- Dentro de un chip o botón redondo: ícono de 16–18px en un cuadro de 32–40px
  con fondo `--blue-100` y color `--accent-blue`.

## 4. Tipografía y texto

- Títulos en Manrope (`--font-heading`), texto en Inter (`--font`).
- Todo en español **con tildes** («Códigos», «Configuración», «Sesión»).
- Estados siempre con su etiqueta legible (`statusLabel()`), nunca la clave
  interna («en gestion» → «En gestión»).
- Contenido comercial (orden W-04): prohibido «tarifas mayoristas», marcas de
  OTAs, «única empresa», urgencia falsa. Usar «tarifas más económicas que las OTAs».

## 5. Tablas y alineación

- Columnas de datos alineadas: texto a la izquierda, cifras a la derecha,
  estados al centro de su columna.
- **Acciones de una fila**: cada botón en su **propia columna fija**, para que
  en todas las filas «Referido» quede debajo de «Referido», «Desactivar» debajo
  de «Desactivar» y «Borrar» debajo de «Borrar». Si una fila no tiene esa
  acción, deja la celda vacía (no corras los botones). Usa `.row-actions`
  (grilla con columnas iguales) y botones `.btn--sm` del mismo ancho mínimo.
- Botones de peligro (borrar, desactivar) siempre al final de la fila.
- En celular (≤ 760px) las tablas largas pasan a tarjetas.

## 6. Movimiento

Principio: **nada aparece de la nada**. Todo sale de algún lugar y vuelve a él.

- **Ventanas emergentes (modales, diálogos):** crecen desde el botón que las
  abrió (escala .92 → 1 con `transform-origin` en ese botón, más fundido) y al
  cerrar se encogen hacia él. El fondo se oscurece con fundido y un leve
  desenfoque. Esto ya lo hace `src/utils/motion.js` para cualquier
  `.modal-overlay`, `.cst-modal-overlay` y `.confirm-overlay`: no hace falta
  programarlo en cada vista.
- **Cajones laterales (`Drawer`):** entran deslizando desde su borde.
- **Menús y desplegables:** bajan desde su botón (escala Y .96 → 1, 160ms).
- **Cambio de paso o de pestaña:** el contenido que sale se desvanece hacia un
  lado y el nuevo entra desde el otro (como el registro).
- **Listas y tarjetas al cargar:** entrada escalonada (fundido + 8px hacia
  arriba, 40–60ms entre elementos, máximo ~8 elementos animados).
- **Cifras:** cuentan hasta su valor (400ms) la primera vez que se ven.
- **Duraciones:** 160–220ms para cosas pequeñas (hover, menús), 280–480ms para
  paneles y ventanas. Curvas: `--ease` y `--ease-panel`. Sin rebotes.
- **Respeta «reducir movimiento»** (`prefers-reduced-motion`): sin
  desplazamientos, solo cambios directos o fundidos cortos.

## 7. Interacción

- Todo botón que llama al servidor muestra carga (`.is-loading`) y se
  deshabilita mientras tanto; nunca doble clic.
- Confirmaciones con `confirmDialog` (nunca `window.confirm/prompt/alert`).
- Mensajes cortos con `showToast` (sin emojis).
- Foco visible en teclado; al cerrar una ventana, el foco vuelve al botón que
  la abrió.
- Cada página nueva nace con su entrada en la **Guía** (`TOURS` o
  `registerTours` en `Tour.js`): qué es, para qué sirve, cómo se usa.

## 8. Revisión antes de entregar

1. Capturas a 1440×900 y 390×844: sin scroll horizontal, nada cortado.
2. Consola sin errores.
3. Compara con Dashboard/Operaciones: mismo fondo, mismos paneles, mismos botones.
4. Recorre la guía de la página.
