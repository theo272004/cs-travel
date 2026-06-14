# Auditoría del Panel de Administrador — CS Travel

> Fecha: 2026-06-13 · Repo prototipo (`herramienta cs travel`).
> Objetivo: estudiar el panel admin, detectar lo que sobra/falta, alinearlo visualmente
> con la sección **Médicos** (la mejor estructurada) y mapear las funcionalidades que
> pidió el dueño a cambios concretos.

---

## 1. Diagnóstico del estado actual

### 1.1 Vistas que existen hoy (admin)
| Vista | Qué hace | Veredicto |
|-------|----------|-----------|
| `AdminDashboardView` | KPIs (ingreso CST, por atender, activos, valor entregado, aliados, usuarios), cola de trabajo, donut de estados, ingreso por empresa, solicitudes recientes | **Conservar**, rediseñar al estilo médicos |
| `AdminUsersView` | CRUD usuarios, filtros, paginación, activar/desactivar, eliminar | **Conservar** (núcleo) |
| `AdminCompaniesView` + `AdminCompanyDetailView` | Lista y detalle de empresas, métricas, solicitudes asociadas | **Conservar** |
| `AdminDoctorsView` + `AdminDoctorDetailView` | Lista y detalle de médicos, métricas, casos asociados | **Conservar** |
| `AdminRequestsView` | Listado global de solicitudes con filtros | **Fusionar** (ver 1.3) |
| `AdminMedicalCasesView` | Listado global de casos médicos con filtros | **Fusionar** (ver 1.3) |
| `AdminKanbanView` | Tablero de seguimiento drag&drop por estado | **Conservar** (es la vista operativa real) |
| `AdminSettingsView` | Integraciones (Booking.com, etc.) | **Conservar**, ampliar |

### 1.2 Comparación visual: Admin vs Médicos

**Médicos (referencia, bien hecha)** usa un lenguaje visual consistente:
- `doctor-kpi-row` con tarjetas `doctor-kpi--{green|blue|violet|amber}`, variante `--hero` y `--compact`, con **sparklines** de tendencia.
- `doctor-main-grid` (2 columnas) con paneles `panel--decision-cards` + `panel--chart`.
- `doctor-insights-grid--compact`: gráfico de estado semicircular + tabla activa compacta.
- `partner-strip` (soporte CST) en bloques con divisores.

**Admin (hoy)** usa componentes genéricos más planos:
- `metrics-grid` con `MetricCard` simples (sin acento de color, sin sparkline, sin jerarquía).
- `dashboard-split` + `charts-grid` con `panel` genéricos.

➡️ **Acción:** portar el admin al sistema `doctor-kpi*` / `*-grid` para unificar el lenguaje
(jerarquía con tarjeta hero, acentos de color, sparklines, paneles compactos).

### 1.3 Menú lateral: redundancias detectadas

Menú admin actual (8 ítems): Dashboard · Usuarios · Empresas · Médicos · Solicitudes · Casos médicos · Seguimiento · Configuración.

Problemas:
1. **"Solicitudes" y "Casos médicos"** son la misma idea (operaciones de viaje), separadas solo
   por el tipo de cliente. Además se solapan con **"Seguimiento" (Kanban)**, que ya muestra ambas.
2. **"Empresas" y "Médicos"** son ambos "aliados/clientes"; podrían agruparse bajo un
   acordeón "Aliados" para acortar el menú.

**Propuesta de menú (6 ítems):**
```
Dashboard
Operaciones      → unifica Solicitudes + Casos médicos (con pestañas/tipo)
Seguimiento      → Kanban (sin cambios)
Aliados          → Empresas + Médicos (sub-tabs)
Usuarios
Configuración
```
*(Alternativa conservadora: dejar el menú pero unir Solicitudes+Casos en una sola vista "Operaciones".)*

---

## 2. Funcionalidades pedidas por el dueño → plan de implementación

### 2.1 Desactivar usuarios desde admin ✅ (ya existe — solo mejorar)
- Ya implementado: `userService.toggleStatus()`, botón activar/desactivar en `AdminUsersView`
  y en `AdminUserDetailView`. Un usuario `inactive` no puede iniciar sesión (validado en `authService`).
- **Mejora sugerida:** al desactivar, pedir un **motivo** (incumplimiento de contrato, etc.) y
  guardarlo en `internalNotes` con fecha; mostrar un badge "Inactivo · motivo" en la tabla.

### 2.2 Catálogo de servicios: SIM cards, tours, paquetes, eventos
- Hoy el tipo de solicitud incluye: vuelo, hotel, tour, traslado, paquete completo, otro.
- **Faltan:** SIM card, paquetes turísticos/eventos como categorías propias.
- **Acción:** ampliar el `select` de tipo en `QuickCreate.js` (RequestFormFields) con:
  `SIM card / eSIM`, `Tour / excursión`, `Paquete turístico`, `Evento`. Y reflejarlos en los
  filtros de `AdminRequestsView`. (Opcional: una colección "Servicios" configurable en Settings.)

### 2.3 Datos de pasajero/paciente faltantes
El modelo actual de `requests`/`medicalCases` **no captura identidad completa del viajero**.
Para gestionar tiquetes reales hace falta:
| Campo nuevo | Dónde | Notas |
|-------------|-------|-------|
| `fullName` (nombre completo) | requests + medicalCases | Tal como aparece en pasaporte |
| `documentType` (pasaporte / cédula / ID) | ambos | Select |
| `documentNumber` | ambos | |
| `nationality` | ambos | Útil para extranjeros |
| **`returnDate` (fecha de salida/regreso)** | ambos | Hoy solo existe `travelDate` (entrada) |
- **Acción:** añadir estos campos en `QuickCreate.js`, en el seed `db.json` y en las vistas de detalle.
  Renombrar mentalmente `travelDate` → fecha de ida, y sumar `returnDate` → fecha de regreso.

### 2.4 Métricas de cotizaciones cerradas (% + drill-down)
- El dueño quiere ver el **% de cotizaciones cerradas** y poder **hacer clic** para ver
  las **no cerradas** y estudiar el porqué.
- Datos disponibles: `status` (`aprobada`/`finalizada` = cerrada; `cancelada` = perdida).
- **Acción:**
  1. KPI nuevo en dashboard admin: **Tasa de cierre** = cerradas / (cerradas + canceladas).
  2. KPI clickeable → vista filtrada de **cotizaciones no cerradas** (canceladas/estancadas).
  3. Añadir campo opcional `lostReason` (motivo de no cierre) al cancelar, para análisis.

### 2.5 Valor retornado por cliente (rentabilidad real)
- Ya existen los campos: `estimatedReturn` (lo que se retorna al cliente) y `csTravelMargin`
  (lo que genera CST). El `companyService.recompute()` ya suma retornos por empresa.
- **Acción:** panel en detalle de empresa/médico que muestre **Retorno entregado vs Ingreso generado**
  y una **alerta si retorno > ingreso** (se le está devolviendo más de lo que genera). Tabla
  ordenable por rentabilidad en el dashboard admin.

### 2.6 Generador de cotizaciones editable (plantilla)
- El dueño usa una plantilla tipo el PDF **"Itinerario Ruby Europa"** (bloques por ciudad,
  cuadro maestro de tarifas, transporte opcional, incluye/no incluye, pie con RNT y asesor).
- Quiere que sea **editable** y que Claude pueda regenerarla con nuevos datos.
- **Acción (fase posterior):** crear un **módulo de cotizaciones** con:
  - Estructura de datos: encabezado (pasajero, fechas, ciudades), `blocks[]` (hotel, noches,
    excursiones, precio), `transport[]`, `includes[]`/`excludes[]`, totales, pie legal.
  - Render HTML imprimible/exportable a PDF respetando el diseño del ejemplo.
  - Edición desde el panel admin y guardado por solicitud/caso (`quoteDetails` ya existe como semilla).

### 2.7 RNT y Marca Blanca (white-label)
- **RNT** = Registro Nacional de Turismo (obligatorio en Colombia). En el PDF aparece
  `RNT: 264837`. **Acción:** guardarlo en Configuración y mostrarlo en el pie de toda cotización.
- **Marca blanca** = generar la cotización **sin la marca/logo de CS Travel** para que un
  médico/empresa la presente como propia. (El docx de VDT/grupovdt.com es de un proveedor
  mayorista de vuelos white-label; concepto análogo.)
- **Acción:** en el generador de cotizaciones, un toggle **"Marca blanca"** que permita:
  - Ocultar logo/nombre CS Travel o reemplazarlo por el del aliado.
  - Definir datos de contacto/branding del aliado (nombre agencia, logo, teléfonos, web, colores).
  - Guardar el "perfil de marca" por empresa/médico para reutilizar.

---

## 3. Priorización sugerida (por fases)

**Fase A — Limpieza y alineación visual (rápida, alto impacto):**
1. Rediseñar `AdminDashboardView` con el sistema visual de médicos (KPIs con acento, hero, sparklines).
2. Unificar Solicitudes + Casos en "Operaciones" y simplificar el menú lateral.
3. Motivo al desactivar usuarios + badge.

**Fase B — Datos y métricas de negocio:**
4. Campos de identidad del viajero + fecha de regreso (`returnDate`) en formularios y modelo.
5. KPI Tasa de cierre + drill-down de no cerradas (`lostReason`).
6. Panel de rentabilidad (retorno vs ingreso) con alertas.
7. Catálogo de servicios (SIM, tours, paquetes, eventos).

**Fase C — Cotizaciones (proyecto grande):**
8. Módulo generador de cotizaciones editable (plantilla Ruby Europa).
9. RNT en configuración + pie legal.
10. Modo marca blanca (branding por aliado).

> Nota: las Fases B y C tocan el modelo de datos y deberían diseñarse pensando ya en el
> **proyecto real** (`cstravelgroup`, Wix Data) para no duplicar esfuerzo. Ver `PORTAL_PLAN.md`
> en ese repo.
