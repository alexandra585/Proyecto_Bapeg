/*
  productos.js – API privada del módulo "Productos" (requiere sesión de administrador)
  GET    /api/admin/productos/resumen          → cifras del inventario
  GET    /api/admin/productos                  → listado con filtros (q, categoria, estado)
  GET    /api/admin/productos/exportar.csv     → inventario para Excel
  GET    /api/admin/productos/:id              → detalle + últimos movimientos (kardex)
  POST   /api/admin/productos                  → crear (multipart, con foto opcional)
  PUT    /api/admin/productos/:id              → editar (multipart, con foto opcional)
  POST   /api/admin/productos/:id/stock        → ingreso o ajuste de stock
  PATCH  /api/admin/productos/:id              → activar/desactivar o destacar
  DELETE /api/admin/productos/:id              → borra si nunca se vendió; si no, lo desactiva
  GET/POST/PUT/DELETE /api/admin/categorias    → categorías de la tienda
*/
const express = require('express');
const multer = require('multer');
const { pool } = require('../db');
const { requiereAdmin } = require('../middleware/auth');
const { moverStock, urlImagen, precioVigente, COLUMNAS_PRODUCTO } = require('../inventario');

const router = express.Router();
router.use(requiereAdmin);

const TIPOS_IMAGEN = ['image/jpeg', 'image/png', 'image/webp'];
const subida = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (req, archivo, cb) => cb(TIPOS_IMAGEN.includes(archivo.mimetype) ? null : new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'imagen'), true)
});
function conImagen(req, res, next) {
  subida.single('imagen')(req, res, err => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({
        ok: false,
        mensaje: err.code === 'LIMIT_FILE_SIZE' ? 'La imagen supera los 2 MB.' : 'La imagen debe ser JPG, PNG o WebP.'
      });
    }
    next(err);
  });
}

const texto = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const ICONOS = ['fa-helmet-safety', 'fa-screwdriver-wrench', 'fa-shirt', 'fa-gauge', 'fa-bolt', 'fa-fire-extinguisher',
  'fa-boxes-stacked', 'fa-gears', 'fa-toolbox', 'fa-hard-hat', 'fa-vest', 'fa-box'];

/* Convierte "Guantes de cuero 12\"" en "guantes-de-cuero-12" */
const slug = t => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'producto';

function vistaAdmin(p) {
  return {
    ...p,
    precio: Number(p.precio),
    precio_oferta: p.precio_oferta === null ? null : Number(p.precio_oferta),
    precio_vigente: precioVigente(p),
    stock: Number(p.stock),
    stock_minimo: Number(p.stock_minimo),
    destacado: Boolean(p.destacado),
    activo: Boolean(p.activo),
    tiene_imagen: Boolean(p.tiene_imagen),
    imagen: urlImagen(p),
    nivel: Number(p.stock) === 0 ? 'agotado' : Number(p.stock) <= Number(p.stock_minimo) ? 'bajo' : 'ok'
  };
}

/* Valida los campos del formulario (crear y editar) */
async function validar(body, idActual = null) {
  const d = {
    nombre: texto(body.nombre, 120),
    sku: texto(body.sku, 20).toUpperCase(),
    categoria: texto(body.categoria, 30),
    tipo: texto(body.tipo, 60),
    detalle: texto(body.detalle, 500),
    precio: Number(body.precio),
    precio_oferta: body.precio_oferta === '' || body.precio_oferta === undefined || body.precio_oferta === null ? null : Number(body.precio_oferta),
    stock_minimo: Number(body.stock_minimo ?? 5),
    destacado: ['true', '1', 'on', true].includes(body.destacado) ? 1 : 0,
    activo: body.activo === undefined ? 1 : (['true', '1', 'on', true].includes(body.activo) ? 1 : 0)
  };
  const errores = {};
  if (d.nombre.length < 3) errores.nombre = 'Ingresa el nombre (mín. 3 caracteres).';
  if (!/^[A-Z0-9-]{3,20}$/.test(d.sku)) errores.sku = 'SKU de 3 a 20 caracteres: letras, números y guiones.';
  if (!(d.precio > 0) || d.precio > 999999) errores.precio = 'Precio no válido.';
  if (d.precio_oferta !== null && !(d.precio_oferta > 0 && d.precio_oferta < d.precio)) {
    errores.precio_oferta = 'La oferta debe ser mayor a 0 y menor que el precio normal.';
  }
  if (!Number.isInteger(d.stock_minimo) || d.stock_minimo < 0 || d.stock_minimo > 100000) errores.stock_minimo = 'Stock mínimo no válido.';
  const [[cat]] = await pool.query('SELECT id FROM categorias WHERE id = ?', [d.categoria]);
  if (!cat) errores.categoria = 'Selecciona una categoría.';
  const [[repetido]] = await pool.query('SELECT id FROM productos WHERE sku = ? AND id <> ?', [d.sku, idActual || '']);
  if (repetido) errores.sku = 'Ya existe un producto con ese SKU.';
  return { d, errores };
}

/* ---------- Productos ---------- */
router.get('/productos/resumen', async (req, res, next) => {
  try {
    const [[r]] = await pool.query(
      `SELECT SUM(activo = 1) AS activos, SUM(activo = 0) AS inactivos,
              SUM(activo = 1 AND stock = 0) AS agotados,
              SUM(activo = 1 AND stock > 0 AND stock <= stock_minimo) AS bajos,
              COALESCE(SUM(CASE WHEN activo = 1 THEN stock * COALESCE(precio_oferta, precio) END), 0) AS valor,
              COALESCE(SUM(CASE WHEN activo = 1 THEN stock END), 0) AS unidades
       FROM productos`);
    res.json({
      ok: true,
      activos: Number(r.activos) || 0, inactivos: Number(r.inactivos) || 0, agotados: Number(r.agotados) || 0,
      bajos: Number(r.bajos) || 0, valor: Number(r.valor), unidades: Number(r.unidades)
    });
  } catch (error) { next(error); }
});

function filtros(q) {
  const cond = [];
  const val = [];
  if (q.q) { const t = `%${String(q.q).trim()}%`; cond.push('(nombre LIKE ? OR sku LIKE ? OR tipo LIKE ?)'); val.push(t, t, t); }
  if (q.categoria) { cond.push('categoria = ?'); val.push(String(q.categoria)); }
  if (q.estado === 'activos') cond.push('activo = 1');
  if (q.estado === 'inactivos') cond.push('activo = 0');
  if (q.estado === 'bajo') cond.push('activo = 1 AND stock > 0 AND stock <= stock_minimo');
  if (q.estado === 'agotado') cond.push('activo = 1 AND stock = 0');
  if (q.estado === 'oferta') cond.push('precio_oferta IS NOT NULL');
  if (q.estado === 'destacados') cond.push('destacado = 1');
  return { where: cond.length ? 'WHERE ' + cond.join(' AND ') : '', val };
}

router.get('/productos', async (req, res, next) => {
  try {
    const { where, val } = filtros(req.query);
    const [filas] = await pool.query(
      `SELECT ${COLUMNAS_PRODUCTO},
         (SELECT COALESCE(SUM(-cantidad), 0) FROM inventario_movimientos m
           WHERE m.producto_id = productos.id AND m.tipo = 'venta' AND m.creado_en >= NOW() - INTERVAL 30 DAY) AS vendidos_30d
       FROM productos ${where} ORDER BY activo DESC, categoria, nombre`, val);
    res.json({ ok: true, datos: filas.map(f => ({ ...vistaAdmin(f), vendidos_30d: Number(f.vendidos_30d) })) });
  } catch (error) { next(error); }
});

router.get('/productos/exportar.csv', async (req, res, next) => {
  try {
    const { where, val } = filtros(req.query);
    const [filas] = await pool.query(
      `SELECT p.sku, p.nombre, c.nombre AS categoria, p.tipo, p.precio, p.precio_oferta, p.stock, p.stock_minimo,
              p.destacado, p.activo
       FROM productos p LEFT JOIN categorias c ON c.id = p.categoria ${where.replace(/\b(nombre|sku|tipo|categoria|activo|stock|stock_minimo|precio_oferta|destacado)\b/g, 'p.$1')}
       ORDER BY c.orden, p.nombre`, val);
    const celda = v => {
      let t = v === null || v === undefined ? '' : String(v);
      if (/^[=+\-@]/.test(t)) t = `'${t}`;
      return `"${t.replace(/"/g, '""')}"`;
    };
    const cab = ['SKU', 'Producto', 'Categoría', 'Tipo', 'Precio', 'Precio oferta', 'Stock', 'Stock mínimo',
      'Valor en stock', 'Estado de stock', 'Destacado', 'Activo'];
    const lineas = filas.map(f => {
      const precio = f.precio_oferta ? Number(f.precio_oferta) : Number(f.precio);
      const estado = f.stock === 0 ? 'Agotado' : f.stock <= f.stock_minimo ? 'Stock bajo' : 'OK';
      return [f.sku, f.nombre, f.categoria, f.tipo, f.precio, f.precio_oferta, f.stock, f.stock_minimo,
        (precio * f.stock).toFixed(2), estado, f.destacado ? 'Sí' : 'No', f.activo ? 'Sí' : 'No'].map(celda).join(';');
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.attachment(`inventario-bapeg-${new Date().toISOString().slice(0, 10)}.csv`);
    res.send('﻿' + [cab.map(celda).join(';'), ...lineas].join('\r\n'));
  } catch (error) { next(error); }
});

router.get('/productos/:id', async (req, res, next) => {
  try {
    const [[p]] = await pool.query(`SELECT ${COLUMNAS_PRODUCTO} FROM productos WHERE id = ?`, [req.params.id]);
    if (!p) return res.status(404).json({ ok: false, mensaje: 'Producto no encontrado.' });
    const [movimientos] = await pool.query(
      `SELECT m.tipo, m.cantidad, m.stock_resultante, m.motivo, m.autor, m.creado_en, pe.codigo AS pedido
       FROM inventario_movimientos m LEFT JOIN pedidos pe ON pe.id = m.pedido_id
       WHERE m.producto_id = ? ORDER BY m.creado_en DESC, m.id DESC LIMIT 50`, [p.id]);
    res.json({ ok: true, dato: { ...vistaAdmin(p), movimientos } });
  } catch (error) { next(error); }
});

router.post('/productos', conImagen, async (req, res, next) => {
  const conexion = await pool.getConnection();
  try {
    const { d, errores } = await validar(req.body);
    const stockInicial = Number(req.body.stock ?? 0);
    if (!Number.isInteger(stockInicial) || stockInicial < 0 || stockInicial > 1000000) errores.stock = 'Stock inicial no válido.';
    if (Object.keys(errores).length) return res.status(400).json({ ok: false, mensaje: 'Revisa los campos marcados.', errores });

    // id legible y único a partir del nombre
    let id = slug(d.nombre);
    const [[existe]] = await pool.query('SELECT COUNT(*) AS n FROM productos WHERE id = ? OR id LIKE ?', [id, `${id}-%`]);
    if (existe.n) id = `${id}-${existe.n + 1}`;

    await conexion.beginTransaction();
    await conexion.query(
      `INSERT INTO productos (id, sku, nombre, categoria, tipo, detalle, precio, precio_oferta, stock, stock_minimo,
         destacado, activo, imagen_tipo, imagen_datos)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
      [id, d.sku, d.nombre, d.categoria, d.tipo || null, d.detalle || null, d.precio, d.precio_oferta,
        d.stock_minimo, d.destacado, d.activo, req.file?.mimetype || null, req.file?.buffer || null]);
    await moverStock(conexion, id, 'inicial', stockInicial, { motivo: 'Alta del producto', autor: req.session.admin.usuario });
    await conexion.commit();
    res.status(201).json({ ok: true, id, mensaje: `Producto "${d.nombre}" creado.` });
  } catch (error) {
    await conexion.rollback().catch(() => {});
    next(error);
  } finally { conexion.release(); }
});

router.put('/productos/:id', conImagen, async (req, res, next) => {
  try {
    const [[actual]] = await pool.query('SELECT id FROM productos WHERE id = ?', [req.params.id]);
    if (!actual) return res.status(404).json({ ok: false, mensaje: 'Producto no encontrado.' });
    const { d, errores } = await validar(req.body, actual.id);
    if (Object.keys(errores).length) return res.status(400).json({ ok: false, mensaje: 'Revisa los campos marcados.', errores });
    const cambios = ['sku = ?', 'nombre = ?', 'categoria = ?', 'tipo = ?', 'detalle = ?', 'precio = ?', 'precio_oferta = ?',
      'stock_minimo = ?', 'destacado = ?', 'activo = ?'];
    const valores = [d.sku, d.nombre, d.categoria, d.tipo || null, d.detalle || null, d.precio, d.precio_oferta,
      d.stock_minimo, d.destacado, d.activo];
    if (req.file) { cambios.push('imagen_tipo = ?', 'imagen_datos = ?'); valores.push(req.file.mimetype, req.file.buffer); }
    if (req.body.quitar_imagen === 'true' && !req.file) cambios.push('imagen_tipo = NULL', 'imagen_datos = NULL');
    await pool.query(`UPDATE productos SET ${cambios.join(', ')} WHERE id = ?`, [...valores, actual.id]);
    res.json({ ok: true, mensaje: `Producto "${d.nombre}" actualizado.` });
  } catch (error) { next(error); }
});

router.post('/productos/:id/stock', async (req, res, next) => {
  const conexion = await pool.getConnection();
  try {
    const tipo = req.body.tipo;               // ingreso | salida | conteo
    const cantidad = Number(req.body.cantidad);
    const motivo = texto(req.body.motivo, 200);
    if (!['ingreso', 'salida', 'conteo'].includes(tipo)) return res.status(400).json({ ok: false, mensaje: 'Tipo de movimiento no válido.' });
    if (!Number.isInteger(cantidad) || cantidad < (tipo === 'conteo' ? 0 : 1) || cantidad > 1000000) {
      return res.status(400).json({ ok: false, mensaje: 'Ingresa una cantidad entera válida.' });
    }
    if (tipo !== 'ingreso' && motivo.length < 3) return res.status(400).json({ ok: false, mensaje: 'Indica el motivo del ajuste.' });

    await conexion.beginTransaction();
    const [[p]] = await conexion.query('SELECT id, nombre, stock FROM productos WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!p) { await conexion.rollback(); return res.status(404).json({ ok: false, mensaje: 'Producto no encontrado.' }); }
    let delta = cantidad;
    let tipoKardex = 'ingreso';
    if (tipo === 'salida') {
      if (cantidad > p.stock) { await conexion.rollback(); return res.status(400).json({ ok: false, mensaje: `Solo hay ${p.stock} unidades en stock.` }); }
      delta = -cantidad; tipoKardex = 'ajuste';
    }
    if (tipo === 'conteo') { delta = cantidad - p.stock; tipoKardex = 'ajuste'; }
    if (delta === 0) { await conexion.rollback(); return res.json({ ok: true, mensaje: 'El stock ya coincide; no se registró movimiento.' }); }
    const nuevo = await moverStock(conexion, p.id, tipoKardex, delta, {
      motivo: motivo || 'Ingreso de mercadería', autor: req.session.admin.usuario
    });
    await conexion.commit();
    res.json({ ok: true, stock: nuevo, mensaje: `Stock de "${p.nombre}": ${nuevo} unidades.` });
  } catch (error) {
    await conexion.rollback().catch(() => {});
    next(error);
  } finally { conexion.release(); }
});

router.patch('/productos/:id', async (req, res, next) => {
  try {
    const cambios = [];
    const valores = [];
    if (typeof req.body.activo === 'boolean') { cambios.push('activo = ?'); valores.push(req.body.activo ? 1 : 0); }
    if (typeof req.body.destacado === 'boolean') { cambios.push('destacado = ?'); valores.push(req.body.destacado ? 1 : 0); }
    if (!cambios.length) return res.status(400).json({ ok: false, mensaje: 'No hay cambios.' });
    const [r] = await pool.query(`UPDATE productos SET ${cambios.join(', ')} WHERE id = ?`, [...valores, req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ ok: false, mensaje: 'Producto no encontrado.' });
    res.json({ ok: true, mensaje: 'Producto actualizado.' });
  } catch (error) { next(error); }
});

router.delete('/productos/:id', async (req, res, next) => {
  try {
    const [[p]] = await pool.query('SELECT id, nombre FROM productos WHERE id = ?', [req.params.id]);
    if (!p) return res.status(404).json({ ok: false, mensaje: 'Producto no encontrado.' });
    const [[uso]] = await pool.query('SELECT COUNT(*) AS n FROM pedido_items WHERE producto_id = ?', [p.id]);
    if (uso.n) {
      await pool.query('UPDATE productos SET activo = 0 WHERE id = ?', [p.id]);
      return res.json({ ok: true, desactivado: true, mensaje: `"${p.nombre}" tiene ventas registradas: se desactivó y ya no aparece en la tienda.` });
    }
    await pool.query('DELETE FROM inventario_movimientos WHERE producto_id = ?', [p.id]);
    await pool.query('DELETE FROM productos WHERE id = ?', [p.id]);
    res.json({ ok: true, mensaje: `"${p.nombre}" se eliminó.` });
  } catch (error) { next(error); }
});

/* ---------- Categorías ---------- */
router.get('/categorias', async (req, res, next) => {
  try {
    const [filas] = await pool.query(
      `SELECT c.id, c.nombre, c.icono, c.orden,
         (SELECT COUNT(*) FROM productos p WHERE p.categoria = c.id) AS productos
       FROM categorias c ORDER BY c.orden, c.nombre`);
    res.json({ ok: true, datos: filas.map(f => ({ ...f, productos: Number(f.productos) })), iconos: ICONOS });
  } catch (error) { next(error); }
});

router.post('/categorias', async (req, res, next) => {
  try {
    const nombre = texto(req.body.nombre, 60);
    const icono = ICONOS.includes(req.body.icono) ? req.body.icono : 'fa-box';
    if (nombre.length < 3) return res.status(400).json({ ok: false, mensaje: 'El nombre debe tener al menos 3 caracteres.' });
    const id = slug(nombre).slice(0, 30);
    const [[existe]] = await pool.query('SELECT id FROM categorias WHERE id = ? OR nombre = ?', [id, nombre]);
    if (existe) return res.status(400).json({ ok: false, mensaje: 'Ya existe esa categoría.' });
    const [[{ orden }]] = await pool.query('SELECT COALESCE(MAX(orden), 0) + 1 AS orden FROM categorias');
    await pool.query('INSERT INTO categorias (id, nombre, icono, orden) VALUES (?, ?, ?, ?)', [id, nombre, icono, orden]);
    res.status(201).json({ ok: true, id, mensaje: `Categoría "${nombre}" creada.` });
  } catch (error) { next(error); }
});

router.put('/categorias/:id', async (req, res, next) => {
  try {
    const nombre = texto(req.body.nombre, 60);
    const icono = ICONOS.includes(req.body.icono) ? req.body.icono : 'fa-box';
    if (nombre.length < 3) return res.status(400).json({ ok: false, mensaje: 'El nombre debe tener al menos 3 caracteres.' });
    const [r] = await pool.query('UPDATE categorias SET nombre = ?, icono = ? WHERE id = ?', [nombre, icono, req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ ok: false, mensaje: 'Categoría no encontrada.' });
    res.json({ ok: true, mensaje: 'Categoría actualizada.' });
  } catch (error) { next(error); }
});

router.delete('/categorias/:id', async (req, res, next) => {
  try {
    const [[uso]] = await pool.query('SELECT COUNT(*) AS n FROM productos WHERE categoria = ?', [req.params.id]);
    if (uso.n) return res.status(400).json({ ok: false, mensaje: `No se puede eliminar: tiene ${uso.n} producto(s). Muévelos a otra categoría primero.` });
    const [r] = await pool.query('DELETE FROM categorias WHERE id = ?', [req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ ok: false, mensaje: 'Categoría no encontrada.' });
    res.json({ ok: true, mensaje: 'Categoría eliminada.' });
  } catch (error) { next(error); }
});

module.exports = router;
