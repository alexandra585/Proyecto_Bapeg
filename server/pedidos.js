/*
  pedidos.js – Reglas del ciclo de vida de un pedido
  1. Estados, etiquetas y transiciones permitidas (envío a domicilio o recojo en almacén).
  2. registrarPago(): guarda el intento de pago y, si se aprueba, confirma el pedido y descuenta stock.
  3. cambiarEstado(): avanza el pedido desde el panel validando que el paso sea posible.
  4. obtenerPedido(): pedido completo con productos, pagos e historial.
*/
const { pool } = require('./db');
const { moverStock } = require('./inventario');

/* 1. Estados */
const ESTADOS = {
  pendiente_pago: 'Pendiente de pago',
  pago_rechazado: 'Pago rechazado',
  pagado: 'Pago confirmado',
  en_preparacion: 'En preparación',
  listo_recojo: 'Listo para recoger',
  despachado: 'Enviado',
  en_reparto: 'En reparto',
  entregado: 'Entregado',
  cancelado: 'Cancelado'
};

/* Mensaje que ve el cliente en su seguimiento y en el correo */
const DESCRIPCION = {
  pendiente_pago: 'Registramos tu pedido. Falta completar el pago.',
  pago_rechazado: 'El pago no fue aprobado. Puedes intentarlo nuevamente.',
  pagado: 'Recibimos tu pago. Estamos validando tu pedido.',
  en_preparacion: 'Estamos preparando y empacando tus productos en almacén.',
  listo_recojo: 'Tu pedido está listo. Recógelo en nuestro almacén con tu DNI y el código del pedido.',
  despachado: 'Entregamos tu pedido al courier.',
  en_reparto: 'Tu pedido está en camino a la dirección indicada.',
  entregado: 'Pedido entregado. ¡Gracias por comprar en BAPEG!',
  cancelado: 'El pedido fue cancelado.'
};

/* Pasos posibles desde cada estado (lo que el panel puede hacer) */
const TRANSICIONES = {
  envio: {
    pendiente_pago: ['cancelado'],
    pago_rechazado: ['cancelado'],
    pagado: ['en_preparacion', 'cancelado'],
    en_preparacion: ['despachado', 'cancelado'],
    despachado: ['en_reparto', 'entregado'],
    en_reparto: ['entregado'],
    entregado: [],
    cancelado: []
  },
  recojo: {
    pendiente_pago: ['cancelado'],
    pago_rechazado: ['cancelado'],
    pagado: ['en_preparacion', 'cancelado'],
    en_preparacion: ['listo_recojo', 'cancelado'],
    listo_recojo: ['entregado', 'cancelado'],
    entregado: [],
    cancelado: []
  }
};

/* Estados que cuentan como venta realizada */
const ESTADOS_PAGADOS = ['pagado', 'en_preparacion', 'listo_recojo', 'despachado', 'en_reparto', 'entregado'];

/* Línea de tiempo "ideal" que se muestra al cliente */
const RUTA = {
  envio: ['pagado', 'en_preparacion', 'despachado', 'en_reparto', 'entregado'],
  recojo: ['pagado', 'en_preparacion', 'listo_recojo', 'entregado']
};

const COURIERS = ['Olva Courier', 'Shalom', 'Urbano Express', 'Reparto propio BAPEG'];

const codigoPedido = id => 'BP-' + String(id).padStart(6, '0');

async function registrarHistorial(conexion, pedidoId, estado, comentario, { visible = true, autor = 'sistema' } = {}) {
  await conexion.query(
    'INSERT INTO pedido_historial (pedido_id, estado, comentario, visible_cliente, autor) VALUES (?, ?, ?, ?, ?)',
    [pedidoId, estado, comentario ? String(comentario).slice(0, 300) : null, visible ? 1 : 0, autor]
  );
}

/* 2. Pago */
async function registrarPago(pedidoId, pago) {
  const conexion = await pool.getConnection();
  try {
    await conexion.beginTransaction();
    const [[pedido]] = await conexion.query('SELECT * FROM pedidos WHERE id = ? FOR UPDATE', [pedidoId]);

    // Un mismo pago de Mercado Pago puede llegar dos veces (respuesta + webhook): se ignora el repetido
    if (pago.referencia) {
      const [[repetido]] = await conexion.query(
        'SELECT id FROM pedido_pagos WHERE pedido_id = ? AND referencia = ? AND estado = ?',
        [pedidoId, pago.referencia, pago.estado]
      );
      if (repetido) { await conexion.commit(); return { pedido, cambio: false }; }
    }

    await conexion.query(
      `INSERT INTO pedido_pagos (pedido_id, proveedor, referencia, estado, detalle, metodo, ultimos4, monto)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [pedidoId, pago.proveedor, pago.referencia || null, pago.estado, pago.detalle || null,
        pago.metodo || null, pago.ultimos4 || null, pago.monto]
    );

    const puedeCambiar = ['pendiente_pago', 'pago_rechazado'].includes(pedido.estado);
    let nuevoEstado = pedido.estado;

    if (puedeCambiar && pago.estado === 'aprobado') {
      nuevoEstado = 'pagado';
      const tarjeta = pago.ultimos4 ? ` terminada en ${pago.ultimos4}` : '';
      const medio = pago.metodo ? pago.metodo.toUpperCase() + tarjeta : 'pago en línea';
      await conexion.query(
        'UPDATE pedidos SET estado = ?, metodo_pago = ?, pagado_en = NOW() WHERE id = ?',
        [nuevoEstado, medio, pedidoId]
      );
      // Descontar stock de cada producto
      const [items] = await conexion.query('SELECT producto_id, cantidad FROM pedido_items WHERE pedido_id = ?', [pedidoId]);
      for (const item of items) {
        await moverStock(conexion, item.producto_id, 'venta', -item.cantidad, { motivo: `Venta ${pedido.codigo}`, pedidoId });
      }
      await registrarHistorial(conexion, pedidoId, 'pagado', `Pago aprobado con ${medio}.`);
    } else if (puedeCambiar && pago.estado === 'rechazado') {
      nuevoEstado = 'pago_rechazado';
      await conexion.query('UPDATE pedidos SET estado = ? WHERE id = ?', [nuevoEstado, pedidoId]);
      await registrarHistorial(conexion, pedidoId, 'pago_rechazado', pago.mensaje || 'El pago no fue aprobado.');
    } else if (puedeCambiar && pago.estado === 'pendiente') {
      nuevoEstado = 'pendiente_pago';
      await conexion.query('UPDATE pedidos SET estado = ? WHERE id = ?', [nuevoEstado, pedidoId]);
      await registrarHistorial(conexion, pedidoId, 'pendiente_pago', 'El pago está en revisión por la pasarela.');
    }

    await conexion.commit();
    return { pedido: { ...pedido, estado: nuevoEstado }, cambio: nuevoEstado !== pedido.estado };
  } catch (error) {
    await conexion.rollback();
    throw error;
  } finally {
    conexion.release();
  }
}

/* 3. Cambio de estado desde el panel */
async function cambiarEstado(pedidoId, { estado, comentario, courier, guia, visible = true }, autor) {
  const conexion = await pool.getConnection();
  try {
    await conexion.beginTransaction();
    const [[pedido]] = await conexion.query('SELECT * FROM pedidos WHERE id = ? FOR UPDATE', [pedidoId]);
    if (!pedido) throw Object.assign(new Error('Pedido no encontrado.'), { status: 404 });

    const permitidos = TRANSICIONES[pedido.tipo_entrega][pedido.estado] || [];
    if (!permitidos.includes(estado)) {
      throw Object.assign(new Error(`No se puede pasar de "${ESTADOS[pedido.estado]}" a "${ESTADOS[estado] || estado}".`), { status: 400 });
    }

    const cambios = ['estado = ?'];
    const valores = [estado];
    let texto = comentario ? String(comentario).trim() : '';

    if (estado === 'despachado') {
      if (!courier || !guia) {
        throw Object.assign(new Error('Indique el courier y el número de guía para despachar.'), { status: 400 });
      }
      cambios.push('courier = ?', 'numero_guia = ?');
      valores.push(String(courier).slice(0, 60), String(guia).slice(0, 60));
      texto = texto || `Courier: ${courier} · Guía N.° ${guia}`;
    }

    // Cancelar un pedido ya pagado devuelve el stock y deja constancia del reembolso
    if (estado === 'cancelado' && ESTADOS_PAGADOS.includes(pedido.estado)) {
      const [items] = await conexion.query('SELECT producto_id, cantidad FROM pedido_items WHERE pedido_id = ?', [pedidoId]);
      for (const item of items) {
        await moverStock(conexion, item.producto_id, 'devolucion', item.cantidad,
          { motivo: `Cancelación ${pedido.codigo}`, pedidoId, autor });
      }
      texto = texto || 'Pedido cancelado. El reembolso se procesará al mismo medio de pago.';
    }

    await conexion.query(`UPDATE pedidos SET ${cambios.join(', ')} WHERE id = ?`, [...valores, pedidoId]);
    await registrarHistorial(conexion, pedidoId, estado, texto || null, { visible, autor });
    await conexion.commit();
    return { ...pedido, estado, courier: courier || pedido.courier, numero_guia: guia || pedido.numero_guia, comentario: texto };
  } catch (error) {
    await conexion.rollback();
    throw error;
  } finally {
    conexion.release();
  }
}

/* 4. Pedido completo */
async function obtenerPedido(where, valor) {
  const [[pedido]] = await pool.query(`SELECT * FROM pedidos WHERE ${where} = ?`, [valor]);
  if (!pedido) return null;
  const [items] = await pool.query(
    'SELECT producto_id, nombre, categoria, precio_unitario, cantidad, subtotal FROM pedido_items WHERE pedido_id = ? ORDER BY id',
    [pedido.id]
  );
  const [historial] = await pool.query(
    'SELECT estado, comentario, visible_cliente, autor, creado_en FROM pedido_historial WHERE pedido_id = ? ORDER BY creado_en, id',
    [pedido.id]
  );
  const [pagos] = await pool.query(
    'SELECT proveedor, referencia, estado, detalle, metodo, ultimos4, monto, creado_en FROM pedido_pagos WHERE pedido_id = ? ORDER BY creado_en, id',
    [pedido.id]
  );
  return { ...pedido, items, historial, pagos };
}

module.exports = {
  ESTADOS, DESCRIPCION, TRANSICIONES, ESTADOS_PAGADOS, RUTA, COURIERS,
  codigoPedido, registrarHistorial, registrarPago, cambiarEstado, obtenerPedido
};
