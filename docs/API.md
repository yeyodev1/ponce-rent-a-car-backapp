# Contrato del API — Ponce's Rent a Car

Base: `/api`. Respuestas con cuerpo desnudo (`res.json(item)`), listas paginadas `{ items, total, page, pages }`,
errores `{ message }` en español. Montos SIEMPRE en centavos enteros (USD). Fechas en ISO 8601; la zona de negocio es
`America/Guayaquil` (UTC-5, sin horario de verano).

Textos bilingües en modelos de contenido: `{ es: string, en: string }` (tipo `I18nText`). El frontend elige el idioma.

Auth admin: `Authorization: Bearer <token>` + `accountType: "admin"`. Todo lo que está bajo `/api/admin/*` usa
`authMiddleware` + `adminMiddleware`.

---

## 1. Público — catálogo y configuración

### `GET /api/public/config`
Configuración que el sitio necesita al arrancar.
```jsonc
{
  "business": { "name": "Ponce's Rent a Car", "phone": "+593998119853", "whatsapp": "593998119853",
                "email": "", "address": "", "mapsUrl": "", "hours": { "es": "", "en": "" } },
  "booking": {
    "maxDaysAhead": 5,              // Ruta B solo permite retiros dentro de hoy..hoy+5
    "minHoursNotice": 3,           // horas mínimas entre ahora y el retiro
    "depositMode": "fixed",        // "fixed" | "percent" | "none"
    "depositValue": 5000,          // centavos si fixed, porcentaje entero si percent
    "guaranteeAmount": 50000,      // garantía Datafast, informativo (NO se cobra online)
    "mileage": { "limitedKmPerDay": 150, "extraKmPrice": 25, "unlimitedPricePerDay": 2500 },
    "locations": [ { "code": "airport", "label": { "es": "Aeropuerto de Guayaquil", "en": "Guayaquil Airport" }, "fee": 0 },
                   { "code": "office",  "label": {...}, "fee": 0 },
                   { "code": "hotel",   "label": {...}, "fee": 0 },
                   { "code": "other",   "label": {...}, "fee": 0 } ]
  },
  "payphoneEnabled": false,        // true si PAYPHONE_TOKEN y STORE_ID están configurados
  "whatsappCloudEnabled": false
}
```

### `GET /api/public/categories`
Categorías activas ordenadas por `order`.
```jsonc
[{ "_id": "", "slug": "suv", "name": { "es": "SUV", "en": "SUV" },
   "tagline": { "es": "Más espacio y comodidad", "en": "More space and comfort" },
   "description": { "es": "", "en": "" },
   "passengers": 5, "luggage": 3, "transmission": "automatic", "airConditioning": true,
   "pricePerDay": 8000, "image": "https://...", "gallery": ["https://..."],
   "exampleModels": "Chevrolet Tracker o similar",
   "features": [{ "es": "", "en": "" }], "order": 3, "isActive": true,
   "availableUnits": 2 }]
```
### `GET /api/public/categories/:slug` — una categoría (404 si no existe o inactiva).

### `GET /api/public/coverages`
```jsonc
[{ "_id": "", "code": "standard", "name": {..}, "description": {..},
   "includes": [{..}], "excludes": [{..}], "pricePerDay": 0, "isDefault": true, "order": 1 },
 { "code": "preferential", "pricePerDay": 1500, "isDefault": false, ... }]
```

### `GET /api/public/extras`
```jsonc
[{ "_id": "", "code": "child-seat", "name": {..}, "description": {..}, "icon": "fa-baby",
   "price": 1000, "pricing": "per_day" /* | "per_rental" */, "maxQuantity": 2, "isActive": true }]
```

### Contenido
- `GET /api/public/promotions` → promociones activas y vigentes (`startsAt <= hoy <= endsAt`).
  `{ _id, slug, title, body, conditions, image, startsAt, endsAt, categorySlug, ctaLabel, ctaUrl, badge }` (textos I18nText).
- `GET /api/public/hotels` → `{ _id, slug, name, zone, description, benefit, promotion, image, website, phone, order }`.
- `GET /api/public/guides` → `{ _id, slug, title, excerpt, cover, readingMinutes, destination, distanceKm, driveTime, publishedAt }`.
- `GET /api/public/guides/:slug` → + `sections: [{ heading: I18nText, body: I18nText }]`, `seo`.
- `GET /api/public/faqs?topic=` → `{ _id, topic, question, answer, order }`. Topics: `guarantee, mileage, license, age, fuel, coverage, damage, cancellation, airport, payments, return, driver`.
- `GET /api/public/seo/:key` → `{ key, title, description, h1, intro, canonical, ogImage }` (I18nText salvo `key`, `canonical`, `ogImage`).
  Keys: `home, fleet, airport, business, promotions, hotels, guides, faq, partner, renaissance, contact,
  landing-guayaquil, landing-suv, landing-trucks, landing-long-term`.
- `GET /api/public/sitemap.xml` → XML.

---

## 2. Leads (Ruta A, formularios, WhatsApp)

### `POST /api/public/leads`
Se llama ANTES de abrir WhatsApp / llamar. Crea o actualiza (si llega `leadId`).
```jsonc
// body
{
  "leadId": null,                          // para actualizar el mismo lead (p. ej. al elegir canal)
  "source": "route_a",                     // route_a | corporate | partner | hotel | contact | renaissance | booking_abandoned
  "language": "es",                        // es | en
  "startDate": "2026-10-05",               // YYYY-MM-DD
  "startTime": "10:00",                    // HH:mm aproximada
  "duration": "4-7",                       // "1" | "2-3" | "4-7" | "8-15" | "16-30" | "30+"
  "location": "airport",                   // airport | office | hotel | other
  "passengers": "3-5",                     // "1-2" | "3-5" | "6+"
  "channel": "whatsapp",                   // whatsapp | call | callback  (opcional)
  "name": "", "phone": "", "email": "",    // opcionales
  "company": "", "vehicles": 0, "comments": "", // corporate
  "categorySlug": "",                       // opcional
  "attribution": { "utmSource": "", "utmMedium": "", "utmCampaign": "", "utmContent": "", "utmTerm": "",
                   "fbclid": "", "gclid": "", "referrer": "", "landingPage": "" },
  "eventId": ""                            // opcional: mismo id que el Pixel, para deduplicar en Conversions API
}
// 201
{ "_id": "", "code": "R1048", "status": "new", "tags": ["long_term"],
  "whatsappUrl": "https://wa.me/593998119853?text=...",   // mensaje prellenado con el código y el resumen
  "phoneUrl": "tel:+593998119853" }
```
Reglas: `duration === "30+"` agrega el tag `long_term`. `source === "corporate"` agrega `corporate`.
`channel === "callback"` exige `phone`. Idempotente por `leadId`.

### `GET /api/public/geo`
`{ country }` desde el header `x-vercel-ip-country` (vacío en local). Señal secundaria de idioma.

### `POST /api/public/partners` — Socio sobre Ruedas
`{ name, whatsapp, city, vehicleType, brand, model, year, photos: string[] (dataURL o URL), language }` → `201 { _id, code }`.

### `POST /api/public/renaissance` — interés en el club
`{ name, email, phone, language }` → `201 { ok: true }`.

### WhatsApp Cloud API
- `GET  /api/whatsapp/webhook` — verificación de Meta (`hub.mode`, `hub.verify_token`, `hub.challenge`).
- `POST /api/whatsapp/webhook` — mensajes entrantes y respuestas de Flow (`nfm_reply`). Firma `X-Hub-Signature-256` con `WHATSAPP_APP_SECRET`.
  - Mensaje con código `R####` → asocia el teléfono al lead, envía el Flow (prioridad + nombre).
  - Sin código (viene de un anuncio) → crea lead `source: "whatsapp_ad"` y envía el Flow completo.
  - Texto "asesor"/"advisor" o botón "Hablar con un asesor" → marca `needsHuman: true` y avisa al asesor.
  - Respuesta del Flow → guarda `priority`, `specificVehicle`, `name`; envía resumen al asesor (`ADVISOR_WHATSAPP`).

---

## 3. Reserva directa (Ruta B)

### `POST /api/public/quote`
Cotización en vivo; el frontend la llama cada vez que cambia una opción. NO guarda nada.
```jsonc
// body
{ "categorySlug": "suv", "pickupAt": "2026-10-05T10:00:00-05:00", "returnAt": "2026-10-09T10:00:00-05:00",
  "pickupLocation": "airport", "returnLocation": "airport",
  "mileage": "limited",              // limited | unlimited
  "coverage": "standard",            // code
  "extras": [{ "code": "child-seat", "quantity": 1 }],
  "promoCode": "" }
// 200
{ "days": 4, "available": true, "availableUnits": 2,
  "lines": [ { "key": "base", "label": { "es": "SUV × 4 días", "en": "SUV × 4 days" }, "amount": 32000 },
             { "key": "mileage", "label": {..}, "amount": 0 },
             { "key": "coverage", "label": {..}, "amount": 0 },
             { "key": "extra:child-seat", "label": {..}, "amount": 4000 },
             { "key": "location", "label": {..}, "amount": 0 } ],
  "total": 36000, "deposit": 5000, "guaranteeAmount": 50000,
  "mileageInfo": { "includedKm": 600, "extraKmPrice": 25 },
  "errors": [] }   // p. ej. "La fecha de retiro supera el máximo de 5 días" (entonces available=false)
```
Días = ceil((returnAt − pickupAt) / 24h), mínimo 1. Se valida la ventana de `maxDaysAhead` y `minHoursNotice`.

### `POST /api/public/reservations`
Crea la reserva en `pending_payment`, **re-cotiza en el servidor**, asigna una unidad libre y la pre-reserva
(hold de 20 min). Guarda el snapshot de precios (no cambia si luego cambian las tarifas).
```jsonc
// body: lo mismo de /quote +
{ "driver": { "name": "", "documentType": "cedula", /* cedula | passport */ "documentNumber": "",
              "email": "", "phone": "", "country": "EC", "birthDate": "" },
  "language": "es", "leadId": null, "attribution": {..} }
// 201
{ "_id": "", "code": "PON-1048", "status": "pending_documents", "accessToken": "<hex 32>",
  "holdExpiresAt": "", "pricing": { lines, total, deposit, days, ... } }
```
`accessToken` permite al cliente (sin cuenta) ver y continuar SU reserva: se envía como `?t=` o header `X-Reservation-Token`.
409 si no hay unidades libres para esas fechas. Evita duplicados: misma cédula + mismas fechas + estado activo → devuelve la existente.

### `POST /api/public/reservations/:code/documents?t=`
`multipart/form-data` con campos `license` y/o `identity` (imagen JPG/PNG/WebP o PDF, máx 8 MB). También acepta JSON
`{ kind: "license"|"identity", dataUrl }`. Se guardan de forma privada (no hay URL pública). → `{ documents: { license: true, identity: true }, status }`.
Con ambos documentos el estado pasa a `pending_payment`.

### `GET /api/public/reservations/:code?t=`
Estado público de la reserva: `{ code, status, verification, category, pickupAt, returnAt, pickupLocation, returnLocation,
mileage, coverage, extras, pricing, amountPaid, balance, guaranteeAmount, driver: { name, email }, documents, holdExpiresAt, contract }`.

### `POST /api/public/reservations/:code/checkout?t=`
`{ mode: "deposit" | "full" }` → crea un `Payment` pendiente y devuelve la configuración de la Cajita:
```jsonc
{ "token": "", "storeId": "", "clientTransactionId": "PON1048-1727...", "amount": 5000, "amountWithoutTax": 5000,
  "currency": "USD", "reference": "Reserva PON-1048", "email": "", "phoneNumber": "+593...", "documentId": "" }
```
503 si Payphone no está configurado.

### `POST /api/public/payments/confirm`
`{ id, clientTransactionId }` → confirma contra Payphone. Idempotente. Si aprobado: pago `approved`, reserva
`confirmed`, unidad `reserved`, correo de confirmación, evento Conversions API. → `{ status: "approved"|"canceled"|"error", reservationCode, accessToken, message }`.

Estados de reserva: `pending_documents → pending_payment → confirmed → delivered → completed`, además `cancelled`, `expired`.
Verificación (independiente): `pending | verified | needs_info | rejected`.
Estados de unidad: `available | prereserved | reserved | rented | maintenance | blocked`.

---

## 4. Admin (`/api/admin/*`)

Listas aceptan `?page=&limit=&q=&status=` y devuelven `{ items, total, page, pages }`.

- `GET /admin/dashboard` → `{ kpis: { leadsMonth, leadsPrevMonth, reservationsMonth, reservationsPrevMonth, revenueMonth, revenuePrevMonth, conversionRate },
  leadsByStatus: {status: n}, leadsBySource: [{ source, count }], reservationsByMonth: [{ month: "2026-09", count, revenue }],
  latestReservations: [...5], latestLeads: [...5], fleet: { available, prereserved, reserved, rented, maintenance, blocked } }`
- Leads: `GET /admin/leads`, `GET /admin/leads/:id`, `PATCH /admin/leads/:id` (`status`, `assignedTo`, `categorySlug`, campos),
  `POST /admin/leads/:id/notes` `{ text }`, `DELETE /admin/leads/:id` (204). Filtros extra: `source, tag, from, to, needsHuman=true`.
  Estados: `new, contacted, quoted, reserved, delivered, closed, lost`.
- Reservas: `GET /admin/reservations`, `GET /admin/reservations/:id` (incluye pagos y documentos meta),
  `PATCH /admin/reservations/:id` (`status`, `vehicleId`, `verification`, `verificationNote`, `notes`),
  `GET /admin/reservations/:id/documents/:kind` → devuelve el archivo (stream con su content-type).
- Clientes: `GET /admin/customers`, `GET /admin/customers/:id` (+ reservas y leads).
- Pagos: `GET /admin/payments`.
- Flota: CRUD `/admin/categories`, `/admin/vehicles` (`PATCH /admin/vehicles/:id/status` `{ status }`),
  `GET /admin/availability?from=&to=` → `[{ vehicle, busy: [{ from, to, reservationCode, status }] }]`.
- Tarifas: CRUD `/admin/coverages`, `/admin/extras`; `GET|PUT /admin/settings` (el objeto `booking` y `business` de `/public/config`, más `integrations: { webhookUrl }`).
- Contenido: CRUD `/admin/promotions`, `/admin/hotels`, `/admin/guides`, `/admin/faqs`, `/admin/seo` (por `key`),
  `/admin/partners` (solo GET/PATCH estado: `new, reviewing, approved, rejected`), `/admin/renaissance` (GET).
- Subida de imágenes públicas: `POST /admin/uploads` (multipart `file`) → `{ url, publicId }` (Cloudinary).
- Exportación: `GET /admin/export/:entity.csv` con `entity` en `leads | customers | reservations | payments`.

CRUD estándar: `GET /x` (lista), `GET /x/:id`, `POST /x`, `PUT /x/:id`, `DELETE /x/:id`.

## 5. Integraciones salientes

- `WEBHOOK_URL` (o `settings.integrations.webhookUrl`): POST JSON `{ event, data, at }` en `lead.created`, `lead.updated`,
  `reservation.created`, `reservation.confirmed`, `payment.approved`. Firma HMAC-SHA256 en `X-Ponce-Signature` con `WEBHOOK_SECRET`.
  Pensado para conectar Kommo / HubSpot / Zoho sin cambiar código.
- Meta Conversions API (`META_PIXEL_ID` + `META_CAPI_TOKEN`): `Lead` al crear lead, `InitiateCheckout` al crear reserva, `Purchase` al confirmar pago.

---

## 6. v1.1 — Especificaciones del sistema (roles, pagos manuales, ciclo estricto)

### Roles del personal
`accountType`: `employee` | `admin` (los clientes NO tienen cuenta: ven su reserva con el enlace seguro `?t=`).
- **employee** — todo lo operativo: dashboard, leads, reservas (avanzar estado, crear reserva presencial, registrar pagos), clientes, pagos (consulta), flota (crear/editar categorías y unidades, cambiar estado), disponibilidad, contenido (crear/editar).
- **admin** — todo lo anterior + **eliminar** (vehículos y cualquier otro DELETE), **gestionar personal**, **tarifas y configuración** (`/admin/settings`, coberturas, extras), **integraciones**, **exportar CSV** y **reembolsos**.
- `/auth/login` y `/auth/me` devuelven `accountType`. Middlewares: `staffMiddleware` (employee|admin) y `adminMiddleware` (solo admin). Un 403 responde `{ message: "Solo un administrador puede hacer esto" }`.

### Personal (solo admin)
- `GET /admin/staff` → `{ items: [{ id, name, email, phone, accountType, isActive, lastLoginAt, createdAt }], total, page, pages }`
- `POST /admin/staff` `{ name, email, phone, accountType: "employee"|"admin", password }` (mín. 8) → 201
- `PUT /admin/staff/:id` `{ name?, email?, phone?, accountType?, password? }`
- `PATCH /admin/staff/:id/active` `{ isActive: boolean }` — no se eliminan cuentas. Un admin no puede desactivarse ni quitarse el rol a sí mismo, ni dejar el sistema sin ningún admin activo.
- Una cuenta desactivada no puede iniciar sesión y su token deja de servir.

### Ciclo de vida de la reserva (estricto, sin saltos ni retrocesos)
Estado visible → estado interno: **Pendiente** = `pending_documents`/`pending_payment`, **Confirmada** = `confirmed`, **En curso** = `delivered`, **Completada** = `completed`, **Cancelada** = `cancelled` (final), `expired` (final, solo lo pone el sistema).
Transiciones permitidas en `PATCH /admin/reservations/:id { status }`:
`pending_* → confirmed | cancelled`, `confirmed → delivered | cancelled`, `delivered → completed`. Cualquier otra → 409 `"No se puede pasar de X a Y"`.
Para pasar a `delivered` la reserva debe tener unidad asignada. Cada respuesta de reserva admin incluye `allowedTransitions: string[]`.

### Pagos manuales y estado de pago
- `POST /admin/reservations/:id/payments` `{ amount (centavos > 0), method: "cash"|"transfer"|"card", note? }` → 201 Payment (`provider: "manual"`, `mode: "manual"`, `status: "approved"`, `registeredBy` = usuario de la sesión). No se permite en reservas `cancelled`/`expired`.
- `POST /admin/payments/:id/refund` (solo admin) → status `refunded`, `refundedAt`.
- `reservation.paymentStatus` lo calcula el sistema tras cada pago/reembolso: `pending` (0 aprobado), `partial` (0 < pagado < total), `paid` (pagado ≥ total), `refunded` (había pagos y todos quedaron reembolsados). `amountPaid` = suma de aprobados; `balance` = max(total − amountPaid, 0).
- `GET /admin/payments` incluye `method`, `status`, `registeredBy`, `reservationCode`, `createdAt`/`approvedAt`, filtros `status`, `method`, `from`, `to`.

### Reserva presencial (walk-in)
`POST /admin/reservations` `{ categorySlug, vehicleId?, pickupAt, returnAt, pickupLocation, returnLocation, mileage, coverage, extras, driver: {...}, notes?, language? }`
- Precio calculado en el servidor (mismo motor que `/public/quote`), congelado.
- Sin ventana de 5 días (el personal puede reservar más adelante); el retiro no puede ser en el pasado (tolerancia 15 min).
- `channel: "walk_in"`, `createdBy` = usuario de la sesión, sin hold (no expira), status `pending_payment`.
- Devuelve la reserva + `accessToken` (para enviarle el enlace al cliente).

### Doble reserva bloqueada también en base de datos
La asignación de unidad corre en una **transacción de MongoDB**: dentro de la transacción se revisa el solape y se incrementa `vehicle.lockVersion`; dos asignaciones simultáneas de la misma unidad chocan (WriteConflict) y la segunda reintenta viendo a la primera. Aplica a reservas web, presenciales y a reasignaciones del admin.

### Dashboard (se agregan)
`fleetSummary: { available, total }` (available = unidades activas sin mantenimiento/bloqueo y sin reserva en curso hoy), `reservationCounts: { pending, confirmed, inProgress }`, `today: { deliveries, returns, deliveriesList: [...], returnsList: [...] }` (retiros/devoluciones con fecha de hoy en Guayaquil, estados confirmed/delivered), `revenueMonth` = pagos aprobados del mes (en línea + manuales) menos reembolsados.

### Vehículos
Campos nuevos: `fuel` (`gasoline|diesel|hybrid|electric`), `seats`, `mileageKm`, `description`. Estados visibles: disponible = `available`, en mantenimiento = `maintenance`, inactivo = `blocked` o `isActive: false`.

### Catálogo público
- Nueva categoría **lujo** (Lujo / Luxury).
- `GET /public/categories?from=&to=` (ISO) → `availableUnits` calculado para ese rango.
- `GET /public/categories/:slug` agrega `units: [{ brand, model, year, transmission, fuel, seats, color, image }]` de unidades activas (sin placa ni datos internos) — dato secundario, la venta sigue siendo por categoría.

---

## 7. v1.2 — "Qué no incluye el sistema todavía" (cerrado)

### Licencia de conducir
- `driver` (en `POST /public/reservations` y `POST /admin/reservations`) agrega `licenseNumber` (4–20 alfanum.), `licenseExpiresAt` (`YYYY-MM-DD`) y `licenseCountry` (ISO-2, opcional; por defecto el país de residencia). Obligatorios en la web.
- Regla: la licencia debe estar vigente **hasta la fecha de devolución** (`licenseExpiresAt >= fecha de returnAt en Guayaquil`). Si no: 400 `"Tu licencia vence antes de la devolución del vehículo"` con `errorCode: "license_expired"`.
  El cuerpo de error sigue siendo `{ message }`; cuando el error trae código estable se agrega `errorCode` (`CustomError#withCode`).
- En la reserva presencial el API valida la licencia solo si llega (el panel la pide siempre); en la web es obligatoria.
- Se guardan en `Customer`. El detalle admin de reserva y de cliente las muestra; el admin puede corregirlas en `PATCH /admin/customers/:id` `{ name?, email?, phone?, licenseNumber?, licenseExpiresAt?, licenseCountry?, notes? }`.

### El cliente actualiza sus datos (sin cuenta)
- `PATCH /public/reservations/:code/contact?t=` `{ email?, phone? }` (E.164). Permitido mientras la reserva no esté `completed`, `cancelled` ni `expired`. Actualiza el `Customer`. → devuelve la reserva pública. 409 si está cerrada.
- `GET /public/reservations/:code` agrega `driver.phone` para prellenar el formulario.
- Nombre y documento no se editan (van atados a los documentos verificados): se cambian por el asesor.

### Fotos sin Cloudinary
- `POST /admin/uploads` (multipart `file`, imagen jpg/png/webp ≤ 8 MB): si Cloudinary está configurado sube allá; si no, guarda en la colección `Media` y devuelve `{ url: "<API_BASE>/api/public/media/<id>", publicId: "media:<id>" }` (URL absoluta usando `API_PUBLIC_URL` o el host del request). Ya no responde 503.
- `GET /public/media/:id` → la imagen con su `Content-Type` y `Cache-Control: public, max-age=31536000, immutable`. 404 `{ message }` si el id no existe o es inválido.
- Vercel corta cuerpos de más de 4,5 MB: el panel comprime en el navegador (≤1600 px, WebP/JPEG) antes de subir.
- Unidades: `images` editable desde el panel (subir, ordenar, quitar). `units[].image` en el catálogo público toma la primera.

### Eliminar personal
- `DELETE /admin/staff/:id` (solo admin) → 204. No se puede eliminar a uno mismo ni al último admin activo. Los pagos/reservas conservan el snapshot `registeredBy` / `createdBy`, así que el historial no se pierde.

---

## 8. v1.3 — Operación completa (pedidos del chat del cliente)

### A. Entrega y devolución (actas) + historial del vehículo  — admin (staff)
- `GET /admin/reservations/:id/inspections` → `{ delivery: Inspection | null, return: Inspection | null, comparison: { kmDriven, includedKm, extraKm, extraKmCharge, fuelDiff (octavos, negativo = faltó), newDamages: number } | null }`.
- `POST /admin/reservations/:id/inspections` `{ type: "delivery"|"return", mileageKm, fuelLevel (0-8), photos: [{url,label}], damages: [{zone, description, severity, photo}], checklist: {...}, notes, customerAgreedName }` → 201.
  - `delivery`: solo con reserva `confirmed` y unidad asignada; **pasa la reserva a `delivered`** (En curso) en la misma operación, actualiza `vehicle.mileageKm`.
  - `return`: solo con reserva `delivered` y con acta de entrega; `mileageKm >= km de entrega`; marca `isNew` en daños que no estaban en la entrega; **pasa la reserva a `completed`**, actualiza `vehicle.mileageKm`; si hay daños nuevos crea un `VehicleLog` tipo `damage`.
  - El PATCH de estado a `delivered`/`completed` sigue funcionando (sin acta) por compatibilidad, pero el panel usa las actas.
  - Las fotos se suben con `POST /admin/uploads` (respaldo en Media) y aquí se mandan sus URLs.
- `PUT /admin/reservations/:id/inspections/:type` — corregir un acta (solo admin).
- `GET /admin/vehicles/:id/history` → `{ vehicle, timeline: [{ kind: "reservation"|"inspection"|"log", at, title, detail, reservationCode?, mileageKm?, cost?, by? }], stats: { rentals, kmDriven, revenue, lastInspectionAt } }` ordenado del más reciente al más antiguo.
- `GET|POST /admin/vehicles/:id/logs`, `DELETE /admin/vehicles/:id/logs/:logId` (DELETE solo admin). `POST { type, date, mileageKm, cost (centavos), description }`.

### B. Garantía y anulación de pagos — admin (staff salvo donde se indica)
- `reservation.guarantee` (ver modelo): `amount` se inicializa con `pricing.guaranteeAmount`.
- `PATCH /admin/reservations/:id/guarantee` `{ action: "hold"|"release"|"charge", amount?, method?, reference?, chargedAmount?, chargeReason?, notes? }`:
  - `hold` (pending → held): registra método (datafast/cash/transfer), referencia/voucher y monto.
  - `release` (held → released).
  - `charge` (held → charged | partially_charged según `chargedAmount` vs `amount`): exige `chargeReason`; **solo admin**.
  - Transiciones inválidas → 409.
- `POST /admin/payments/:id/void` `{ reason }` — anula un pago registrado por error (no hubo dinero): status `voided`, `voidedAt`, `voidReason`, `voidedBy`; solo pagos `approved` **manuales**; recalcula `paymentStatus` (los anulados no cuentan). Staff puede anular dentro de las 24 h siguientes al registro; después, solo admin. Diferencia con reembolso: reembolso = sí hubo dinero y se devolvió.
- Dashboard `kpis`/listados y CSV de pagos reflejan `voided`.

### C. Contrato y aceptación electrónica
- Plantillas (solo admin): `GET /admin/contract-templates`, `GET /admin/contract-templates/active`, `POST /admin/contract-templates` `{ title: I18nText, body: I18nText }` (crea **versión nueva** y la activa; las anteriores quedan inactivas e inmutables), `POST /admin/contract-templates/preview` `{ body, reservationId? }` → `{ text }`.
- Variables disponibles (documentadas en `GET /admin/contract-templates/variables`): `{{reserva.codigo}} {{reserva.retiro}} {{reserva.devolucion}} {{reserva.lugarRetiro}} {{reserva.lugarDevolucion}} {{reserva.dias}} {{reserva.kilometraje}} {{reserva.cobertura}} {{reserva.extras}} {{reserva.total}} {{reserva.garantia}} {{cliente.nombre}} {{cliente.documento}} {{cliente.email}} {{cliente.telefono}} {{cliente.pais}} {{cliente.licencia}} {{cliente.licenciaVence}} {{vehiculo.categoria}} {{vehiculo.marca}} {{vehiculo.modelo}} {{vehiculo.anio}} {{vehiculo.placa}} {{vehiculo.color}} {{empresa.nombre}} {{empresa.telefono}} {{empresa.direccion}} {{fecha.hoy}}`. Si la reserva aún no tiene unidad, `vehiculo.*` dice "Por asignar".
- Seed: plantilla v1 de ejemplo ES/EN (cláusulas típicas de alquiler en Ecuador, marcada "Texto de ejemplo: reemplazar por el contrato revisado por su abogado").
- Público (token de la reserva):
  - `GET /public/reservations/:code/contract?t=` → `{ status, version, title, text, hash?, acceptance? }` (genera el texto con la plantilla activa si aún no está aceptado; con unidad asignada o "Por asignar").
  - `POST /public/reservations/:code/contract/accept?t=` `{ name, documentNumber, accepted: true }` → valida que `name`≈nombre del cliente (normalizado, sin tildes/mayúsculas) y `documentNumber` = documento del cliente; congela `renderedText`, calcula `hash` SHA-256, guarda `acceptance {name, documentNumber, ip, userAgent, at}`, `status: "signed"`, `signedAt`, `version`. Idempotente. Estados `cancelled`/`expired` → 409.
  - `GET /public/reservations/:code/contract.pdf?t=` → PDF (pdfkit) del contrato: si está firmado, el texto congelado + bloque "Aceptado electrónicamente por … el … desde IP … · Huella SHA-256 …"; si no, marca de agua "BORRADOR".
- Admin: `GET /admin/reservations/:id/contract` (igual al público, + `renderedText`), `GET /admin/reservations/:id/contract.pdf`.
- Regla de negocio: setting `booking.contractRequired` (default `true`): con `true`, `POST /public/reservations/:code/checkout` responde 409 `{ message: "Acepta el contrato antes de pagar", errorCode: "contract_required" }` si el contrato no está firmado. El panel puede confirmar sin contrato (reservas presenciales firmadas en papel), mostrando advertencia.
- Correo de confirmación incluye el enlace al PDF.

### D. Registro de accesos (auditoría) — solo admin
- Se registran: `login` / `login_failed` (con email intentado en summary), `logout` (si existe), y todas las mutaciones del panel (POST/PUT/PATCH/DELETE bajo `/admin`) con acción legible, entidad e id; además acciones sensibles explícitas (cambio de estado de reserva, pagos, reembolsos, anulaciones, garantía, actas, contrato, personal, exportaciones CSV, configuración). Servicio: `logAudit()` en `src/services/audit.service.ts`.
- `GET /admin/audit?actor=&action=&entity=&from=&to=&q=&page=` → `{ items, total, page, pages }`; `GET /admin/audit/export.csv`.
- Retención 1 año (TTL).

### E. Página pública por vehículo
- `vehicle.slug` (auto: `marca-modelo-anio-<4 hex>`, sin placa; se genera al crear y por migración idempotente en el seed para las existentes).
- `GET /public/vehicles/:slug` → `{ slug, brand, model, year, transmission, fuel, seats, color, description, images, category: { slug, name, pricePerDay, passengers, luggage, features }, available: boolean }` (solo unidades activas no bloqueadas).
- `GET /public/categories/:slug` → `units[]` agrega `slug`.
- Sitemap incluye `/vehiculos/<categoria>/<slug>`.
