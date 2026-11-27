/*
  auth.js – Inicio y cierre de sesión del administrador
  POST /api/auth/login   → verifica usuario y contraseña (bcrypt)
  POST /api/auth/logout  → destruye la sesión
  GET  /api/auth/sesion  → indica si hay una sesión activa
*/
const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { pool } = require('../db');

const router = express.Router();

/* 5 intentos fallidos cada 15 min por IP (protege contra fuerza bruta) */
const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true,
  message: { ok: false, mensaje: 'Demasiados intentos. Espere 15 minutos.' }
});

router.post('/login', limiteLogin, async (req, res, next) => {
  try {
    const usuario = String(req.body.usuario || '').trim();
    const password = String(req.body.password || '');
    if (!usuario || !password) {
      return res.status(400).json({ ok: false, mensaje: 'Ingrese usuario y contraseña.' });
    }

    const [[admin]] = await pool.query(
      'SELECT id, usuario, nombre, password_hash FROM administradores WHERE usuario = ?',
      [usuario]
    );
    const valido = admin && await bcrypt.compare(password, admin.password_hash);
    if (!valido) {
      return res.status(401).json({ ok: false, mensaje: 'Usuario o contraseña incorrectos.' });
    }

    await pool.query('UPDATE administradores SET ultimo_acceso = NOW() WHERE id = ?', [admin.id]);

    // Regenerar la sesión evita la fijación de sesión
    req.session.regenerate(err => {
      if (err) return next(err);
      req.session.admin = { id: admin.id, usuario: admin.usuario, nombre: admin.nombre };
      req.session.save(err2 => {
        if (err2) return next(err2);
        res.json({ ok: true, admin: req.session.admin });
      });
    });
  } catch (error) {
    next(error);
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('bapeg.sid');
    res.json({ ok: true });
  });
});

router.get('/sesion', (req, res) => {
  if (req.session.admin) return res.json({ ok: true, admin: req.session.admin });
  res.status(401).json({ ok: false });
});

module.exports = router;
