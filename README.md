# BAPEG Industrial Perú – Sitio web + Panel administrativo

Sitio web corporativo (HTML, CSS y JavaScript) con un **backend en Node.js + Express + MySQL**
que guarda los requerimientos técnicos enviados desde `contacto.html` y un **panel administrativo**
para gestionarlos.

- Sitio estático (GitHub Pages): https://alexandra585.github.io/Proyecto_Bapeg/
- Panel administrativo: `/admin` (en el servidor Node)

> **¿Recién descargaste el proyecto?** Sigue la guía paso a paso: [INSTALACION.md](INSTALACION.md)

## Funcionalidades del panel

| Función | Descripción |
|---|---|
| Login de administrador | Usuario y contraseña cifrada con **bcrypt**; sesiones guardadas en MySQL; bloqueo tras 5 intentos fallidos. |
| Listado | Tabla paginada con búsqueda (nombre, empresa, correo, RUC, detalle) y filtros por estado, servicio y fechas. |
| Estadísticas | Totales por estado y de los últimos 7 días (al hacer clic filtran la tabla). |
| Detalle | Datos completos del cliente, enlace a correo y WhatsApp, detalle técnico. |
| Gestión | Cambio de estado (Nuevo → En revisión → Cotizado → Cerrado) y notas internas. |
| Eliminar | Con ventana de confirmación. |
| Adjuntos | El archivo del formulario (PDF, DWG, DXF, XLSX, ZIP… máx. 25 MB) se guarda en MySQL y se descarga desde el panel. |
| Correo de confirmación | Al enviar el formulario, el cliente recibe un correo (Gmail + Nodemailer) con su código RFQ y el resumen. |
| Exportar | Descarga CSV (se abre en Excel) respetando los filtros activos. |

## Tienda en línea

| Parte | Qué hace |
|---|---|
| `tienda.html` | Catálogo con stock real, filtros, búsqueda, orden y carrito lateral (envío gratis desde S/ 300). |
| `checkout.html` | Compra en 3 pasos: datos y comprobante (boleta/factura) → pago → confirmación. |
| Pago | **Mercado Pago Checkout API vía Orders API + Card Payment Brick** en modo prueba (la tarjeta la procesa Mercado Pago; el servidor nunca la ve). Sin credenciales funciona en **modo demostración**. |
| `seguimiento.html` | El cliente consulta su pedido con código + correo: etapas, historial, courier y guía. |
| Correos | Confirmación de pago y aviso en cada cambio de estado (preparación, envío con guía, entrega…). |

**Ciclo de vida de un pedido**

```
pendiente_pago ──pago aprobado──► pagado ──► en_preparacion ──► despachado ──► en_reparto ──► entregado
      │  ▲                                        │   (courier + guía)
      ▼  │ reintento                              └──► listo_recojo ──► entregado   (recojo en almacén)
pago_rechazado                       cancelado (desde pendiente, pagado o en preparación: devuelve stock)
```

El servidor valida cada paso: no se puede, por ejemplo, entregar un pedido que no fue despachado.

### Configurar Mercado Pago (modo prueba)

1. Crea una cuenta en https://www.mercadopago.com.pe/developers y entra a **Tus integraciones → Crear aplicación** (elige *Pagos online* y *Checkout API*).
2. En la aplicación: **Pruebas → Credenciales de prueba**. Copia la *Public Key* y el *Access Token* en `.env`:
   ```
   MP_PUBLIC_KEY=TEST-xxxxxxxx...
   MP_ACCESS_TOKEN=TEST-xxxxxxxx...
   ```
3. Reinicia con `npm start`. En el checkout aparecerá el formulario de tarjeta de Mercado Pago.
4. Usa las tarjetas de prueba (se muestran en el checkout). El **nombre del titular** decide el resultado:
   `APRO` aprobado, `FUND` fondos insuficientes, `SECU` CVV inválido, `OTHE` rechazo general, `CONT` pendiente.
   Visa `4009 1753 3280 6176` · Mastercard `5031 7557 3453 0604` · CVV `123` · vence `11/30` · DNI `12345678`.
   El correo del comprador puede ser cualquiera válido. Los pagos de prueba se ven en tu aplicación → *Pagos de prueba*.

### Datos de ejemplo para la presentación

```bash
npm run datos-demo              # crea ~100 pedidos y ~30 requerimientos de los últimos 60 días
npm run datos-demo -- --borrar  # los elimina (solo borra los de ejemplo, correos @demo.bapeg.pe)
```

## Panel administrativo (módulos)

| Módulo | Contenido |
|---|---|
| **Dashboard** | Solo cifras y gráficos (Chart.js): ventas, pedidos, ticket promedio, aprobación de pagos, ventas por día, pedidos por estado, productos más vendidos, ventas por categoría, resultado de pagos, embudo y servicios de requerimientos. Periodo de 7, 30 o 90 días. |
| **Requerimientos** | Gestión de las solicitudes del formulario de contacto (estado, prioridad, seguimiento, notas, adjuntos, CSV). |
| **Productos** | Catálogo de la tienda: crear/editar productos con foto (se guarda en MySQL), precio de oferta, destacado, visible/oculto, categorías editables, stock mínimo con alertas, movimientos de stock (ingreso, salida, conteo) con historial **kardex**, exportar inventario a CSV. Un producto con ventas no se borra: se desactiva. |
| **Pedidos tienda** | Bandejas (por atender, en camino, entregados, sin pago, cancelados), detalle del pedido, avance de estado con courier y guía, historial, pagos, notas internas y CSV. |

## Estructura

```
├── index.html, nosotros.html, servicios.html, equipo.html, contacto.html
├── css/ js/ img/ video/ components/      ← sitio web (sin cambios de diseño)
├── tienda.html  checkout.html  seguimiento.html   ← tienda en línea
├── js/carrito.js  js/tienda.js  js/checkout.js  js/seguimiento.js
├── css/tienda.css
├── admin/                                 ← panel administrativo
│   ├── login.html  index.html (Dashboard)  requerimientos.html  pedidos.html
│   ├── admin.css   admin.js (común)  js/dashboard.js  js/requerimientos.js  js/pedidos.js
├── server/                                ← backend Node.js
│   ├── app.js            servidor Express, sesiones, archivos estáticos
│   ├── db.js             conexión MySQL (pool) y creación de tablas
│   ├── admin-inicial.js  crea el primer administrador
│   ├── crear-admin.js    comando para crear/cambiar administradores
│   ├── catalogo.js       productos, precios y tarifas de envío (fuente única)
│   ├── pedidos.js        estados del pedido y transiciones permitidas
│   ├── mercadopago.js    cliente de la API de pagos
│   ├── datos-demo.js     datos de ejemplo para el dashboard
│   ├── middleware/auth.js
│   └── routes/  requerimientos.js · tienda.js (públicos) · auth.js · admin.js (privado)
├── database/schema.sql                    ← script de la base de datos
├── .env.example                           ← plantilla de configuración
└── package.json
```

## Base de datos (MySQL)

`database/schema.sql` crea la BD `bapeg_db` con estas tablas:

- **administradores**: usuarios del panel (contraseña cifrada con bcrypt).
- **requerimientos**: solicitudes del formulario de contacto (con adjunto, estado, prioridad y seguimiento).
- **categorias** y **productos**: catálogo de la tienda (se administra en el panel; `server/catalogo.js` solo carga los datos iniciales la primera vez). Incluye precio de oferta, destacado, stock mínimo y la foto subida.
- **inventario_movimientos**: kardex de cada producto (stock inicial, ingresos, ajustes, ventas y devoluciones).
- **pedidos**: datos del cliente, comprobante, entrega, totales, estado, courier y guía.
- **pedido_items**: productos de cada pedido con el precio del momento de la compra.
- **pedido_pagos**: cada intento de pago (aprobado / rechazado / pendiente). Nunca guarda datos de tarjeta.
- **pedido_historial**: cada cambio de estado con fecha, autor y comentario (alimenta el seguimiento).

La tabla `sesiones` la crea automáticamente `express-mysql-session`.
No es obligatorio ejecutar el script: el servidor crea todo al iniciar.

## Ejecutar en local

Requisitos: **Node.js 18+** y **MySQL 8** (o XAMPP / MariaDB).

```bash
npm install
cp .env.example .env        # en Windows: copy .env.example .env
# edita .env con tu usuario y contraseña de MySQL
npm start
```

- Sitio: http://localhost:3000
- Panel: http://localhost:3000/admin  → usuario `admin`, contraseña la de `ADMIN_PASSWORD` en `.env`

Crear otro administrador o cambiar la contraseña:

```bash
npm run crear-admin -- usuario "ClaveSegura123" "Nombre Apellido"
```

> Si abres el sitio con **Live Server** (puerto 5500), el formulario igual envía a `http://localhost:3000`
> mientras el servidor Node esté encendido.

## Correo de confirmación (Gmail)

1. En tu cuenta de Google activa la **Verificación en 2 pasos**.
2. Entra a https://myaccount.google.com/apppasswords, crea una contraseña con nombre "BAPEG" y copia las 16 letras.
3. En `.env` completa:
   ```
   MAIL_USER=tucorreo@gmail.com
   MAIL_PASS=abcdefghijklmnop
   ```
4. Reinicia con `npm start`. Debe aparecer `Correo listo: las confirmaciones se envían desde ...`.

Si `MAIL_USER`/`MAIL_PASS` están vacíos, el formulario funciona igual pero no envía correos.

## API

| Método | Ruta | Acceso |
|---|---|---|
| POST | `/api/requerimientos` | Público (formulario, multipart con `archivo`) |
| POST | `/api/auth/login` · `/api/auth/logout` | Público |
| GET | `/api/auth/sesion` | Público |
| GET | `/api/tienda/config` · `/api/tienda/productos` | Público |
| POST | `/api/tienda/pedidos` · `/api/tienda/pedidos/:codigo/pago` | Público |
| GET | `/api/tienda/seguimiento?codigo=&correo=` | Público |
| POST | `/api/tienda/webhooks/mercadopago` | Mercado Pago |
| GET | `/api/admin/dashboard?dias=30` | Admin |
| GET | `/api/admin/pedidos` · `/api/admin/pedidos/:id` · `/api/admin/pedidos/exportar.csv` | Admin |
| POST | `/api/admin/pedidos/:id/estado` (`estado`, `comentario`, `courier`, `guia`, `notificar`) | Admin |
| GET | `/api/admin/estadisticas` | Admin |
| GET | `/api/admin/requerimientos?q=&estado=&servicio=&desde=&hasta=&pagina=` | Admin |
| GET | `/api/admin/requerimientos/exportar.csv` | Admin |
| GET | `/api/admin/requerimientos/:id` · `/:id/archivo` | Admin |
| PATCH | `/api/admin/requerimientos/:id` (`estado`, `notas`) | Admin |
| DELETE | `/api/admin/requerimientos/:id` | Admin |

## Publicar en la nube (gratis): Aiven (MySQL) + Render (Node.js)

GitHub Pages solo sirve archivos estáticos, por eso el backend se publica aparte.

**1. Base de datos en Aiven**
1. Crea una cuenta en https://aiven.io y un servicio **MySQL** con el plan *Free*.
2. Cuando esté en estado *Running*, copia el **Service URI** (`mysql://avnadmin:...@...:PUERTO/defaultdb?ssl-mode=REQUIRED`).

**2. Servidor en Render**
1. Crea una cuenta en https://render.com con tu GitHub → **New → Web Service** → elige `Proyecto_Bapeg`.
2. Configuración: *Runtime* Node · *Build command* `npm install` · *Start command* `npm start` · *Instance* Free.
3. En **Environment** agrega:

| Variable | Valor |
|---|---|
| `DATABASE_URL` | el Service URI de Aiven |
| `DB_SSL` | `true` |
| `SESSION_SECRET` | un texto largo y aleatorio |
| `ADMIN_USER` / `ADMIN_PASSWORD` | tus credenciales del panel |
| `NODE_ENV` | `production` |
| `CORS_ORIGINS` | `https://alexandra585.github.io` |
| `MP_PUBLIC_KEY` / `MP_ACCESS_TOKEN` | credenciales de prueba de Mercado Pago (opcional) |
| `MP_WEBHOOK_URL` | `https://tu-app.onrender.com/api/tienda/webhooks/mercadopago` |
| `SITIO_URL` | `https://tu-app.onrender.com` (enlaces de los correos) |

4. Al terminar el deploy tendrás una URL tipo `https://bapeg-industrial.onrender.com`.
5. Si tu URL es distinta, cámbiala en `js/main.js` (constante `API_NUBE`) y sube el cambio:
   así el formulario de GitHub Pages enviará a tu backend.

> En el plan gratuito de Render el servidor "se duerme" tras un rato sin uso; la primera petición
> puede tardar unos segundos en responder.

## Seguridad aplicada

Contraseñas con bcrypt · sesión con cookie `httpOnly` y `sameSite` · regeneración de sesión al iniciar ·
límite de intentos de login y de envíos del formulario · consultas parametrizadas (sin inyección SQL) ·
validación en el servidor · campo *honeypot* anti-bots · escape de HTML en el panel (sin XSS) ·
el servidor solo publica las carpetas del sitio (nunca `server/` ni `.env`).
