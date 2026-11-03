/*
  app.js – Servidor principal (Node.js + Express)
  1. Configuración general, seguridad básica y sesiones guardadas en MySQL.
  2. API: formulario público, autenticación y panel administrativo.
  3. Archivos estáticos: el sitio web y el panel (/admin).
  4. Manejo de errores e inicio del servidor.

  Iniciar:  npm install  →  copiar .env.example como .env  →  npm start
*/
require('dotenv').config({ quiet: true });
const path = require('path');
const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const cors = require('cors');

const { config, inicializar } = require('./db');
const { asegurarAdministrador } = require('./admin-inicial');

const app = express();
const RAIZ = path.join(__dirname, '..');
const PRODUCCION = process.env.NODE_ENV === 'production';
const PUERTO = Number(process.env.PORT) || 3000;

/* 1. Configuración general */
app.disable('x-powered-by');
app.set('trust proxy', 1); // Render/Railway usan un proxy HTTPS delante del servidor

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));

/* Sesiones: se guardan en la tabla "sesiones" de MySQL */
const almacenSesiones = new MySQLStore({
  host: config.host,
  port: config.port,
  user: config.user,
  password: config.password,
  database: config.database,
  ssl: config.ssl,
  createDatabaseTable: true,
  schema: { tableName: 'sesiones' }
});

app.use(session({
  name: 'bapeg.sid',
  secret: process.env.SESSION_SECRET || 'solo-para-desarrollo-cambiar',
  store: almacenSesiones,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: PRODUCCION,
    maxAge: 8 * 60 * 60 * 1000 // 8 horas
  }
}));

/* 2. API */
// El formulario puede enviarse desde GitHub Pages u otro dominio permitido
const origenesPermitidos = (process.env.CORS_ORIGINS || '')
  .split(',').map(o => o.trim()).filter(Boolean);
const corsFormulario = cors({
  origin(origen, cb) {
    const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origen || '');
    cb(null, !origen || local || origenesPermitidos.includes(origen));
  },
  methods: ['POST']
});

app.get('/api/salud', (req, res) => res.json({ ok: true, servicio: 'BAPEG API' }));
app.options('/api/requerimientos', corsFormulario);
app.use('/api/requerimientos', corsFormulario, require('./routes/requerimientos'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api', (req, res) => res.status(404).json({ ok: false, mensaje: 'Ruta no encontrada.' }));

/* 3. Archivos estáticos */
// El panel exige sesión antes de mostrarse
app.get('/admin', (req, res, next) => (req.originalUrl.startsWith('/admin/') ? next() : res.redirect('/admin/')));
app.get(['/admin/', '/admin/index.html'], (req, res) => {
  if (!req.session.admin) return res.redirect('/admin/login.html');
  res.sendFile(path.join(RAIZ, 'admin', 'index.html'));
});
app.get('/admin/login.html', (req, res, next) => {
  if (req.session.admin) return res.redirect('/admin/');
  next();
});

// Solo se publican las páginas y carpetas del sitio (nunca server/, .env, etc.)
const RUTA_PUBLICA = /^\/(?:[\w-]+\.html)?$|^\/(?:css|js|img|video|components|admin)\//;
app.use((req, res, next) => (RUTA_PUBLICA.test(req.path) ? next() : res.status(404).sendFile(path.join(RAIZ, 'index.html'))));
app.use(express.static(RAIZ, { index: 'index.html', dotfiles: 'ignore', maxAge: PRODUCCION ? '1h' : 0 }));

/* 4. Errores */
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ ok: false, mensaje: 'Error interno del servidor.' });
});

(async () => {
  try {
    await inicializar();
    await asegurarAdministrador();
    app.listen(PUERTO, () => {
      console.log(`BAPEG listo en http://localhost:${PUERTO}`);
      console.log(`Panel administrativo: http://localhost:${PUERTO}/admin`);
    });
  } catch (error) {
    console.error('No se pudo conectar a MySQL. Revise los datos de su archivo .env →', error.message);
    process.exit(1);
  }
})();
