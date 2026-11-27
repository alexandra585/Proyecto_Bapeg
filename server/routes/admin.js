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
const COLUMNAS = `id, nombre, empresa, ruc, correo, telefono, servicio, plazo, estado, prioridad, seguimiento_en,
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
    const [servicios] = await pool.query(
      'SELECT servicio, COUNT(*) AS total FROM requerimientos GROUP BY servicio ORDER BY total DESC, servicio ASC'
    );
    const porEstado = Object.fromEntries(ESTADOS.map(e => [e, 0]));
    let total = 0;
    filas.forEach(f => { porEstado[f.estado] = Number(f.total); total += Number(f.total); });
    res.json({
      ok: true,
      total,
      semana: Number(semana),
      porEstado,
      porServicio: servicios.map(f => ({ servicio: f.servicio, total: Number(f.total) }))
    });
  } catch (error) {
    next(error);
  }
});

/* ==========================================================
   DASHBOARD: cifras y series para los gráficos (?dias=7|30|90)
   ========================================================== */
const P = require('../pedidos');
const { enviarCorreoPedido } = require('../correo');
const { motivo } = require('../mercadopago');
const PAGADOS_SQL = P.ESTADOS_PAGADOS.map(e => `'${e}'`).join(',');
const diaLima = d => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Lima' }).format(d);

router.get('/dashboard', async (req, res, next) => {
  try {
    const dias = [7, 30, 90].includes(Number(req.query.dias)) ? Number(req.query.dias) : 30;
    const desde = `NOW() - INTERVAL ${dias} DAY`;
    const anterior = `creado_en >= NOW() - INTERVAL ${dias * 2} DAY AND creado_en < ${desde}`;

    // Ventas (pedidos pagados) del periodo y del periodo anterior, para la variación
    const [[ventas]] = await pool.query(
      `SELECT COUNT(*) AS pedidos, COALESCE(SUM(total),0) AS monto FROM pedidos
       WHERE estado IN (${PAGADOS_SQL}) AND creado_en >= ${desde}`);
    const [[ventasAnt]] = await pool.query(
      `SELECT COALESCE(SUM(total),0) AS monto FROM pedidos WHERE estado IN (${PAGADOS_SQL}) AND ${anterior}`);
    const [[pagos]] = await pool.query(
      `SELECT SUM(estado='aprobado') AS aprobados, SUM(estado='rechazado') AS rechazados,
              SUM(estado='pendiente') AS pendientes FROM pedido_pagos WHERE creado_en >= ${desde}`);
    const [[porAtender]] = await pool.query(
      "SELECT COUNT(*) AS total FROM pedidos WHERE estado IN ('pagado','en_preparacion')");
    const [[req7]] = await pool.query(
      `SELECT COUNT(*) AS total, SUM(estado='nuevo') AS nuevos FROM requerimientos WHERE creado_en >= ${desde}`);
    const [[bajoStock]] = await pool.query('SELECT COUNT(*) AS total FROM productos WHERE activo = 1 AND stock <= stock_minimo');

    // Serie diaria de ventas y pedidos
    const [serie] = await pool.query(
      `SELECT DATE_FORMAT(CONVERT_TZ(creado_en,'+00:00','-05:00'),'%Y-%m-%d') AS dia, COUNT(*) AS pedidos, SUM(total) AS monto
       FROM pedidos WHERE estado IN (${PAGADOS_SQL}) AND creado_en >= ${desde} GROUP BY dia ORDER BY dia`);
    const [serieReq] = await pool.query(
      `SELECT DATE_FORMAT(CONVERT_TZ(creado_en,'+00:00','-05:00'),'%Y-%m-%d') AS dia, COUNT(*) AS total
       FROM requerimientos WHERE creado_en >= ${desde} GROUP BY dia`);
    const mapa = new Map(serie.map(f => [f.dia, f]));
    const mapaReq = new Map(serieReq.map(f => [f.dia, Number(f.total)]));
    const ventasPorDia = [];
    for (let i = dias - 1; i >= 0; i--) {
      const dia = diaLima(new Date(Date.now() - i * 864e5));
      const f = mapa.get(dia);
      ventasPorDia.push({ dia, monto: f ? Number(f.monto) : 0, pedidos: f ? Number(f.pedidos) : 0, requerimientos: mapaReq.get(dia) || 0 });
    }

    const [porEstado] = await pool.query(
      `SELECT estado, COUNT(*) AS total FROM pedidos WHERE creado_en >= ${desde} GROUP BY estado`);
    const [topProductos] = await pool.query(
      `SELECT i.nombre, SUM(i.cantidad) AS unidades, SUM(i.subtotal) AS monto
       FROM pedido_items i JOIN pedidos p ON p.id = i.pedido_id
       WHERE p.estado IN (${PAGADOS_SQL}) AND p.creado_en >= ${desde}
       GROUP BY i.producto_id, i.nombre ORDER BY unidades DESC, monto DESC LIMIT 6`);
    const [porCategoria] = await pool.query(
      `SELECT COALESCE(c.nombre, i.categoria) AS categoria, SUM(i.subtotal) AS monto
       FROM pedido_items i JOIN pedidos p ON p.id = i.pedido_id LEFT JOIN categorias c ON c.id = i.categoria
       WHERE p.estado IN (${PAGADOS_SQL}) AND p.creado_en >= ${desde} GROUP BY 1`);
    const [entregas] = await pool.query(
      `SELECT tipo_entrega, COUNT(*) AS total FROM pedidos
       WHERE estado IN (${PAGADOS_SQL}) AND creado_en >= ${desde} GROUP BY tipo_entrega`);
    const [reqEstado] = await pool.query(
      `SELECT estado, COUNT(*) AS total FROM requerimientos WHERE creado_en >= ${desde} GROUP BY estado`);
    const [reqServicio] = await pool.query(
      `SELECT servicio, COUNT(*) AS total FROM requerimientos WHERE creado_en >= ${desde}
       GROUP BY servicio ORDER BY total DESC`);

    const aprobados = Number(pagos.aprobados) || 0;
    const intentos = aprobados + (Number(pagos.rechazados) || 0);
    const monto = Number(ventas.monto);
    const montoAnt = Number(ventasAnt.monto);

    res.json({
      ok: true,
      dias,
      kpis: {
        ventas: monto,
        variacion: montoAnt ? (monto - montoAnt) / montoAnt * 100 : null,
        pedidos: Number(ventas.pedidos),
        ticket: Number(ventas.pedidos) ? monto / Number(ventas.pedidos) : 0,
        aprobacion: intentos ? aprobados / intentos * 100 : null,
        porAtender: Number(porAtender.total),
        requerimientos: Number(req7.total),
        requerimientosNuevos: Number(req7.nuevos) || 0,
        bajoStock: Number(bajoStock.total)
      },
      ventasPorDia,
      pedidosPorEstado: porEstado.map(f => ({ estado: f.estado, etiqueta: P.ESTADOS[f.estado], total: Number(f.total) })),
      pagos: { aprobados, rechazados: Number(pagos.rechazados) || 0, pendientes: Number(pagos.pendientes) || 0 },
      topProductos: topProductos.map(f => ({ nombre: f.nombre, unidades: Number(f.unidades), monto: Number(f.monto) })),
      ventasPorCategoria: porCategoria.map(f => ({ categoria: f.categoria, monto: Number(f.monto) })),
      entregas: entregas.map(f => ({ tipo: f.tipo_entrega === 'recojo' ? 'Recojo en almacén' : 'Envío a domicilio', total: Number(f.total) })),
      requerimientosPorEstado: ESTADOS.map(e => ({
        estado: e, etiqueta: ETIQUETA_ESTADO[e], total: Number(reqEstado.find(f => f.estado === e)?.total) || 0
      })),
      requerimientosPorServicio: reqServicio.map(f => ({ servicio: f.servicio, total: Number(f.total) }))
    });
  } catch (error) { next(error); }
});

/* ==========================================================
   PEDIDOS DE LA TIENDA
   ========================================================== */
function filtrosPedidos(query) {
  const condiciones = [];
  const valores = [];
  if (query.q) {
    const t = `%${String(query.q).trim()}%`;
    condiciones.push('(codigo LIKE ? OR nombre LIKE ? OR correo LIKE ? OR documento LIKE ? OR numero_guia LIKE ?)');
    valores.push(t, t, t, t, t);
  }
  if (query.estado === 'por_atender') condiciones.push("estado IN ('pagado','en_preparacion')");
  else if (query.estado === 'en_camino') condiciones.push("estado IN ('despachado','en_reparto','listo_recojo')");
  else if (P.ESTADOS[query.estado]) { condiciones.push('estado = ?'); valores.push(query.estado); }
  if (['envio', 'recojo'].includes(query.entrega)) { condiciones.push('tipo_entrega = ?'); valores.push(query.entrega); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(query.desde || '')) { condiciones.push('creado_en >= ?'); valores.push(`${query.desde} 05:00:00`); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(query.hasta || '')) {
    condiciones.push('creado_en < DATE_ADD(?, INTERVAL 1 DAY)'); valores.push(`${query.hasta} 05:00:00`);
  }
  return { where: condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '', valores };
}

router.get('/pedidos/resumen', async (req, res, next) => {
  try {
    const [filas] = await pool.query('SELECT estado, COUNT(*) AS total FROM pedidos GROUP BY estado');
    const conteo = Object.fromEntries(Object.keys(P.ESTADOS).map(e => [e, 0]));
    filas.forEach(f => { conteo[f.estado] = Number(f.total); });
    res.json({
      ok: true,
      total: filas.reduce((s, f) => s + Number(f.total), 0),
      porAtender: conteo.pagado + conteo.en_preparacion,
      enCamino: conteo.despachado + conteo.en_reparto + conteo.listo_recojo,
      entregados: conteo.entregado,
      pendientesPago: conteo.pendiente_pago + conteo.pago_rechazado,
      cancelados: conteo.cancelado
    });
  } catch (error) { next(error); }
});

router.get('/pedidos', async (req, res, next) => {
  try {
    const { where, valores } = filtrosPedidos(req.query);
    const porPagina = Math.min(Math.max(parseInt(req.query.por_pagina, 10) || 10, 5), 100);
    const pagina = Math.max(parseInt(req.query.pagina, 10) || 1, 1);
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM pedidos ${where}`, valores);
    const [filas] = await pool.query(
      `SELECT p.id, p.codigo, p.nombre, p.correo, p.tipo_entrega, p.departamento, p.distrito, p.total, p.estado,
              p.creado_en, p.courier, p.numero_guia,
              (SELECT SUM(cantidad) FROM pedido_items i WHERE i.pedido_id = p.id) AS unidades
       FROM pedidos p ${where}
       ORDER BY p.creado_en DESC, p.id DESC LIMIT ? OFFSET ?`,
      [...valores, porPagina, (pagina - 1) * porPagina]
    );
    res.json({
      ok: true,
      datos: filas.map(f => ({ ...f, total: Number(f.total), unidades: Number(f.unidades) || 0, etiqueta: P.ESTADOS[f.estado] })),
      paginacion: { pagina, porPagina, total: Number(total), paginas: Math.max(Math.ceil(total / porPagina), 1) }
    });
  } catch (error) { next(error); }
});

router.get('/pedidos/exportar.csv', async (req, res, next) => {
  try {
    const { where, valores } = filtrosPedidos(req.query);
    const [filas] = await pool.query(
      `SELECT codigo, creado_en, nombre, correo, telefono, comprobante, documento, tipo_entrega, departamento, distrito,
              subtotal, costo_envio, total, estado, metodo_pago, courier, numero_guia
       FROM pedidos ${where} ORDER BY creado_en DESC`, valores);
    const celda = v => {
      if (v === null || v === undefined) return '';
      let t = v instanceof Date ? v.toLocaleString('sv-SE', { timeZone: 'America/Lima' }) : String(v);
      if (/^[=+\-@]/.test(t)) t = `'${t}`;
      return `"${t.replace(/"/g, '""')}"`;
    };
    const cab = ['Código', 'Fecha (Lima)', 'Cliente', 'Correo', 'Teléfono', 'Comprobante', 'Documento', 'Entrega',
      'Departamento', 'Distrito', 'Subtotal', 'Envío', 'Total', 'Estado', 'Método de pago', 'Courier', 'Guía'];
    const lineas = filas.map(f => [f.codigo, f.creado_en, f.nombre, f.correo, f.telefono, f.comprobante, f.documento,
      f.tipo_entrega === 'recojo' ? 'Recojo' : 'Envío', f.departamento, f.distrito, f.subtotal, f.costo_envio, f.total,
      P.ESTADOS[f.estado], f.metodo_pago, f.courier, f.numero_guia].map(celda).join(';'));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.attachment(`pedidos-bapeg-${new Date().toISOString().slice(0, 10)}.csv`);
    res.send('﻿' + [cab.map(celda).join(';'), ...lineas].join('\r\n'));
  } catch (error) { next(error); }
});

router.get('/pedidos/:id', async (req, res, next) => {
  try {
    if (!idValido(req.params.id)) return res.status(400).json({ ok: false, mensaje: 'ID no válido.' });
    const p = await P.obtenerPedido('id', req.params.id);
    if (!p) return res.status(404).json({ ok: false, mensaje: 'Pedido no encontrado.' });
    res.json({
      ok: true,
      dato: {
        ...p,
        etiqueta: P.ESTADOS[p.estado],
        siguientes: (P.TRANSICIONES[p.tipo_entrega][p.estado] || []).map(e => ({ estado: e, etiqueta: P.ESTADOS[e] })),
        ruta: P.RUTA[p.tipo_entrega].map(e => ({ estado: e, etiqueta: P.ESTADOS[e] })),
        couriers: P.COURIERS,
        pagos: p.pagos.map(g => ({ ...g, mensaje: motivo(g.detalle) })),
        historial: p.historial.map(h => ({ ...h, etiqueta: P.ESTADOS[h.estado] || h.estado }))
      }
    });
  } catch (error) { next(error); }
});

router.post('/pedidos/:id/estado', async (req, res, next) => {
  try {
    if (!idValido(req.params.id)) return res.status(400).json({ ok: false, mensaje: 'ID no válido.' });
    const datos = {
      estado: String(req.body.estado || ''),
      comentario: String(req.body.comentario || '').slice(0, 300),
      courier: String(req.body.courier || '').trim(),
      guia: String(req.body.guia || '').trim(),
      visible: req.body.visible !== false
    };
    const actualizado = await P.cambiarEstado(Number(req.params.id), datos, req.session.admin.usuario);
    if (req.body.notificar !== false) {
      const completo = await P.obtenerPedido('id', req.params.id);
      const texto = datos.comentario && datos.estado !== 'despachado'
        ? `${P.DESCRIPCION[datos.estado]} ${datos.comentario}` : P.DESCRIPCION[datos.estado];
      enviarCorreoPedido(completo, datos.estado, texto);
    }
    res.json({ ok: true, mensaje: `Pedido actualizado a "${P.ESTADOS[actualizado.estado]}".` });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ ok: false, mensaje: error.message });
    next(error);
  }
});

router.patch('/pedidos/:id', async (req, res, next) => {
  try {
    if (!idValido(req.params.id)) return res.status(400).json({ ok: false, mensaje: 'ID no válido.' });
    const [r] = await pool.query('UPDATE pedidos SET notas_internas = ? WHERE id = ?',
      [String(req.body.notas_internas || '').slice(0, 5000) || null, req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ ok: false, mensaje: 'Pedido no encontrado.' });
    res.json({ ok: true, mensaje: 'Notas guardadas.' });
  } catch (error) { next(error); }
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
      `SELECT id, creado_en, nombre, empresa, ruc, correo, telefono, servicio, plazo, estado, prioridad, seguimiento_en, detalle, notas, archivo_nombre
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
      'Servicio', 'Plazo', 'Estado', 'Prioridad', 'Seguimiento', 'Detalle', 'Notas internas', 'Adjunto'];
    const lineas = filas.map(f => [
      f.id, f.creado_en, f.nombre, f.empresa, f.ruc, f.correo, f.telefono,
      f.servicio, f.plazo, ETIQUETA_ESTADO[f.estado], f.prioridad,
      f.seguimiento_en instanceof Date ? f.seguimiento_en.toISOString().slice(0, 10) : f.seguimiento_en,
      f.detalle, f.notas, f.archivo_nombre
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
    if (req.body.prioridad !== undefined) {
      if (!['normal', 'alta', 'urgente'].includes(req.body.prioridad)) {
        return res.status(400).json({ ok: false, mensaje: 'Prioridad no válida.' });
      }
      cambios.push('prioridad = ?');
      valores.push(req.body.prioridad);
    }
    if (req.body.seguimiento_en !== undefined) {
      const fecha = req.body.seguimiento_en === '' || req.body.seguimiento_en === null
        ? null : String(req.body.seguimiento_en);
      if (fecha !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) ||
        new Date(`${fecha}T00:00:00Z`).toISOString().slice(0, 10) !== fecha)) {
        return res.status(400).json({ ok: false, mensaje: 'La fecha de seguimiento no es válida.' });
      }
      cambios.push('seguimiento_en = ?');
      valores.push(fecha);
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
