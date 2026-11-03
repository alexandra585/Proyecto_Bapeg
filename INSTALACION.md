# Guía de instalación – BAPEG Industrial (sitio web + panel administrativo)

Esta guía es para quien descarga el proyecto desde GitHub (botón **Code → Download ZIP**)
y quiere ejecutarlo en su computadora con Windows, paso a paso.

---

## Credenciales de acceso

| Qué | Usuario | Contraseña | Dónde |
|---|---|---|---|
| **Panel administrativo** | `admin` | `Bapeg2026!` | http://localhost:3000/admin |
| **MySQL (XAMPP)** | `root` | *(vacía)* | phpMyAdmin: http://localhost/phpmyadmin |
| **Base de datos** | — | — | `bapeg_db` (se crea sola) |

> El usuario del panel se crea automáticamente la primera vez que se inicia el servidor,
> usando `ADMIN_USER` y `ADMIN_PASSWORD` del archivo `.env`.

---

## ¿Cómo está armado el proyecto?

```
Navegador  ──►  Servidor Node.js (backend, puerto 3000)  ──►  MySQL de XAMPP (base de datos)
                 │
                 ├─ muestra el sitio web (frontend): index.html, contacto.html…
                 └─ muestra el panel: /admin
```

**Orden para levantarlo:** primero la **base de datos (XAMPP → MySQL)**, después el
**backend (Node.js)**. El frontend no se levanta aparte: el mismo servidor Node lo muestra
en http://localhost:3000.

---

## Paso 0 · Programas necesarios (solo la primera vez)

1. **Node.js** (versión LTS): https://nodejs.org → descargar e instalar con "Siguiente".
   Comprobar en una terminal: `node -v` (debe mostrar v18 o superior).
2. **XAMPP**: https://www.apachefriends.org → instalar (basta con marcar MySQL y phpMyAdmin).
3. **Visual Studio Code**: https://code.visualstudio.com

---

## Paso 1 · Descomprimir el proyecto

1. Descargar el ZIP desde GitHub y hacer clic derecho → **Extraer todo**.
2. Se crea una carpeta llamada **`Proyecto_Bapeg-main`**.
3. Abrir VS Code → **Archivo → Abrir carpeta** → elegir `Proyecto_Bapeg-main`.
4. Abrir la terminal en VS Code: menú **Terminal → Nuevo terminal**.

> El ZIP **no trae** la carpeta `node_modules` ni el archivo `.env` (no se suben a GitHub).
> Por eso hay que hacer los pasos 3 y 4.

---

## Paso 2 · Encender la base de datos (XAMPP)

1. Abrir el **XAMPP Control Panel**.
2. En la fila **MySQL** pulsar **Start**. Debe ponerse en **verde**.
3. Fijarse en el número de la columna **Port(s)**: normalmente es **3306**.

> Si MySQL no arranca (se queda en rojo), lo más común es que haya otro MySQL instalado
> usando el mismo puerto. Ver la sección *Problemas frecuentes*.

---

## Paso 3 · Instalar las dependencias del backend

En la terminal de VS Code (dentro de la carpeta del proyecto):

```powershell
npm install
```

Esto crea la carpeta `node_modules` con Express, MySQL, Nodemailer, etc. Tarda unos segundos.

---

## Paso 4 · Crear el archivo de configuración `.env`

1. En la terminal:
   ```powershell
   copy .env.example .env
   ```
2. Abrir el archivo **`.env`** (no el `.env.example`) y revisar estas líneas:
   ```
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=
   DB_NAME=bapeg_db
   ```
   - `DB_PORT` debe ser el mismo puerto que muestra XAMPP (paso 2).
   - `DB_PASSWORD` se deja **vacío** (XAMPP no trae contraseña).
3. Guardar con **Ctrl + S**.

**Correo de confirmación (opcional):** si se quiere que al cliente le llegue un correo,
completar también:
```
MAIL_USER=correo@gmail.com
MAIL_PASS=contraseña-de-aplicación-de-16-letras
```
(Se obtiene en https://myaccount.google.com/apppasswords con la verificación en 2 pasos activa.)
Si se deja vacío, todo funciona igual pero sin enviar correos.

---

## Paso 5 · Levantar el backend

```powershell
npm start
```

Si todo está bien aparece:

```
Administrador inicial creado: admin
BAPEG listo en http://localhost:3000
Panel administrativo: http://localhost:3000/admin
```

La base de datos `bapeg_db` y sus tablas se crean solas.
**No cierres esta terminal**: si se cierra, el servidor se apaga. (Para detenerlo: **Ctrl + C**.)

---

## Paso 6 · Usar el sitio y el panel

1. **Sitio web:** http://localhost:3000
2. **Probar el formulario:** http://localhost:3000/contacto.html → llenar y enviar.
   Debe salir "Requerimiento enviado. Código: RFQ-0001…".
3. **Panel administrativo:** http://localhost:3000/admin → usuario `admin`, contraseña `Bapeg2026!`.
   Ahí aparece el requerimiento enviado: se puede ver el detalle, cambiar el estado,
   escribir notas, descargar el adjunto, eliminar y exportar a CSV.
4. **Ver la base de datos (opcional):** http://localhost/phpmyadmin → base `bapeg_db`
   (para esto también hay que encender **Apache** en XAMPP).

---

## Cada vez que se quiera volver a usar

1. XAMPP → **Start** en MySQL.
2. VS Code → terminal → `npm start`.
3. Abrir http://localhost:3000

---

## Problemas frecuentes

| Mensaje en la terminal | Causa | Solución |
|---|---|---|
| `'npm' no se reconoce como un comando` | Node.js no está instalado | Instalar Node.js y reabrir VS Code. |
| `Cannot find module '...'` | Faltan dependencias | Ejecutar `npm install`. |
| `ECONNREFUSED 127.0.0.1:3306` | MySQL apagado o en otro puerto | Encender MySQL en XAMPP y revisar `DB_PORT` en `.env`. |
| `Access denied for user 'root' (using password: NO)` | No existe `.env` o está mal nombrado | Crear `.env` (paso 4). No editar `.env.example`. |
| `Access denied for user 'root' (using password: YES)` | Contraseña incorrecta | En XAMPP dejar `DB_PASSWORD=` vacío. |
| MySQL de XAMPP no arranca (rojo) | Otro MySQL (por ejemplo MySQL Server 8.0) usa el puerto 3306 | Win + R → `services.msc` → **MySQL80** → Detener. O cambiar el puerto de XAMPP a 3307 (XAMPP → Config → my.ini → `port=3307`) y poner `DB_PORT=3307` en `.env`. |
| `EADDRINUSE :::3000` | El servidor ya está abierto en otra terminal | Cerrar la otra terminal o pulsar Ctrl + C en ella. |
| El formulario dice "No se pudo conectar con el servidor" | El backend está apagado | Ejecutar `npm start`. Abrir el sitio desde http://localhost:3000, no con doble clic al HTML. |

---

## Crear otro administrador o cambiar la contraseña

```powershell
npm run crear-admin -- usuario "ClaveNueva123" "Nombre Apellido"
```

## Trabajo en equipo (con Git)

Si en lugar del ZIP se usa Git:

```powershell
git clone https://github.com/alexandra585/Proyecto_Bapeg.git
cd Proyecto_Bapeg
npm install
copy .env.example .env
```

Antes de trabajar: `git pull` · Al terminar: `git add .` → `git commit -m "mensaje"` → `git pull` → `git push`.
Nunca subir el archivo `.env`.
