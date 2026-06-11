# Auditoria inicial - CS Travel Etapa 1

## Diagnostico inicial

### Funcionalidades completas

- Login de demostracion con roles `admin` y `company`.
- Redireccion basica por rol.
- Dashboard privado de empresa con nombre, estado, codigo de alianza, metricas, solicitudes activas e historial.
- Formulario de nueva solicitud con personas, origen, destino, fecha, clase, seguro, actividades, traslados y observaciones.
- Listado y detalle de solicitudes.
- Panel admin con empresas, solicitudes, cambio de estado y edicion manual de costos, ahorro y retorno.
- Modulo inicial de medicos/clinicas con login, dashboard propio, casos de pacientes, nueva solicitud logistica y gestion admin.
- Seccion admin de usuarios con busqueda, filtros, creacion, edicion, estado, perfil asociado y plantilla de correo de bienvenida.
- Seguimiento operativo tipo Kanban para solicitudes de empresas y casos medicos.
- Separacion de servicios de datos, vistas y componentes en el prototipo.
- Estilos responsive basicos para dashboard, formularios, tablas y menu.

### Funcionalidades incompletas

- No esta implementado dentro de Wix Studio.
- No usa Wix Members para autenticacion real.
- No usa Wix CMS/Data Collections.
- No existen permisos reales de coleccion configurados.
- No hay backend Velo para operaciones criticas.
- La sesion del prototipo usa `localStorage`, valido solo para demo.
- Las contrasenas estan en `db.json`, valido solo para maqueta local.
- No hay roles reales de Wix ni asignacion segura miembro-empresa/medico.
- El flujo de correo de bienvenida queda preparado como plantilla; el envio real debe conectarse a Wix Automations o triggered emails.

### Errores encontrados

- La documentacion original presentaba Vite/json-server como stack principal, aunque el alcance exige Wix/Velo.
- La creacion de solicitudes no guardaba `updatedAt`, campo requerido para trazabilidad.
- La validacion de fecha permitia solicitudes con fechas anteriores al dia actual.
- El aislamiento de datos depende del frontend del prototipo; en produccion debe vivir en backend Velo y permisos de colecciones.

### Riesgos principales

- Riesgo alto de seguridad si se intenta publicar el prototipo Vite como sistema final.
- Riesgo alto de fuga de datos si se confia en filtros de frontend en lugar de backend Velo.
- Riesgo medio de inconsistencias si las metricas de empresa se editan manualmente sin una politica clara de recalculo.
- Riesgo medio de confusion de alcance si se agregan APIs externas, reportes avanzados o automatizaciones antes de cerrar los flujos base de empresas y medicos.

### Faltantes para cumplir la primera etapa en Wix

- Crear colecciones `Companies`, `TravelRequests` y `UserRoles`.
- Crear colecciones `Doctors` y `MedicalCases` si medicos queda incluido en la primera version.
- Asociar cada empresa con el `memberId` de Wix Members.
- Crear paginas privadas para empresa y admin.
- Implementar funciones backend Velo para consultar empresa actual, crear solicitudes, listar solicitudes propias y administrar solicitudes.
- Configurar permisos de colecciones con acceso minimo desde frontend.
- Crear roles de sitio: `CS Travel Admin` y `Company Member`.
- Ajustar los elementos visuales del prototipo a componentes Wix Studio.

### Mejoras visuales necesarias

- Mantener dashboard sobrio, corporativo y limpio.
- Usar cards de metricas con jerarquia clara.
- En movil, reemplazar tablas anchas por repetidores tipo lista o cards compactas.
- Usar estados con badges consistentes.
- Reducir textos largos dentro de la interfaz y dejar contenido explicativo para documentacion.

### Mejoras tecnicas necesarias

- Mover validaciones criticas a backend Velo.
- No permitir que el frontend envie `companyId` editable al crear solicitudes.
- Registrar `createdAt` y `updatedAt`.
- Centralizar validacion de rol.
- Usar consultas filtradas por `memberId` y referencias a `Companies`.
- Documentar permisos de cada coleccion antes de cargar datos reales.

## Correcciones aplicadas en el prototipo

- Se agrego validacion para impedir fechas de viaje pasadas.
- Se agrego `updatedAt` al crear y actualizar solicitudes.
- Se agrego una guia tecnica Wix/Velo con colecciones, permisos, paginas y funciones backend sugeridas.
- Se ajusto el README para dejar claro que Vite/json-server es un prototipo de validacion, no la tecnologia final de produccion.
- Se agrego el modulo inicial de medicos/clinicas al prototipo: usuario medico, dashboard, casos, alta de caso, vistas admin y edicion de cotizacion logistica.
- Se agrego gestion de usuarios en admin, bloqueo de usuarios inactivos y pantalla de configuracion inicial para `firstLoginRequired`.
- Se agrego tablero Kanban administrativo con cambio de estado para solicitudes y casos medicos.
- Se agregaron campos de cotizacion manual: detalle de cotizacion, notas visibles, notas internas y prioridad.

## Checklist de cumplimiento

### Cliente Empresa

- Puede iniciar sesion: cubierto en demo; en Wix debe hacerse con Wix Members.
- Solo ve su informacion: cubierto en demo por filtros; en Wix debe reforzarse con backend y permisos.
- Ve dashboard: cubierto.
- Ve solicitudes: cubierto.
- Crea nueva solicitud: cubierto.
- Consulta estado: cubierto.
- Ve costos/ahorro/retorno si estan cargados: cubierto.

### Admin CS Travel

- Puede ver empresas: cubierto.
- Puede ver solicitudes: cubierto.
- Puede editar informacion: cubierto.
- Puede cambiar estados: cubierto.
- Puede actualizar costos, ahorro y retorno: cubierto.
- Puede revisar datos por empresa: cubierto.
- Puede ver medicos/clinicas: cubierto.
- Puede ver casos medicos: cubierto.
- Puede actualizar estado y valores logisticos de casos medicos: cubierto.

### Medico / Clinica

- Puede iniciar sesion: cubierto en demo; en Wix debe hacerse con Wix Members.
- Solo ve sus casos: cubierto en demo por filtros; en Wix debe reforzarse con backend y permisos.
- Ve dashboard propio: cubierto.
- Crea nuevo caso logistico de paciente: cubierto.
- Consulta estado y valores del caso: cubierto.

### Sistema

- Tiene estructura de colecciones clara: documentada para Wix.
- Tiene rutas o paginas privadas protegidas: demo con guards; Wix debe configurarse con paginas privadas y roles.
- Tiene permisos bien planteados: documentados para Wix.
- Guarda datos correctamente: cubierto en demo local; pendiente de implementar en Wix Data.
- Muestra errores y confirmaciones: cubierto parcialmente.
- Es responsive: cubierto de forma basica.
- Se ve profesional: cubierto como prototipo.
- Esta preparado para crecer despues: cubierto a nivel de estructura y documentacion.
