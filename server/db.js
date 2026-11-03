/*
  db.js – Conexión a MySQL
  1. Lee la configuración desde .env (datos sueltos o una URL completa).
  2. Crea un "pool" de conexiones reutilizables con mysql2/promise.
  3. inicializar(): crea la base de datos y las tablas si no existen,
     usando las mismas sentencias de database/schema.sql.
*/
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

/* 1. Configuración */
function leerConfig() {
  const url = process.env.DATABASE_URL || process.env.MYSQL_URL;
  const ssl = process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined;

  if (url) {
    const u = new URL(url);
    return {
      host: u.hostname,
      port: Number(u.port) || 3306,
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: u.pathname.replace('/', '') || 'bapeg_db',
      ssl
    };
  }
  return {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'bapeg_db',
    ssl
  };
}

const config = leerConfig();

/* 2. Pool de conexiones (se usa en todas las rutas) */
const pool = mysql.createPool({
  ...config,
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4',
  dateStrings: false,
  timezone: 'Z'
});

// Todas las fechas se guardan en UTC; el panel las muestra en hora de Lima
pool.pool.on('connection', conexion => conexion.query("SET time_zone = '+00:00'"));

/* 3. Crea la base de datos y las tablas la primera vez */
async function inicializar() {
  // a) Crear la BD si el usuario tiene permiso (en la nube suele existir ya)
  try {
    const { database, ...sinBD } = config;
    const conexion = await mysql.createConnection(sinBD);
    await conexion.query(
      `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await conexion.end();
  } catch (error) {
    console.warn('Aviso: no se pudo crear la base de datos automáticamente →', error.message);
  }

  // b) Ejecutar los CREATE TABLE de schema.sql
  const sql = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8');
  const sentencias = sql
    .replace(/--.*$/gm, '')
    .split(';')
    .map(s => s.trim())
    .filter(s => /^CREATE TABLE/i.test(s));

  for (const sentencia of sentencias) {
    await pool.query(sentencia);
  }
}

module.exports = { pool, config, inicializar };
