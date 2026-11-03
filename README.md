# BAPEG Industrial Perú – Sitio web + Panel administrativo

Sitio web corporativo (HTML, CSS y JavaScript) con un **backend en Node.js + Express + MySQL**
que guarda los requerimientos técnicos enviados desde `contacto.html` y un **panel administrativo**
para gestionarlos.

- Sitio estático (GitHub Pages): https://alexandra585.github.io/Proyecto_Bapeg/
- Panel administrativo: `/admin` (en el servidor Node)

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

## Estructura

```
├── index.html, nosotros.html, servicios.html, equipo.html, contacto.html
├── css/ js/ img/ video/ components/      ← sitio web (sin cambios de diseño)
├── admin/                                 ← panel administrativo
│   ├── login.html   index.html   admin.css   admin.js
├── server/                                ← backend Node.js
│   ├── app.js            servidor Express, sesiones, archivos estáticos
│   ├── db.js             conexión MySQL (pool) y creación de tablas
│   ├── admin-inicial.js  crea el primer administrador
│   ├── crear-admin.js    comando para crear/cambiar administradores
│   ├── middleware/auth.js
│   └── routes/  requerimientos.js (público) · auth.js · admin.js (privado)
├── database/schema.sql                    ← script de la base de datos
├── .env.example                           ← plantilla de configuración
└── package.json
```

## Base de datos (MySQL)

`database/schema.sql` crea la BD `bapeg_db` con dos tablas:

- **administradores**: `id, usuario, nombre, password_hash, ultimo_acceso, creado_en`
- **requerimientos**: `id, nombre, empresa, ruc, correo, telefono, servicio, plazo, detalle,
  archivo_nombre, archivo_tipo, archivo_tamano, archivo_datos (LONGBLOB), estado, notas, ip_origen, creado_en, actualizado_en`

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
