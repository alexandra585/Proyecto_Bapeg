/*
  crear-admin.js – Crea o actualiza un administrador desde la terminal.
  Uso:  npm run crear-admin -- <usuario> <contraseña> "<Nombre completo>"
  Ej.:  npm run crear-admin -- jperez MiClave123 "Juan Pérez"
*/
require('dotenv').config({ quiet: true });
const { pool, inicializar } = require('./db');
const { crearAdministrador } = require('./admin-inicial');

(async () => {
  const [usuario, password, nombre = usuario] = process.argv.slice(2);
  if (!usuario || !password || password.length < 8) {
    console.error('Uso: npm run crear-admin -- <usuario> <contraseña (mín. 8)> "<Nombre>"');
    process.exit(1);
  }
  try {
    await inicializar();
    await crearAdministrador(usuario, password, nombre);
    console.log(`Administrador "${usuario}" guardado correctamente.`);
  } catch (error) {
    console.error('Error:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
