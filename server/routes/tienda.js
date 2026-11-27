/*
  tienda.js – API pública de la tienda
  GET  /api/tienda/config                 → pasarela activa (Mercado Pago o demo) y tarifas de envío
  GET  /api/tienda/productos              → catálogo con stock
  POST /api/tienda/pedidos                → crea el pedido (pendiente de pago); el servidor calcula los totales
  POST /api/tienda/pedidos/:codigo/pago   → paga con Mercado Pago (token del Brick) o simula en modo demo
  GET  /api/tienda/seguimiento            → estado del pedido (?codigo=BP-000001&correo=...)
  POST /api/tienda/webhooks/mercadopago   → notificaciones de Mercado Pago (cuando el sitio está publicado)
*/
const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { pool } = require('../db');
const { ENVIO, DEPARTAMENTOS, costoEnvio } = require('../catalogo');
const { productoPublico, precioVigente, COLUMNAS_PRODUCTO } = require('../inventario');
const mp = require('../mercadopago');
const P = require('../pedidos');
const { enviarCorreoPedido } = require('../correo');

const router = express.Router();

const limitePedidos = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 15, standardHeaders: true, legacyHeaders: false,
  message: { ok: false, mensaje: 'Demasiados pedidos en poco tiempo. Intenta nuevamente en unos minutos.' }
});
const limitePagos = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false,
  message: { ok: false, mensaje: 'Demasiados intentos de pago. Espera unos minutos.' }
});
const limiteSeguimiento = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 40, standardHeaders: true, legacyHeaders: false,
  message: { ok: false, mensaje: 'Demasiadas consultas. Intenta más tarde.' }
});

const texto = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const correoValido = c => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c);
const redondear = n => Math.round(n * 100) / 100;

/* Configuración para el navegador (incluye las categorías que tienen productos activos) */
router.get('/config', async (req, res, next) => {
  try {
    const [categorias] = await pool.query(
      `SELECT c.id, c.nombre, c.icono FROM categorias c
       WHERE EXISTS (SELECT 1 FROM productos p WHERE p.categoria = c.id AND p.activo = 1)
       ORDER BY c.orden, c.nombre`);
    res.json({
      ok: true,
      pasarela: mp.activo() ? 'mercadopago' : 'demo',
      publicKey: mp.activo() ? mp.publicKey() : null,
      envio: ENVIO,
      departamentos: DEPARTAMENTOS,
      categorias
    });
  } catch (error) { next(error); }
});

/* Catálogo activo: destacados primero */
router.get('/productos', async (req, res, next) => {
  try {
    const [filas] = await pool.query(
      `SELECT ${COLUMNAS_PRODUCTO} FROM productos WHERE activo = 1
       ORDER BY destacado DESC, (SELECT orden FROM categorias c WHERE c.id = categoria), sku`);
    res.json({ ok: true, productos: filas.map(productoPublico) });
  } catch (error) { next(error); }
});

/* Foto subida desde el panel (se guarda en MySQL) */
router.get('/productos/:id/imagen', async (req, res, next) => {
  try {
    const [[p]] = await pool.query('SELECT imagen_tipo, imagen_datos FROM productos WHERE id = ?', [String(req.params.id)]);
    if (!p || !p.imagen_datos) return res.status(404).end();
    res.setHeader('Content-Type', p.imagen_tipo || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(p.imagen_datos);
  } catch (error) { next(error); }
});

/* Crear pedido */
router.post('/pedidos', limitePedidos, async (req, res, next) => {
  const conexion = await pool.getConnection();
  try {
    const c = req.body.cliente || {};
    const e = req.body.entrega || {};
    const lineas = Array.isArray(req.body.items) ? req.body.items : [];
    const errores = {};

    const cliente = {
      nombre: texto(c.nombre, 120),
      correo: texto(c.correo, 150).toLowerCase(),
      telefono: texto(c.telefono, 30),
      comprobante: c.comprobante === 'factura' ? 'factura' : 'boleta',
      documento: texto(c.documento, 11).replace(/\D/g, ''),
      razon_social: texto(c.razon_social, 150)
    };
    if (cliente.nombre.length < 3) errores.nombre = 'Ingresa tu nombre completo.';
    if (!correoValido(cliente.correo)) errores.correo = 'Correo no válido.';
    if (cliente.telefono.replace(/\D/g, '').length < 9) errores.telefono = 'Teléfono no válido.';
    if (cliente.comprobante === 'boleta' && !/^\d{8}$/.test(cliente.documento)) errores.documento = 'El DNI debe tener 8 dígitos.';
    if (cliente.comprobante === 'factura') {
      if (!/^(10|20)\d{9}$/.test(cliente.documento)) errores.documento = 'El RUC debe tener 11 dígitos (empieza con 10 o 20).';
      if (cliente.razon_social.length < 3) errores.razon_social = 'Ingresa la razón social.';
    }

    const entrega = {
      tipo: e.tipo === 'recojo' ? 'recojo' : 'envio',
      departamento: texto(e.departamento, 40),
      distrito: texto(e.distrito, 80),
      direccion: texto(e.direccion, 200),
      referencia: texto(e.referencia, 200)
    };
    if (entrega.tipo === 'envio') {
      if (!DEPARTAMENTOS.includes(entrega.departamento)) errores.departamento = 'Selecciona el departamento.';
      if (entrega.distrito.length < 3) errores.distrito = 'Indica el distrito o ciudad.';
      if (entrega.direccion.length < 6) errores.direccion = 'Indica la dirección de entrega.';
    }

    if (!lineas.length || lineas.length > 100) errores.items = 'El carrito está vacío.';
    if (Object.keys(errores).length) {
      return res.status(400).json({ ok: false, mensaje: 'Revisa los datos marcados.', errores });
    }

    // Precios y stock siempre desde el servidor
    await conexion.beginTransaction();
    const [enBD] = await conexion.query('SELECT id, nombre, categoria, precio, precio_oferta, stock FROM productos WHERE activo = 1 FOR UPDATE');
    const catalogo = new Map(enBD.map(p => [p.id, p]));
    const items = [];
    const vistos = new Set();
    for (const linea of lineas) {
      const producto = catalogo.get(String(linea?.id || ''));
      const cantidad = Number(linea?.cantidad);
      if (!producto || vistos.has(producto.id) || !Number.isInteger(cantidad) || cantidad < 1 || cantidad > 50) {
        await conexion.rollback();
        return res.status(400).json({ ok: false, mensaje: 'Hay un producto o cantidad no válida en el carrito.' });
      }
      if (cantidad > producto.stock) {
        await conexion.rollback();
        return res.status(409).json({
          ok: false,
          mensaje: producto.stock ? `Solo quedan ${producto.stock} unidades de "${producto.nombre}".` : `"${producto.nombre}" está agotado.`
        });
      }
      vistos.add(producto.id);
      const precio = precioVigente(producto);   // precio de oferta si corresponde
      items.push({ ...producto, precio, cantidad, subtotal: redondear(precio * cantidad) });
    }

    const subtotal = redondear(items.reduce((s, i) => s + i.subtotal, 0));
    const envio = costoEnvio(entrega.tipo, entrega.departamento, subtotal);
    const total = redondear(subtotal + envio);

    const [insertado] = await conexion.query(
      `INSERT INTO pedidos (codigo, nombre, correo, telefono, comprobante, documento, razon_social, tipo_entrega,
         departamento, distrito, direccion, referencia, subtotal, costo_envio, total)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['T-' + crypto.randomBytes(8).toString('hex'), cliente.nombre, cliente.correo, cliente.telefono, cliente.comprobante, cliente.documento,
        cliente.razon_social || null, entrega.tipo,
        entrega.tipo === 'envio' ? entrega.departamento : null, entrega.tipo === 'envio' ? entrega.distrito : null,
        entrega.tipo === 'envio' ? entrega.direccion : null, entrega.tipo === 'envio' ? (entrega.referencia || null) : null,
        subtotal, envio, total]
    );
    const id = insertado.insertId;
    const codigo = P.codigoPedido(id);
    await conexion.query('UPDATE pedidos SET codigo = ? WHERE id = ?', [codigo, id]);
    for (const i of items) {
      await conexion.query(
        `INSERT INTO pedido_items (pedido_id, producto_id, nombre, categoria, precio_unitario, cantidad, subtotal)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, i.id, i.nombre, i.categoria, i.precio, i.cantidad, i.subtotal]
      );
    }
    await P.registrarHistorial(conexion, id, 'pendiente_pago', 'Pedido registrado. A la espera del pago.');
    await conexion.commit();

    res.status(201).json({ ok: true, pedido: { codigo, subtotal, envio, total, correo: cliente.correo } });
  } catch (error) {
    await conexion.rollback().catch(() => {});
    next(error);
  } finally {
    conexion.release();
  }
});

/* Pagar un pedido */
router.post('/pedidos/:codigo/pago', limitePagos, async (req, res, next) => {
  try {
    const [[pedido]] = await pool.query('SELECT * FROM pedidos WHERE codigo = ?', [String(req.params.codigo)]);
    const correo = texto(req.body.correo, 150).toLowerCase();
    if (!pedido || pedido.correo !== correo) {
      return res.status(404).json({ ok: false, mensaje: 'Pedido no encontrado.' });
    }
    if (!['pendiente_pago', 'pago_rechazado'].includes(pedido.estado)) {
      return res.status(409).json({ ok: false, mensaje: 'Este pedido ya no admite pagos.', estado: pedido.estado });
    }

    let pago;
    if (mp.activo()) {
      const f = req.body.formData || {};
      if (!f.token || !f.payment_method_id) {
        return res.status(400).json({ ok: false, mensaje: 'Faltan los datos de la tarjeta.' });
      }
      try {
        pago = { proveedor: 'mercadopago', ...(await mp.crearPago({ formData: f, pedido })) };
      } catch (error) {
        console.warn(`Mercado Pago rechazó la solicitud del pedido ${pedido.codigo} →`, error.message);
        return res.status(502).json({
          ok: false,
          mensaje: error.status === 401
            ? 'La tienda no está autorizada por Mercado Pago para este pago de prueba (revisa las credenciales del servidor).'
            : 'La pasarela no pudo procesar el pago. Revisa los datos e intenta nuevamente.'
        });
      }
    } else {
      // Modo demostración: sin credenciales de Mercado Pago no hay cobro, solo se simula el resultado
      const resultado = req.body.simulacion === 'rechazado' ? 'rechazado' : 'aprobado';
      pago = {
        proveedor: 'demo',
        referencia: 'DEMO-' + Date.now().toString(36).toUpperCase(),
        estado: resultado,
        detalle: resultado === 'aprobado' ? 'accredited' : 'cc_rejected_insufficient_amount',
        mensaje: resultado === 'aprobado' ? 'Pago acreditado' : 'Fondos insuficientes',
        metodo: 'visa',
        ultimos4: '6176',
        monto: Number(pedido.total)
      };
    }

    const { pedido: actualizado, cambio } = await P.registrarPago(pedido.id, pago);
    if (cambio && actualizado.estado === 'pagado') {
      const completo = await P.obtenerPedido('id', pedido.id);
      enviarCorreoPedido(completo, 'pagado', P.DESCRIPCION.pagado);
    }

    res.json({
      ok: true,
      pago: { estado: pago.estado, mensaje: pago.mensaje, detalle: pago.detalle },
      pedido: { codigo: pedido.codigo, estado: actualizado.estado, etiqueta: P.ESTADOS[actualizado.estado], total: Number(pedido.total) }
    });
  } catch (error) { next(error); }
});

/* Seguimiento público (requiere código + correo) */
router.get('/seguimiento', limiteSeguimiento, async (req, res, next) => {
  try {
    const codigo = texto(req.query.codigo, 20).toUpperCase();
    const correo = texto(req.query.correo, 150).toLowerCase();
    const p = await P.obtenerPedido('codigo', codigo);
    if (!p || p.correo !== correo) {
      return res.status(404).json({ ok: false, mensaje: 'No encontramos un pedido con ese código y correo.' });
    }
    const ruta = P.RUTA[p.tipo_entrega];
    res.json({
      ok: true,
      pedido: {
        codigo: p.codigo,
        nombre: p.nombre,
        estado: p.estado,
        etiqueta: P.ESTADOS[p.estado],
        descripcion: P.DESCRIPCION[p.estado],
        tipo_entrega: p.tipo_entrega,
        destino: p.tipo_entrega === 'envio' ? `${p.distrito}, ${p.departamento}` : 'Almacén BAPEG · Carabayllo, Lima',
        courier: p.courier,
        numero_guia: p.numero_guia,
        subtotal: Number(p.subtotal),
        costo_envio: Number(p.costo_envio),
        total: Number(p.total),
        metodo_pago: p.metodo_pago,
        creado_en: p.creado_en,
        items: p.items.map(i => ({ nombre: i.nombre, cantidad: i.cantidad, subtotal: Number(i.subtotal) })),
        pasos: ruta.map(estado => ({ estado, etiqueta: P.ESTADOS[estado] })),
        historial: p.historial.filter(h => h.visible_cliente).map(h => ({
          estado: h.estado, etiqueta: P.ESTADOS[h.estado] || h.estado, comentario: h.comentario, fecha: h.creado_en
        }))
      }
    });
  } catch (error) { next(error); }
});

/* Webhook de Mercado Pago (tópico "order"): confirma pagos que quedaron pendientes */
router.post('/webhooks/mercadopago', async (req, res) => {
  res.sendStatus(200); // Mercado Pago solo necesita saber que llegó
  try {
    if (!mp.activo()) return;
    const tipo = req.body?.type || req.query.type || req.query.topic;
    const id = req.body?.data?.id || req.query['data.id'] || req.query.id;
    if (tipo !== 'order' || !id) return; // Orders API notifica con el tópico "order"
    const pago = await mp.obtenerPago(id);
    if (!pago.pedido) return;
    const [[pedido]] = await pool.query('SELECT id FROM pedidos WHERE codigo = ?', [pago.pedido]);
    if (!pedido) return;
    const { pedido: actualizado, cambio } = await P.registrarPago(pedido.id, { proveedor: 'mercadopago', ...pago });
    if (cambio && actualizado.estado === 'pagado') {
      enviarCorreoPedido(await P.obtenerPedido('id', pedido.id), 'pagado', P.DESCRIPCION.pagado);
    }
  } catch (error) {
    console.warn('Webhook de Mercado Pago →', error.message);
  }
});

module.exports = router;
