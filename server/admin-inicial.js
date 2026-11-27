/*
  admin-inicial.js – Crea el primer administrador
  Si la tabla "administradores" está vacía, registra el usuario definido
  en ADMIN_USER / ADMIN_PASSWORD del archivo .env (contraseña cifrada con bcrypt).
*/
const bcrypt = require('bcryptjs');
const { pool } = require('./db');

async function crearAdministrador(usuario, password, nombre) {
  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    `INSERT INTO administradores (usuario, nombre, password_hash) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), password_hash = VALUES(password_hash)`,
    [usuario, nombre, hash]
  );
}

async function asegurarAdministrador() {
  const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM administradores');
  if (total > 0) return;

  const usuario = process.env.ADMIN_USER || 'admin';
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    console.warn('Aviso: no hay administradores. Define ADMIN_PASSWORD en .env o ejecuta "npm run crear-admin".');
    return;
  }
  await crearAdministrador(usuario, password, process.env.ADMIN_NOMBRE || 'Administrador BAPEG');
  console.log(`Administrador inicial creado: ${usuario}`);
}

module.exports = { asegurarAdministrador, crearAdministrador };
