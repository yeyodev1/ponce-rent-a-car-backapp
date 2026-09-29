# WhatsApp de Ponce's Rent a Car — guía de configuración

Esta guía explica, paso a paso y sin tecnicismos, cómo conectar el WhatsApp del negocio con el sistema para que:

1. Cuando un cliente escribe desde la web con su código (por ejemplo `R1048`), el sistema reconozca la solicitud y le haga 2 preguntas rápidas (prioridad y nombre).
2. Cuando alguien escribe desde un anuncio de Facebook/Instagram, se cree la solicitud automáticamente y se le pida la información del viaje.
3. El asesor reciba un resumen ordenado de cada solicitud en su WhatsApp personal y por correo.
4. El cliente **siempre** pueda pedir hablar con una persona (botón "Hablar con un asesor").

> **Importante:** si no configuras nada de esto, la web sigue funcionando igual: el botón de WhatsApp abre el chat con el mensaje prellenado y las solicitudes se guardan en el CRM. Esta configuración solo agrega la automatización.

---

## Qué necesitas antes de empezar

- Una cuenta de **Meta Business** (business.facebook.com) a nombre del negocio, idealmente verificada.
- Acceso de administrador a esa cuenta.
- Un número de teléfono para WhatsApp Business Platform. Puede ser:
  - **Un número nuevo** (el más sencillo), o
  - **El número actual del negocio** usando la función *coexistencia* (ver sección 9).
- El número personal del asesor que recibirá los avisos.
- 30 a 60 minutos.

---

## 1. Crear la app en Meta

1. Entra a **developers.facebook.com** con la cuenta que administra el negocio.
2. Arriba a la derecha: **Mis apps → Crear app**.
3. Tipo de app: **Empresa (Business)**. Ponle un nombre, por ejemplo "Ponce's Rent a Car – Web".
4. Vincúlala a la cuenta de Meta Business del negocio.
5. En el panel de la app, busca **WhatsApp** y pulsa **Configurar**.

## 2. Agregar y verificar el número

1. En la app, ve a **WhatsApp → Configuración de la API (API Setup)**.
2. Pulsa **Agregar número de teléfono** y sigue los pasos (nombre visible del negocio, categoría "Automotriz", verificación por SMS o llamada).
3. Cuando termine, copia estos dos datos (los necesitará quien administra el servidor):
   - **Identificador del número de teléfono** (Phone number ID) → variable `WHATSAPP_PHONE_NUMBER_ID`.
   - **Identificador de la cuenta de WhatsApp Business** (WABA ID) → solo como referencia.

## 3. Crear el token permanente

El token de prueba que aparece en la pantalla vence en 24 horas. Para producción se usa un **usuario del sistema**:

1. En **business.facebook.com → Configuración del negocio → Usuarios → Usuarios del sistema**, crea uno con rol **Administrador**.
2. Pulsa **Asignar activos**, elige la app y la cuenta de WhatsApp, con control total.
3. Pulsa **Generar token**, elige la app y marca los permisos `whatsapp_business_messaging` y `whatsapp_business_management`. Elige que **no venza**.
4. Copia el token → variable `WHATSAPP_TOKEN`. Guárdalo como una contraseña: quien lo tenga puede enviar mensajes a nombre del negocio.

## 4. Conectar el webhook (para que el sistema "escuche" los mensajes)

1. Inventa una frase secreta larga (por ejemplo, 30 letras y números al azar). Esa es tu **token de verificación** → variable `WHATSAPP_VERIFY_TOKEN`. Pídele a quien administra el servidor que la cargue **antes** de seguir.
2. En la app de Meta: **WhatsApp → Configuración (Configuration) → Webhook → Editar**.
3. **URL de devolución de llamada (Callback URL):**
   ```
   https://<dominio-del-api>/api/whatsapp/webhook
   ```
   Reemplaza `<dominio-del-api>` por la dirección del servidor (por ejemplo `api.poncesrentacar.com` o la de Vercel).
4. **Token de verificación:** la frase del paso 1.
5. Pulsa **Verificar y guardar**. Si sale un error, revisa que la frase sea idéntica y que el servidor ya tenga la variable.
6. En la misma pantalla, en **Campos del webhook**, pulsa **Administrar** y activa (suscribir) **`messages`**.
7. Copia el **Secreto de la app**: en la app, **Configuración de la app → Básica → Clave secreta de la app** → variable `WHATSAPP_APP_SECRET`. Con esto el servidor comprueba que los mensajes vienen realmente de Meta.

## 5. Crear y publicar los Flows (formularios dentro de WhatsApp)

Los *Flows* son formularios cortos que el cliente llena sin salir de WhatsApp. Hay dos:

| Flow | Para quién | Archivo | Variable |
|---|---|---|---|
| Corto (prioridad + nombre) | Clientes que vienen de la web con código `R####` | `docs/whatsapp-flow-route-a.json` | `WHATSAPP_FLOW_ID` |
| Completo (fecha, hora, días, lugar, pasajeros, prioridad, nombre) | Clientes que escriben desde un anuncio o directo | `docs/whatsapp-flow-ads.json` | `WHATSAPP_FLOW_ID_FULL` |

Para cada uno:

1. Entra a **business.facebook.com → WhatsApp Manager → Cuenta → Flows** (o "Herramientas de la cuenta → Flows").
2. **Crear Flow**. Nombre: "Ponce – Ruta A" (o "Ponce – Anuncios"). Categoría: **Lead generation** (Generación de clientes potenciales). Plantilla: **Sin plantilla / Default**.
3. En el editor, borra el contenido de ejemplo y **pega todo el contenido del archivo JSON** correspondiente.
4. Revisa la vista previa a la derecha. No cambies los nombres internos (`PRIORITY`, `TRIP`, `priority`, `name`, etc.): el sistema los usa para leer las respuestas. Los textos visibles sí los puedes ajustar.
5. Pulsa **Guardar** y luego **Publicar**. Un Flow publicado ya no se puede editar: si quieres cambios, se duplica y se publica el nuevo.
6. Copia el **ID del Flow** (aparece en la lista de Flows) y pásalo a quien administra el servidor.

> Sin Flows el sistema también funciona: envía una lista con las 5 prioridades y luego pide el nombre por texto. Los Flows solo lo hacen más cómodo.

## 6. Número del asesor

- `ADVISOR_WHATSAPP`: número personal del asesor con código de país y sin signos, por ejemplo `593991234567`.
- `ADVISOR_EMAIL` (opcional): correo que también recibe cada resumen.

**Regla de Meta que debes conocer:** un negocio solo puede enviar mensajes libres a un número que le haya escrito en las últimas 24 horas. Para que el asesor reciba los resúmenes sin cortes, lo más simple es que **el asesor le escriba cualquier mensaje al número del negocio una vez al día** (por ejemplo "buenos días"). El sistema ignora los mensajes del número del asesor. El resumen por correo no tiene esta limitación.

## 7. Variables de entorno (para quien administra el servidor)

Se cargan en Vercel → Proyecto del API → Settings → Environment Variables, y luego se vuelve a desplegar.

| Variable | Qué es | Obligatoria |
|---|---|---|
| `WHATSAPP_TOKEN` | Token permanente del usuario del sistema (paso 3) | Sí, para activar la automatización |
| `WHATSAPP_PHONE_NUMBER_ID` | ID del número (paso 2) | Sí |
| `WHATSAPP_VERIFY_TOKEN` | Frase secreta del webhook (paso 4) | Sí |
| `WHATSAPP_APP_SECRET` | Clave secreta de la app (paso 4.7) | Sí en producción |
| `WHATSAPP_FLOW_ID` | ID del Flow corto (paso 5) | Recomendado |
| `WHATSAPP_FLOW_ID_FULL` | ID del Flow completo (paso 5) | Recomendado |
| `WHATSAPP_API_VERSION` | Versión de la API de Meta (por defecto `v21.0`) | No |
| `ADVISOR_WHATSAPP` | Número del asesor, solo dígitos | Recomendado |
| `ADVISOR_EMAIL` | Correo del asesor | Opcional |

## 8. Plantilla para escribirle a un cliente fuera de las 24 horas

Si un cliente no ha escrito en más de 24 horas, WhatsApp solo permite contactarlo con una **plantilla aprobada**. Crea al menos una para retomar conversaciones:

1. **WhatsApp Manager → Plantillas de mensajes → Crear plantilla**.
2. Categoría: **Utilidad** (Utility). Nombre: `seguimiento_solicitud`. Idioma: Español (y otra igual en Inglés).
3. Texto sugerido:
   > Hola {{1}}, te escribe Ponce's Rent a Car sobre tu solicitud {{2}}. ¿Seguimos ayudándote a elegir tu vehículo? Responde a este mensaje y te atendemos.
4. Agrega un botón de respuesta rápida: **"Hablar con un asesor"**.
5. Envíala a revisión (suele aprobarse en minutos u horas).

La plantilla se usa desde la app o el panel de WhatsApp Business del asesor; el sistema no la envía por su cuenta.

## 9. ¿Y la app de WhatsApp Business que ya usamos? (coexistencia)

Meta permite usar **el mismo número** en la app de WhatsApp Business del celular **y** en la API al mismo tiempo ("coexistencia"). Así el asesor sigue conversando desde su celular como siempre, y el sistema recibe los mensajes para crear las solicitudes.

- Se activa al agregar el número en el paso 2 eligiendo **"Conectar tu app de WhatsApp Business existente"** (debe estar actualizada y el número tener cierta antigüedad de uso). Se escanea un código QR desde la app.
- Si tu país o tu cuenta no tienen disponible esa opción, usa un **número nuevo** para la API y deja el actual solo para llamadas.
- Con coexistencia, el asesor debe **responder desde la app del celular** sin borrar los mensajes automáticos: son parte de la conversación.

## 10. Cómo probar que todo funciona

1. Desde la web, en "Ayúdame a elegir", completa el formulario y pulsa WhatsApp. Se abre el chat con el código `R####`: envíalo.
2. Deberías recibir el Flow (o la lista de prioridades) y un botón "Hablar con un asesor".
3. Complétalo. Llega un agradecimiento y el asesor recibe el resumen "NUEVA SOLICITUD #R####".
4. Desde otro teléfono, escribe "Hola" sin código: se crea una solicitud nueva y llega la bienvenida.
5. Escribe "asesor": llega "Un asesor te escribe en breve" y el asesor recibe el aviso.
6. En el panel de administración (Leads) debes ver todas estas solicitudes.

Si algo no llega, revisa en Meta **WhatsApp → Configuración → Webhook** que `messages` esté suscrito y que la URL esté verificada.

## Cómo se comporta el bot (resumen)

- Nunca responde en bucle: si el cliente escribe algo libre que no es parte del formulario, **no contesta** y lo deja para el asesor.
- Si el cliente escribe "asesor", "agente", "humano", "advisor", "agent" o "human", o toca el botón, queda marcado como **"Pide asesor"** en el CRM y el asesor recibe un aviso.
- Si el mensaje viene de un anuncio click-to-WhatsApp, la solicitud guarda la campaña (`utmSource = meta_ads`) para medir qué anuncio vende.
- El idioma (español o inglés) se toma del sitio web o, si escribe directo, del primer mensaje.
