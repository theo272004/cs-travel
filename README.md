# CS Travel — Etapa 1 · Módulo de Empresas

Sistema/dashboard web para **CS Travel**, una agencia de viajes corporativos enfocada en alianzas con empresas (y, en etapas futuras, con médicos y clínicas).

Esta entrega corresponde a la **Etapa 1**: un MVP funcional del **módulo de Empresas**, con un dashboard privado para empresas aliadas y un panel administrativo inicial para CS Travel.

---

## Estado de esta carpeta

Esta carpeta contiene un **prototipo funcional local** para auditar flujos, pantallas, datos y experiencia de usuario. La implementacion final solicitada debe montarse dentro de **Wix Studio + Velo by Wix + Wix CMS/Data Collections + Wix Members**.

No debe publicarse este prototipo Vite/json-server como sistema productivo. La guia de montaje Wix esta en:

- `docs/auditoria-etapa-1.md`
- `docs/wix-velo-implementacion.md`

---

## 📌 Descripción

La plataforma permite que las empresas aliadas soliciten viajes corporativos, consulten sus solicitudes, vean costos, ahorro estimado frente a plataformas como Booking/Despegar y el retorno generado por trabajar con CS Travel. A su vez, CS Travel cuenta con un panel administrativo para gestionar empresas, solicitudes y actualizar manualmente los datos económicos.

Es una **SPA (Single Page Application)** de referencia construida sin frameworks pesados, con arquitectura modular pensada para validar la primera etapa antes de replicarla en Wix/Velo.

---

## 🛠️ Tecnologías

| Capa | Tecnología |
|------|-----------|
| Build / Dev server local | **Vite** |
| Lenguaje | **JavaScript Vanilla (ES Modules)** |
| Markup / Estilos | **HTML + CSS** (sin librerías de UI) |
| Backend simulado local | **json-server** (API REST de prueba) |
| Comunicación | **Fetch API** |
| Sesión demo | **localStorage** |
| Produccion requerida | **Wix Studio, Velo, Wix CMS/Data Collections, Wix Members** |

> Sin React, Vue ni Angular. Todo el comportamiento del prototipo se implementa con DOM nativo y módulos ES. Para produccion, replicar los flujos en Wix Studio y mover la logica critica a backend Velo.

---

## 📂 Estructura del proyecto

```
cs-travel/
├── index.html               # Único HTML; contiene <div id="app"> (raíz de la SPA)
├── package.json
├── vite.config.js           # Dev server + proxy /api -> json-server
└── src/
    ├── main.js              # Punto de entrada: arranca router + eventos globales
    ├── data/
    │   └── db.json          # Datos precargados (usuarios, empresas, solicitudes)
    ├── styles/
    │   └── main.css         # Toda la estética del sistema
    ├── router/
    │   └── router.js        # Enrutador SPA por hash + guards + layout
    ├── services/            # CAPA DE DATOS (aislada del resto de la app)
    │   ├── apiService.js    # Único punto que habla con el backend (Fetch)
    │   ├── authService.js   # Login, logout, sesión
    │   ├── companyService.js# CRUD + métricas de empresas
    │   └── requestService.js# CRUD + estados de solicitudes
    ├── utils/
    │   ├── formatCurrency.js
    │   ├── formatDate.js
    │   ├── validators.js
    │   ├── guards.js        # Protección de rutas (auth / rol)
    │   └── escapeHtml.js    # Seguridad básica anti-XSS
    ├── components/          # Funciones que devuelven HTML reutilizable
    │   ├── Navbar.js
    │   ├── Sidebar.js
    │   ├── MetricCard.js
    │   ├── StatusBadge.js
    │   ├── Chart.js         # Graficos SVG sin dependencias (donut, barras, lineas)
    │   ├── QuickCreate.js   # Boton flotante "+" y modal de creacion rapida (empresa/medico)
    │   ├── RequestCard.js
    │   ├── RequestTable.js
    │   ├── UserTable.js     # Data table moderna (avatar, badges, menu de acciones)
    │   └── CompanyTable.js
    └── views/              # Pantallas (cada una: render + afterRender)
        ├── LoginView.js
        ├── AdminDashboardView.js
        ├── AdminCompaniesView.js
        ├── AdminCompanyDetailView.js
        ├── AdminRequestsView.js
        ├── RequestDetailView.js
        ├── CompanyDashboardView.js
        ├── CompanyRequestsView.js
        ├── NewRequestView.js
        ├── NotFoundView.js
        └── NotAuthorizedView.js
```

---

## 🚀 Instalación

Requisitos: **Node.js 18+** y npm.

```bash
# 1. Instalar dependencias
npm install
```

---

## ▶️ Cómo ejecutar el proyecto

Necesitas **dos procesos**: el backend simulado (json-server) y el frontend (Vite).

### Opción A — Todo de una vez (recomendado)

```bash
npm start
```

Esto levanta json-server **y** Vite a la vez (usa `concurrently`).

### Opción B — En dos terminales separadas

```bash
# Terminal 1 -> Backend simulado (API REST en http://localhost:3001)
npm run server

# Terminal 2 -> Frontend (Vite en http://localhost:5173)
npm run dev
```

Luego abre **http://localhost:5173** en el navegador.

> El frontend llama a rutas `/api/...` y Vite las redirige a json-server (ver `vite.config.js`). Si ves errores de carga de datos, verifica que json-server esté corriendo.

---

## 🧪 Usuarios de prueba

| Rol | Email | Contraseña |
|-----|-------|-----------|
| **Admin** | `admin@cstravel.com` | `admin123` |
| Empresa (Clínica Salud Integral) | `sara@clinicasalud.com` | `empresa123` |
| Empresa (TechGlobal Solutions) | `carlos@techglobal.com` | `empresa123` |
| Empresa (Consultora Premium) | `mariana@consultorapremium.com` | `empresa123` |
| Médico (Clínica DermaVital) | `valentina@clinicadermavital.com` | `medico123` |

---

## 🔐 Flujo de autenticación

1. El usuario ingresa email + contraseña en `#/login`.
2. Se valida el formato en el cliente (`validators.js`).
3. `authService.login()` consulta `GET /users?email=...` vía Fetch y compara la contraseña.
4. Si es correcto, la sesión (sin contraseña) se guarda en **localStorage** (`cs_travel_session`).
5. Se redirige al dashboard según el rol.
6. `logout()` borra la sesión y vuelve al login.

> La sesión persiste tras recargar la página (F5) gracias a localStorage.

---

## 🧭 Flujo de rutas (hash routing)

| Ruta | Acceso | Vista |
|------|--------|-------|
| `#/login` | Público | Login |
| `#/first-login` | Usuario autenticado | Configuración inicial de contraseña |
| `#/admin/dashboard` | Admin | Métricas globales |
| `#/admin/users` | Admin | Lista + crear usuarios |
| `#/admin/users/:id` | Admin | Detalle/edición de usuario |
| `#/admin/companies` | Admin | Lista + crear empresas |
| `#/admin/companies/:id` | Admin | Detalle/edición de empresa |
| `#/admin/requests` | Admin | Todas las solicitudes |
| `#/admin/requests/:id` | Admin | Detalle/gestión de solicitud |
| `#/company/dashboard` | Empresa | Dashboard propio |
| `#/company/requests` | Empresa | Sus solicitudes |
| `#/company/requests/new` | Empresa | Nueva solicitud |
| `#/company/requests/:id` | Empresa | Detalle (solo lectura) |
| `#/doctor/dashboard` | Médico | Dashboard propio |
| `#/doctor/cases` | Médico | Casos logísticos de pacientes |
| `#/doctor/cases/new` | Médico | Nuevo caso médico |
| `#/doctor/cases/:id` | Médico | Detalle de caso propio |
| `#/admin/doctors` | Admin | Lista + crear médicos/clínicas |
| `#/admin/doctors/:id` | Admin | Detalle/edición de médico |
| `#/admin/medical-cases` | Admin | Todos los casos médicos |
| `#/admin/medical-cases/:id` | Admin | Detalle/gestión de caso médico |
| `#/admin/kanban` | Admin | Seguimiento operativo tipo Kanban (drag & drop) |
| `#/not-authorized` | — | Acceso denegado (403) |
| `#/not-found` | — | No encontrado (404) |

El router (`router/router.js`):
- Parsea el hash y extrae parámetros dinámicos (`:id`).
- Ejecuta **guards** antes de renderizar: `requireAuth` (sesión) y `requireRole` (rol).
- Redirige automáticamente: sin sesión → `#/login`; rol incorrecto → `#/not-authorized`.
- Envuelve las pantallas autenticadas con navbar + sidebar.

---

## 👥 Roles y permisos

### Admin (CS Travel)
- Ver métricas globales del sistema.
- Listar, crear y editar empresas; activarlas/desactivarlas.
- Ver y crear solicitudes de cualquier empresa.
- Editar solicitudes, cambiar su estado y **eliminarlas**.
- Actualizar manualmente costos, ahorro estimado y retorno (empresa y solicitud).

### Empresa
- Ver **únicamente** su propio dashboard y datos.
- Crear solicitudes de viaje.
- Consultar sus solicitudes, estados, costos, ahorro y retorno.
- **No** puede ver datos de otras empresas (aislamiento garantizado por `companyId` de la sesión y validación en `RequestDetailView`).
- **No** puede eliminar solicitudes (acción exclusiva de admin).

---

## 🏢 Flujo del dashboard de empresa

1. La empresa inicia sesión → `#/company/dashboard`.
2. Ve nombre, estado, código compartido y métricas: total de solicitudes, viajes, costo total, ahorro estimado, retorno, solicitudes activas.
3. Consulta sus solicitudes activas y su historial reciente.
4. Pulsa **“+ Nueva solicitud”** para crear una.

---

## 🧮 Flujo del dashboard administrativo

1. El admin inicia sesión → `#/admin/dashboard`.
2. Ve métricas globales: total/activas de empresas, total/activas de solicitudes, costos gestionados, ahorro y retorno globales.
3. Accede a la lista de empresas (`#/admin/companies`) y a las solicitudes (`#/admin/requests`).
4. Desde el detalle de cada empresa/solicitud, edita datos y actualiza manualmente los valores económicos.

---

## ✈️ Flujo de solicitudes de viaje

1. La empresa (o el admin desde el detalle de la empresa) crea una solicitud:
   - Personas, origen, destino, fecha, clase (turista / ejecutiva).
   - Extras (checkboxes): seguro, actividades, traslados.
   - Observaciones.
2. La solicitud nace con estado **`nueva`** y un código autogenerado (`REQ-AÑO-NNNN`).
3. El admin la gestiona y avanza su estado:
   `nueva → en cotización → cotización enviada → aprobada → en gestión → finalizada` (o `cancelada`).
4. El admin completa costo estimado, referencia Booking/Despegar, ahorro y retorno.
5. La empresa visualiza la evolución en su dashboard.

---

## 🧠 Decisiones técnicas

- **Capa de datos aislada (`apiService.js`)**: ningún otro archivo llama a `fetch()` directamente. Esto centraliza la comunicación y permite **migrar el backend tocando un solo archivo** (ver sección Wix).
- **Hash routing**: simple, sin configuración de servidor y compatible con la mayoría de hostings/embebidos.
- **Componentes como funciones que devuelven HTML**: patrón ligero, sin framework, fácil de leer y reutilizar.
- **Gráficos SVG propios (`Chart.js`)**: donut, barras horizontales y líneas generados como strings de SVG, sin librerías externas. Funcionan en cualquier entorno que renderice HTML (incluido Wix), sin peso adicional en el bundle.
- **Kanban con drag & drop nativo**: API estándar de HTML5 (dragstart/dragover/drop), sin librerías. En móvil/táctil el cambio de estado se hace con el selector de cada tarjeta.
- **Delegación de eventos global** (`main.js`): un único listener atiende clics de toda la app (logout, menú, filas navegables), evitando re-enlazar eventos en cada render.
- **Seguridad básica**: `escapeHtml()` antes de inyectar datos con `innerHTML`; sesión sin contraseña en localStorage.
- **Aislamiento por empresa**: el `companyId` se toma de la sesión, no de la URL, y se valida el acceso a cada solicitud.

> ⚠️ **Nota didáctica de seguridad:** validar credenciales en el cliente y guardar la sesión en localStorage es válido para un MVP/demo, pero **no** es seguro para producción. En una versión real, la autenticación se valida en el servidor con tokens (JWT) o cookies httpOnly.

---

## 🌐 Sobre el despliegue en Wix (etapa futura)

Este MVP está pensado para **correr y validarse localmente** (Vite + json-server). Wix **no** puede ejecutar json-server ni un servidor Node, así que cuando se quiera montar en Wix habrá que sustituir la fuente de datos. La arquitectura ya está preparada para eso:

- **Toda la comunicación con el backend vive en `src/services/apiService.js`.** Para migrar a Wix solo se reescribe ese archivo (y `authService.login`), manteniendo el resto de la app intacto.
- Opciones de migración:
  1. **Velo + Wix Data Collections**: reemplazar las llamadas Fetch por consultas a colecciones de Wix Data desde código Velo. (Opción más nativa.)
  2. **API externa**: alojar un backend real (Node/Express, Supabase, Firebase, etc.) y apuntar `BASE_URL` a esa API.
  3. **Embed estático**: incrustar el build (`npm run build`) en un bloque HTML de Wix usando datos en localStorage/JSON (sin backend real; solo para demo).

---

## 🚫 Fuera de alcance en esta etapa

Esta Etapa 1 **no** incluye (queda preparada la arquitectura para fases futuras):

- Módulo de Médicos / Clínicas y gestión de pacientes.
- Cotización logística para pacientes y margen del médico.
- Integración con Booking, APIs de vuelos/hoteles y cotizaciones en tiempo real.
- Reportes PDF y exportación avanzada a Excel.
- Automatizaciones y notificaciones automáticas.
- Dashboard financiero avanzado.
- App móvil independiente y reservas automatizadas.

---

## 📜 Scripts disponibles

| Script | Acción |
|--------|--------|
| `npm run dev` | Inicia el frontend (Vite). |
| `npm run server` | Inicia json-server (API en :3001). |
| `npm start` | Inicia frontend + backend a la vez. |
| `npm run build` | Genera el build de producción en `dist/`. |
| `npm run preview` | Sirve el build de producción. |

---

CS Travel · Etapa 1 — Módulo Empresas (MVP).
