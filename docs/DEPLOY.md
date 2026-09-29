# Despliegue, hosting y propiedad del proyecto

## Stack

| Capa | Tecnología |
|---|---|
| Sitio público + panel admin | Vue 3 + Vite + TypeScript (SPA), repo `ponce-rent-a-car-frontapp` |
| API | Node.js 20+ con Express 5 + TypeScript, repo `ponce-rent-a-car-backapp` |
| Base de datos | MongoDB Atlas (proyecto `ponce-rent-a-car`, cluster `ponce-rent-a-car-cluster`) |
| Imágenes públicas | Cloudinary (fotos de flota, hoteles, promociones) |
| Documentos de clientes | Guardados en la base de datos, privados; solo el admin los descarga |
| Pagos | PayPhone (Cajita de Pagos). La garantía se cobra físicamente con Datafast |
| WhatsApp | Meta WhatsApp Business Platform / Cloud API + WhatsApp Flows |
| Analítica | Google Analytics 4, Meta Pixel y Conversions API |
| Correo | Resend (transaccional); el correo corporativo sigue en el cPanel |

## ¿Puede vivir todo en el hosting cPanel actual?

Respuesta corta: **el sitio público sí; la API y la base de datos no conviene.**

- **Frontend (sitio + panel):** es un conjunto de archivos estáticos (`pnpm build` → carpeta `dist/`). Se puede
  subir a `public_html` del cPanel sin problema. Hay que agregar un `.htaccess` que mande todas las rutas a
  `index.html` (ver abajo).
- **API (Node.js):** el plan "Linux Unlimited" es un hosting compartido pensado para PHP. Algunos cPanel traen
  "Setup Node.js App" (Phusion Passenger); si el suyo lo tiene, la API puede correr ahí, pero en hosting compartido
  el proceso se duerme, se reinicia sin aviso y comparte CPU con otros sitios. Para recibir webhooks de WhatsApp y
  confirmar pagos de PayPhone (que se reversan si no se confirman en 5 minutos) se necesita un servidor que responda
  siempre y rápido.
- **Base de datos:** el hosting trae MySQL; la plataforma usa MongoDB porque los leads, reservas y contenido bilingüe
  cambian de forma con el tiempo (CRM externo, contratos, firma electrónica) sin migraciones. MongoDB no se puede
  instalar en un hosting compartido.

**Propuesta, sin contratar otro servidor pagado:**

| Pieza | Dónde | Costo |
|---|---|---|
| Sitio público + panel | Vercel (o `public_html` del cPanel si se prefiere) | $0 |
| API | Vercel (funciones serverless, HTTPS incluido) | $0 en el plan Hobby |
| Base de datos | MongoDB Atlas M0 | $0 (512 MB, suficiente para miles de reservas) |
| Dominio, correo corporativo, backups de archivos | El cPanel actual | ya pagado |

El dominio se queda en el cPanel/DNS actual: solo se apuntan dos registros (`@`/`www` al frontend y `api.` a la API).
Si más adelante el volumen crece, Atlas y Vercel escalan sin reescribir nada.

### `.htaccess` si el frontend va al cPanel

```apache
RewriteEngine On
RewriteBase /
RewriteRule ^index\.html$ - [L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.html [L]
```

## Proyecto anterior en el hosting

Antes de borrar nada: backup completo desde cPanel (Backup Wizard → Full Backup), exportar las bases MySQL desde
phpMyAdmin y descargar `public_html`. Pendiente revisar ese código y base para indicar qué se reutiliza.

## Propiedad y continuidad

El cliente debe quedar como dueño (o con acceso de administrador) de: los dos repositorios de código, la
organización/proyecto de MongoDB Atlas, el proyecto de Vercel, la cuenta de Cloudinary, la app de Meta (WhatsApp,
Pixel), la cuenta de PayPhone Developer, GA4, el dominio y el cPanel. Todas las credenciales viven en variables de
entorno (`.env` / Vercel), documentadas por nombre en `.env.example`. Cualquier desarrollador puede continuar con este
repo, `CLAUDE.md`, `docs/API.md` y `docs/WHATSAPP.md`.

## Pasos de despliegue

1. **API:** `vercel` en `ponce-rent-a-car-backapp`, cargar las variables de `.env` en Vercel, dominio `api.<dominio>`.
2. **Frontend:** `vercel` en `ponce-rent-a-car-frontapp` con `VITE_API_BASE_URL=https://api.<dominio>/api`,
   `VITE_GA4_ID` y `VITE_META_PIXEL_ID`.
3. Agregar el dominio del frontend a `CORS_ORIGINS` y `FRONTEND_URL` de la API.
4. PayPhone Developer: dominio web y URL de respuesta `https://<dominio>/pago/respuesta`.
5. Meta: webhook `https://api.<dominio>/api/whatsapp/webhook` (ver `docs/WHATSAPP.md`).
6. Cargar datos iniciales: `pnpm seed` (categorías, coberturas, extras, FAQs, guías, SEO). Idempotente.
