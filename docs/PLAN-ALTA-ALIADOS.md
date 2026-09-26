# Alta de aliados: registro, expediente y revisión

> Estado: el portal (este repo) ya tiene todo el flujo, probado de punta a punta en el demo.
> Para que funcione en `cstravelgroup.com` falta el lado del servidor, que vive en el
> proyecto Astro (`cstravelgroup`). Este documento es el contrato entre ambos.

## 1. El flujo

```
Conocer ─► Registro ─► Expediente (documentos + firma) ─► Revisión ─► Activo
                          ▲                                  │
                          └──────────── Corrección ◄─────────┤
                                                             └─► Rechazado
```

| Estado (`status`) | Qué significa | Quién lo mueve |
|---|---|---|
| `registrado` | Se registró. Tiene acceso **temporal** y está subiendo documentos. | Servidor, al registrarse |
| `en_evaluacion` | Envió el expediente completo y firmado. Espera revisión. | Aliado, al firmar o reenviar |
| `correccion` | El admin marcó documentos para corregir y se lo devolvió. | Admin |
| `activo` | Todo aprobado. Tiene código, enlace y QR. | Admin («Activar aliado») |
| `rechazado` | No se aprueba. Puede volver a registrarse. | Admin |
| `vencido` | Pasaron 30 días sin enviar el expediente. Puede volver a registrarse. | Tarea diaria del servidor |

Los estados viejos (`pendiente`, `contactado`, `aprobado`, `contrato_enviado`, `firmado`)
se siguen mostrando para las solicitudes que ya existen. No hay que migrarlas.

Código de referencia: `src/utils/allyOnboarding.js` (estados, requisitos, validaciones).

**Compatibilidad:** el portal detecta si el servidor ya soporta el expediente mirando si el
aliado trae `documents` (un arreglo, aunque esté vacío). Si no lo trae, el portal funciona
como antes (firma sola, y el admin puede activar sin revisar documentos). Por eso **se puede
re-empaquetar el portal a producción sin romper nada**; el expediente aparece solo cuando el
servidor empiece a mandar `documents`.

## 2. Decisiones

| Tema | Decisión | Por qué |
|---|---|---|
| Formato | **Todo se guarda en PDF.** La cédula también acepta 1 o 2 fotos (frente y reverso); el navegador las une en **un PDF de una hoja** antes de subirlas. | Lo pidió el dueño. La cédula casi siempre se tiene en foto. |
| Tamaño | Máximo **10 MB** por documento. | Un certificado real pesa menos de 1 MB. |
| Vigencia | Cámara de Comercio y certificación bancaria: **expedidos hace 30 días o menos**. | No lo exige una ley para un convenio entre privados; es la práctica habitual de verificación y la única forma de saber que la representación legal y la cuenta siguen vigentes. Lo confirma quien revisa (casilla en la lista de verificación). |
| Acceso temporal | **30 días** para enviar el expediente. | El dueño dijo 1 o 2 meses. 30 días coincide con la vigencia de los certificados: si se tarda más, igual tendría que pedirlos de nuevo. |
| Reintento | Rechazados y vencidos **pueden volver a registrarse**. | Decisión del dueño. |
| Aviso | **Por correo**, al equipo de CS Travel cuando llega un expediente. | Decisión del dueño. |
| Firma | Casillas + nombre + cédula + cargo, con la **versión** y la **huella SHA-256** del texto firmado. | Ley 527 de 1999: la firma debe identificar al firmante y el documento exacto. |

### Documentos por tipo de persona

| Documento (`type`) | Jurídica | Natural | Formato |
|---|---|---|---|
| `cedula` Cédula del representante legal / propia | ✅ | ✅ | PDF (o fotos → PDF) |
| `rut` RUT | ✅ | ✅ | PDF |
| `camara` Cert. de existencia y representación legal | ✅ | — | PDF, ≤ 30 días |
| `matricula` Cert. de matrícula mercantil | — | ✅ | PDF, ≤ 30 días |
| `banco` Certificación bancaria | ✅ | ✅ | PDF, ≤ 30 días |

## 3. Contrato de la API

El runtime de Wix **solo enruta GET y POST**. Todas las respuestas son JSON con `ok: true`
o `{ ok: false, error: "mensaje para mostrar" }`. Los mensajes de error se muestran tal cual
al usuario: deben estar en español y decir qué hacer.

### Objeto `ally` (lo que devuelven los endpoints del aliado)

```jsonc
{
  "id": "…",
  "company": "Empresa S.A.S.", "nit": "900123456-7",
  "allyType": "empresa",                  // "empresa" | "medico"      ← NUEVO
  "personType": "juridica",               // "juridica" | "natural"   ← NUEVO
  "specialty": "",                        // solo médicos               ← NUEVO
  "contactName": "…", "position": "…", "email": "…", "phone": "…",
  "channel": "colaboradores", "employees": "11-50", "origin": "",
  "status": "registrado",
  "accessExpiresAt": "2026-10-26T…Z",    // NUEVO: createdAt + 30 días
  "documents": [                          // NUEVO
    { "type": "rut", "status": "cargado", // "cargado" | "aprobado" | "rechazado"
      "fileName": "rut.pdf", "size": 184000, "uploadedAt": "…",
      "reviewNote": "",                   // motivo, si status = "rechazado"
      "checks": [], "reviewedAt": "", "reviewedBy": "" }
  ],
  "signature": {                          // NUEVO (null hasta que firme)
    "name": "…", "doc": "1045678912", "position": "…", "signedAt": "…",
    "agreementVersion": "2026-09-17", "agreementHash": "9f2c…", "ip": "…", "userAgent": "…"
  },
  "submittedAt": "…",                     // NUEVO: último envío a revisión
  "correctionNote": "",                   // NUEVO: mensaje general al devolver
  "rejectReason": "",                     // NUEVO
  "partnerCode": "", "partnerTarget": "/", "tracking": { … }, "history": [ … ]
}
```

### Registro — `POST /api/aliados/solicitud` (existe, cambia)

- Recibe además:
  - `allyType`: `empresa` | `medico` (la primera pregunta del registro).
  - `personType`: `juridica` | `natural`. En médicos, `natural` = médico independiente y `juridica` = clínica o centro médico.
  - Empresa: `employees` y `channel` obligatorios. Médico: `specialty` obligatoria; `employees` y `channel` llegan vacíos.
  - Rechazar si falta cualquiera de los obligatorios.
- Crea el usuario con el **rol según el tipo**: `company` para empresas, `doctor` para médicos.
- Crea el usuario con acceso temporal y guarda `status: "registrado"`,
  `accessExpiresAt = ahora + 30 días`, `documents: []`, `signature: null`.
- Si ya existe una solicitud **rechazada o vencida** con ese NIT o correo, **se permite** registrar de nuevo.

### Sesión — `POST /api/auth-session` (existe, cambia)

- La sesión que se siembra en el portal debe traer **`allyStatus`** (el `status` de su solicitud)
  para los usuarios de empresa. Con `registrado`, `en_evaluacion` o `correccion`, el portal
  solo le muestra «Mi convenio» (`#/company/partner` para empresas, `#/doctor/partner` para médicos: es la misma pantalla de expediente). **El servidor debe aplicar la misma regla a los datos**:
  un usuario temporal no puede crear solicitudes de viaje ni leer nada fuera de su expediente.

### Expediente — `POST /api/aliados/expediente` (existe, cambia)

- Devuelve `{ ok, ally }` con los campos nuevos de arriba.

### Subir documento — `POST /api/aliados/documento` (NUEVO)

- `multipart/form-data` con `type` y `file`.
- Validar en el servidor (el navegador ya valida, pero no se confía en él):
  - sesión de empresa y `status` en `registrado` o `correccion`;
  - `type` corresponde a su `personType`;
  - el documento no está `aprobado` (lo aprobado no se reemplaza);
  - el archivo empieza por `%PDF-` (en los primeros 1024 bytes) y pesa ≤ 10 MB.
- Guarda o reemplaza el archivo y deja el documento en `status: "cargado"`, `reviewNote: ""`.
- Responde `{ ok, ally }`.

### Ver documento propio — `GET /api/aliados/documento?type=rut` (NUEVO)

- Devuelve el PDF (`Content-Type: application/pdf`, `Content-Disposition: inline`), solo del usuario de la sesión.

### Acuerdo — `GET /api/aliados/firma` (existe, cambia)

- Devuelve `{ title, version, notice, intro, sections: [{ title, body: [] }] }`.
  **Agregar `version`**: queda guardada con la firma.

### Firmar y enviar — `POST /api/aliados/firma` (existe, cambia)

- Recibe `{ acceptTerms, acceptAuthority, acceptData, name, doc, position, agreementVersion, agreementHash }`.
- Validar: las tres aceptaciones en `true`, `status = registrado`, **todos los documentos de su
  tipo de persona cargados**. Si falta alguno: `{ ok: false, error: "Falta subir: RUT." }`.
- Recalcular la huella en el servidor (SHA-256 del texto del acuerdo, ver
  `agreementText()` en `CompanyPartnerView.js`) y guardar la del servidor. Guardar IP y user agent.
- `status → en_evaluacion`, `submittedAt = ahora`. Correo **`expediente_recibido`** al equipo.
- Responde `{ ok, ally }`.

### Reenviar corrección — `POST /api/aliados/reenviar` (NUEVO)

- Validar `status = correccion` y que no quede ningún documento `rechazado`.
- `status → en_evaluacion`, `submittedAt = ahora`. Correo **`expediente_recibido`** al equipo. La firma se conserva.

### Admin — `POST /api/aliados/admin` (existe, acciones nuevas)

Todas responden `{ ok, item }` con el aliado actualizado. Solo admin.

| `action` | Cuerpo | Qué hace |
|---|---|---|
| `review` | `{ id, type, decision: "aprobado"\|"rechazado", note, checks: [] }` | Dictamina un documento. Solo con `status = en_evaluacion`. Si rechaza, `note` es obligatoria. Guarda `reviewedAt` y `reviewedBy`. |
| `request-correction` | `{ id, note }` | Solo si hay al menos un documento `rechazado`. `status → correccion`. Correo **`correccion_solicitada`** al aliado con cada documento y su motivo. |
| `reject` | `{ id, reason }` | `reason` obligatoria. `status → rechazado`, cierra el acceso temporal. Correo **`solicitud_rechazada`** con el motivo. |
| `activate` (existe) | `{ id, code, target }` | **Nuevo requisito** para aliados con expediente: `status = en_evaluacion`, firma presente y **todos** los documentos `aprobado`. El usuario deja de ser temporal. Correo **`convenio_activo`**. |

### Ver documento de un aliado — `GET /api/aliados/admin/documento?id=…&type=…` (NUEVO)

- Solo admin. Devuelve el PDF `inline` (se abre dentro del visor de la ficha).

## 4. Guardado de los archivos (importante)

Las cédulas y certificaciones bancarias son **datos personales** (Ley 1581 de 2012).

- Los archivos **no pueden quedar en una URL pública**. Hay que confirmar cómo guardarlos
  en privado en Wix; si no hay forma, en otro almacenamiento privado. Siempre se sirven
  a través de los dos endpoints `GET …/documento`, que validan la sesión.
- Nunca se incluyen en el CSV de la bandeja ni en correos.
- Conservarlos mientras dure el convenio. Si se rechaza o vence, definir cuánto tiempo se guardan y borrarlos después.

## 5. Tareas programadas (una vez al día)

- `registrado` o `correccion` con `accessExpiresAt` vencido → `status: vencido`, cerrar acceso,
  correo **`acceso_vencido`** (explica que puede registrarse de nuevo).
- Recordatorio **`recordatorio_expediente`** a los 7 y a los 25 días si no ha enviado el expediente.

## 6. Correos nuevos (plantillas en Brevo)

`expediente_recibido` (al equipo) · `correccion_solicitada` · `solicitud_rechazada` ·
`convenio_activo` · `recordatorio_expediente` · `acceso_vencido`.
Los nombres ya están mapeados en el historial de correos de la ficha del aliado.

## 7. Pendiente

- **Requisitos de médicos independientes.** Hoy se les pide lo mismo que a una persona natural (incluida la matrícula mercantil). Muchos médicos ejercen como profesión liberal y no tienen matrícula mercantil: hay que confirmar con el dueño qué documento la reemplaza (por ejemplo, la tarjeta profesional o el registro en ReTHUS).

- **Texto definitivo del acuerdo** con el Anexo A. El actual dice «preliminar en revisión legal».
- Confirmar el **almacenamiento privado** de los archivos (punto 4).
- Programar el **redireccionamiento de `/aliados`** al registro del portal (`/portal-app/#/registro`)
  y cambiar los enlaces a `/aliados` de la home y de `/portal/`: la landing de aliados se retira.
