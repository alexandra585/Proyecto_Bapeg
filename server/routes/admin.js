/*
  admin.js – API privada del panel administrativo (requiere sesión)
  GET    /api/admin/estadisticas                 → totales por estado
  GET    /api/admin/requerimientos               → listado con filtros y paginación
  GET    /api/admin/requerimientos/exportar.csv  → descarga CSV (respeta filtros)
  GET    /api/admin/requerimientos/:id           → detalle
  GET    /api/admin/requerimientos/:id/archivo   → descarga del adjunto
  PATCH  /api/admin/requerimientos/:id           → cambia estado y/o notas
  DELETE /api/admin/requerimientos/:id           → elimina el registro
*/
const express = require('express');
const { pool } = require('../db');
const { requiereAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requiereAdmin);

const ESTADOS = ['nuevo', 'en_revision', 'cotizado', 'cerrado'];
const ETIQUETA_ESTADO = { nuevo: 'Nuevo', en_revision: 'En revisión', cotizado: 'Cotizado', cerrado: 'Cerrado' };

/* Columnas del listado (nunca se trae el archivo binario aquí) */
const COLUMNAS = `id, nombre, empresa, ruc, correo, telefono, servicio, plazo, estado,
  archivo_nombre, archivo_tamano, creado_en, actualizado_en`;

/* Construye el WHERE según los filtros de la URL */
function filtros(query) {
  const condiciones = [];
  const valores = [];

  if (query.q) {
    const termino = `%${String(query.q).trim()}%`;
    condiciones.push('(nombre LIKE ? OR empresa LIKE ? OR correo LIKE ? OR ruc LIKE ? OR detalle LIKE ?)');
    valores.push(termino, termino, termino, termino, termino);
  }
  if (ESTADOS.includes(query.estado)) {
    condiciones.push('estado = ?');
    valores.push(query.estado);
  }
  if (query.servicio) {
    condiciones.push('servicio = ?');
    valores.push(String(query.servicio));
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(query.desde || '')) {
    condiciones.push('creado_en >= ?');
    valores.push(`${query.desde} 00:00:00`);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(query.hasta || '')) {
    condiciones.push('creado_en <= ?');
    valores.push(`${query.hasta} 23:59:59`);
  }
  return {
    where: condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '',
    valores
  };
}

const idValido = id => /^\d+$/.test(id);

/* Estadísticas para las tarjetas superiores */
router.get('/estadisticas', async (req, res, next) => {
  try {
    const [filas] = await pool.query('SELECT estado, COUNT(*) AS total FROM requerimientos GROUP BY estado');
    const [[{ semana }]] = await pool.query(
      'SELECT COUNT(*) AS semana FROM requerimientos WHERE creado_en >= NOW() - INTERVAL 7 DAY'
    );
    const porEstado = Object.fromEntries(ESTADOS.map(e => [e, 0]));
    let total = 0;
    filas.forEach(f => { porEstado[f.estado] = Number(f.total); total += Number(f.total); });
    res.json({ ok: true, total, semana: Number(semana), porEstado });
  } catch (error) {
    next(error);
  }
});

/* Listado */
router.get('/requerimientos', async (req, res, next) => {
  try {
    const { where, valores } = filtros(req.query);
    const porPagina = Math.min(Math.max(parseInt(req.query.por_pagina, 10) || 10, 5), 100);
    const pagina = Math.max(parseInt(req.query.pagina, 10) || 1, 1);

    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM requerimientos ${where}`, valores);
    const [filas] = await pool.query(
      `SELECT ${COLUMNAS} FROM requerimientos ${where} ORDER BY creado_en DESC, id DESC LIMIT ? OFFSET ?`,
      [...valores, porPagina, (pagina - 1) * porPagina]
    );

    res.json({
      ok: true,
      datos: filas,
      paginacion: { pagina, porPagina, total: Number(total), paginas: Math.max(Math.ceil(total / porPagina), 1) }
    });
  } catch (error) {
    next(error);
  }
});

/* Exportar a CSV (se abre directo en Excel) */
router.get('/requerimientos/exportar.csv', async (req, res, next) => {
  try {
    const { where, valores } = filtros(req.query);
    const [filas] = await pool.query(
      `SELECT id, creado_en, nombre, empresa, ruc, correo, telefono, servicio, plazo, estado, detalle, notas, archivo_nombre
       FROM requerimientos ${where} ORDER BY creado_en DESC`,
      valores
    );

    const celda = valor => {
      if (valor === null || valor === undefined) return '';
      let t = valor instanceof Date
        ? valor.toLocaleString('sv-SE', { timeZone: 'America/Lima' })
        : String(valor);
      if (/^[=+\-@]/.test(t)) t = `'${t}`; // evita inyección de fórmulas en Excel
      return `"${t.replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
    };
    const encabezado = ['ID', 'Fecha (hora Lima)', 'Nombre', 'Empresa', 'RUC', 'Correo', 'Teléfono',
      'Servicio', 'Plazo', 'Estado', 'Detalle', 'Notas internas', 'Adjunto'];
    const lineas = filas.map(f => [
      f.id, f.creado_en, f.nombre, f.empresa, f.ruc, f.correo, f.telefono,
      f.servicio, f.plazo, ETIQUETA_ESTADO[f.estado], f.detalle, f.notas, f.archivo_nombre
    ].map(celda).join(';'));

    const fecha = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.attachment(`requerimientos-bapeg-${fecha}.csv`);
    res.send('﻿' + [encabezado.map(celda).join(';'), ...lineas].join('\r\n'));
  } catch (error) {
    next(error);
  }
});

/* Detalle */
router.get('/requerimientos/:id', async (req, res, next) => {
  try {
    if (!idValido(req.params.id)) return res.status(400).json({ ok: false, mensaje: 'ID no válido.' });
    const [[fila]] = await pool.query(
      `SELECT ${COLUMNAS}, detalle, notas, archivo_tipo, ip_origen FROM requerimientos WHERE id = ?`,
      [req.params.id]
    );
    if (!fila) return res.status(404).json({ ok: false, mensaje: 'Requerimiento no encontrado.' });
    res.json({ ok: true, dato: fila });
  } catch (error) {
    next(error);
  }
});

/* Descargar el adjunto */
router.get('/requerimientos/:id/archivo', async (req, res, next) => {
  try {
    if (!idValido(req.params.id)) return res.status(400).end();
    const [[fila]] = await pool.query(
      'SELECT archivo_nombre, archivo_tipo, archivo_datos FROM requerimientos WHERE id = ?',
      [req.params.id]
    );
    if (!fila || !fila.archivo_datos) return res.status(404).json({ ok: false, mensaje: 'Sin archivo adjunto.' });
    res.setHeader('Content-Type', fila.archivo_tipo || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.attachment(fila.archivo_nombre);
    res.send(fila.archivo_datos);
  } catch (error) {
    next(error);
  }
});

/* Actualizar estado / notas */
router.patch('/requerimientos/:id', async (req, res, next) => {
  try {
    if (!idValido(req.params.id)) return res.status(400).json({ ok: false, mensaje: 'ID no válido.' });
    const cambios = [];
    const valores = [];

    if (req.body.estado !== undefined) {
      if (!ESTADOS.includes(req.body.estado)) {
        return res.status(400).json({ ok: false, mensaje: 'Estado no válido.' });
      }
      cambios.push('estado = ?');
      valores.push(req.body.estado);
    }
    if (req.body.notas !== undefined) {
      cambios.push('notas = ?');
      valores.push(String(req.body.notas).slice(0, 5000) || null);
    }
    if (!cambios.length) return res.status(400).json({ ok: false, mensaje: 'No hay cambios.' });

    const [r] = await pool.query(`UPDATE requerimientos SET ${cambios.join(', ')} WHERE id = ?`, [...valores, req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ ok: false, mensaje: 'Requerimiento no encontrado.' });
    res.json({ ok: true, mensaje: 'Cambios guardados.' });
  } catch (error) {
    next(error);
  }
});

/* Eliminar */
router.delete('/requerimientos/:id', async (req, res, next) => {
  try {
    if (!idValido(req.params.id)) return res.status(400).json({ ok: false, mensaje: 'ID no válido.' });
    const [r] = await pool.query('DELETE FROM requerimientos WHERE id = ?', [req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ ok: false, mensaje: 'Requerimiento no encontrado.' });
    res.json({ ok: true, mensaje: 'Requerimiento eliminado.' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
