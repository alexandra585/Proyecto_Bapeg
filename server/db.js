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

  // Migraciones idempotentes para instalaciones que ya tenían la tabla creada.
  const [columnas] = await pool.query(
    'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
    [config.database, 'requerimientos']
  );
  const presentes = new Set(columnas.map(c => c.COLUMN_NAME));
  if (!presentes.has('prioridad')) {
    await pool.query("ALTER TABLE requerimientos ADD COLUMN prioridad ENUM('normal','alta','urgente') NOT NULL DEFAULT 'normal'");
    await pool.query("UPDATE requerimientos SET prioridad = 'urgente' WHERE plazo = 'Inmediato'");
  }
  if (!presentes.has('seguimiento_en')) {
    await pool.query('ALTER TABLE requerimientos ADD COLUMN seguimiento_en DATE NULL');
    await pool.query('CREATE INDEX idx_seguimiento ON requerimientos (seguimiento_en)');
  }

  // c) Migraciones del catálogo para bases creadas con versiones anteriores
  const [colsProd] = await pool.query(
    'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
    [config.database, 'productos']
  );
  const enProductos = new Set(colsProd.map(c => c.COLUMN_NAME));
  const nuevasColumnas = {
    tipo: 'VARCHAR(60) NULL', detalle: 'VARCHAR(500) NULL', precio_oferta: 'DECIMAL(10,2) NULL',
    stock_minimo: 'INT UNSIGNED NOT NULL DEFAULT 5', destacado: 'TINYINT(1) NOT NULL DEFAULT 0',
    imagen_ruta: 'VARCHAR(200) NULL', imagen_tipo: 'VARCHAR(40) NULL', imagen_datos: 'MEDIUMBLOB NULL',
    creado_en: 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP'
  };
  for (const [columna, definicion] of Object.entries(nuevasColumnas)) {
    if (!enProductos.has(columna)) await pool.query(`ALTER TABLE productos ADD COLUMN ${columna} ${definicion}`);
  }

  // d) Datos iniciales: categorías y productos de ejemplo (solo si no existen; luego se editan en el panel)
  const { PRODUCTOS, CATEGORIAS_INICIALES } = require('./catalogo');
  for (const [i, c] of CATEGORIAS_INICIALES.entries()) {
    await pool.query('INSERT IGNORE INTO categorias (id, nombre, icono, orden) VALUES (?, ?, ?, ?)', [c.id, c.nombre, c.icono, i + 1]);
  }
  const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM inventario_movimientos');
  for (const p of PRODUCTOS) {
    const [r] = await pool.query(
      `INSERT IGNORE INTO productos (id, sku, nombre, categoria, tipo, detalle, precio, stock, imagen_ruta)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [p.id, p.sku, p.nombre, p.categoria, p.tipo, p.detalle, p.precio, p.stock, p.imagen]
    );
    // Instalaciones anteriores: completar los campos nuevos sin pisar lo editado
    await pool.query(
      `UPDATE productos SET tipo = COALESCE(tipo, ?), detalle = COALESCE(detalle, ?), imagen_ruta = COALESCE(imagen_ruta, ?)
       WHERE id = ?`, [p.tipo, p.detalle, p.imagen, p.id]);
    if (r.affectedRows || !total) {
      await pool.query(
        `INSERT INTO inventario_movimientos (producto_id, tipo, cantidad, stock_resultante, motivo)
         SELECT id, 'inicial', stock, stock, 'Stock inicial del catálogo' FROM productos WHERE id = ?`, [p.id]);
    }
  }
}

/* Mensaje legible aunque el error venga vacío (p. ej. AggregateError al usar "localhost") */
function describirError(error) {
  const internos = error.errors ? error.errors.map(e => e.message).join(' | ') : '';
  return error.message || internos || error.code || String(error);
}

module.exports = { pool, config, inicializar, describirError };
