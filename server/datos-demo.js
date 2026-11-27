/*
  datos-demo.js – Carga pedidos y requerimientos de ejemplo de los últimos 60 días
  para que el Dashboard muestre gráficos durante la presentación.
  Uso:  npm run datos-demo            (agrega datos de ejemplo)
        npm run datos-demo -- --borrar (elimina solo los datos de ejemplo)
  Los registros de ejemplo usan correos @demo.bapeg.pe, así se pueden borrar sin tocar los reales.
*/
require('dotenv').config({ quiet: true });
const { pool, inicializar } = require('./db');
const { PRODUCTOS, costoEnvio } = require('./catalogo');
const { codigoPedido, RUTA, ESTADOS } = require('./pedidos');

const NOMBRES = ['Carlos Quispe', 'María Huamán', 'José Flores', 'Rosa Mamani', 'Luis Chávez', 'Ana Torres', 'Jorge Rojas',
  'Lucía Vargas', 'Pedro Castillo', 'Elena Ramos', 'Miguel Sánchez', 'Carmen Díaz', 'Raúl Gutiérrez', 'Patricia León'];
const EMPRESAS = ['Minera Andina SAC', 'Constructora Pacífico SA', 'Agroindustrial Norte SAC', 'Pesquera del Sur SA', 'Metalmecánica Lima EIRL'];
const DESTINOS = [['Lima', 'San Isidro'], ['Lima', 'Ate'], ['Lima', 'Callao'], ['Arequipa', 'Cayma'], ['La Libertad', 'Trujillo'],
  ['Piura', 'Talara'], ['Junín', 'Huancayo'], ['Cusco', 'Wanchaq'], ['Callao', 'Bellavista'], ['Lima', 'Lurín']];
const SERVICIOS = ['Montaje industrial', 'Suministro de materiales', 'Auditoría termográfica', 'Mantenimiento / SLA'];
const COURIERS = ['Olva Courier', 'Shalom', 'Urbano Express'];

const azar = lista => lista[Math.floor(Math.random() * lista.length)];
const entre = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const fechaHace = (dias, horas = 0) => new Date(Date.now() - dias * 864e5 - horas * 36e5);
const mas = (fecha, horas) => new Date(fecha.getTime() + horas * 36e5);

async function borrar() {
  await pool.query("DELETE FROM inventario_movimientos WHERE motivo = 'Venta de ejemplo (datos demo)'");
  await pool.query("DELETE FROM pedidos WHERE correo LIKE '%@demo.bapeg.pe'");
  await pool.query("DELETE FROM requerimientos WHERE correo LIKE '%@demo.bapeg.pe'");
  console.log('Datos de ejemplo eliminados.');
}

async function crearPedido(dias) {
  const nombre = azar(NOMBRES);
  const recojo = Math.random() < 0.25;
  const [departamento, distrito] = azar(DESTINOS);
  // Más ventas en días recientes y de productos de seguridad
  const lineas = [];
  const cantidadProductos = entre(1, 4);
  while (lineas.length < cantidadProductos) {
    const p = Math.random() < 0.6 ? azar(PRODUCTOS.filter(x => x.categoria === 'seguridad')) : azar(PRODUCTOS);
    if (!lineas.find(l => l.p.id === p.id)) lineas.push({ p, cantidad: entre(1, p.precio > 100 ? 2 : 6) });
  }
  const subtotal = Math.round(lineas.reduce((s, l) => s + l.p.precio * l.cantidad, 0) * 100) / 100;
  const envio = costoEnvio(recojo ? 'recojo' : 'envio', departamento, subtotal);
  const total = Math.round((subtotal + envio) * 100) / 100;
  const creado = fechaHace(dias, entre(0, 12));

  // Resultado: la mayoría pagados; algunos rechazados o sin pagar
  const suerte = Math.random();
  const ruta = RUTA[recojo ? 'recojo' : 'envio'];
  let historial = [['pendiente_pago', 'Pedido registrado. A la espera del pago.', 0]];
  let pagos = [];
  let estado = 'pendiente_pago';
  if (suerte < 0.1) {
    estado = 'pago_rechazado';
    pagos.push(['rechazado', 'cc_rejected_insufficient_amount', 0.1]);
    historial.push(['pago_rechazado', 'Fondos insuficientes', 0.1]);
  } else if (suerte < 0.15) {
    estado = 'pendiente_pago';
  } else {
    if (Math.random() < 0.2) {
      pagos.push(['rechazado', 'cc_rejected_bad_filled_security_code', 0.05]);
      historial.push(['pago_rechazado', 'Código de seguridad incorrecto', 0.05]);
    }
    pagos.push(['aprobado', 'accredited', 0.1]);
    // Cuanto más antiguo, más avanzado
    const avance = Math.min(ruta.length - 1, Math.floor(dias / 2) + entre(0, 1));
    const horas = [0.1, 5, 26, 40, 70];
    for (let i = 0; i <= avance; i++) {
      const e = ruta[i];
      historial.push([e, e === 'pagado' ? 'Pago aprobado con VISA terminada en 6176.' : null, horas[i]]);
    }
    estado = ruta[avance];
    if (dias > 5 && Math.random() < 0.06) { estado = 'cancelado'; historial.push(['cancelado', 'Cancelado a solicitud del cliente. Reembolso procesado.', 30]); }
  }
  const despachado = historial.some(h => h[0] === 'despachado');
  const courier = despachado ? azar(COURIERS) : null;
  const guia = despachado ? `${entre(1000, 9999)}-${entre(100000, 999999)}` : null;
  if (despachado) historial = historial.map(h => h[0] === 'despachado' ? [h[0], `Courier: ${courier} · Guía N.° ${guia}`, h[2]] : h);

  const correo = nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(' ', '.') + entre(1, 99) + '@demo.bapeg.pe';
  const factura = Math.random() < 0.35;
  const [r] = await pool.query(
    `INSERT INTO pedidos (codigo, nombre, correo, telefono, comprobante, documento, razon_social, tipo_entrega, departamento,
       distrito, direccion, subtotal, costo_envio, total, estado, metodo_pago, pagado_en, courier, numero_guia, creado_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['T-' + Math.random().toString(36).slice(2, 12), nombre, correo, '9' + entre(10000000, 99999999),
      factura ? 'factura' : 'boleta', factura ? '20' + entre(100000000, 999999999) : String(entre(10000000, 79999999)),
      factura ? azar(EMPRESAS) : null, recojo ? 'recojo' : 'envio', recojo ? null : departamento, recojo ? null : distrito,
      recojo ? null : `Av. Industrial ${entre(100, 2500)}`, subtotal, envio, total, estado,
      pagos.some(p => p[0] === 'aprobado') ? 'VISA terminada en 6176' : null,
      pagos.some(p => p[0] === 'aprobado') ? mas(creado, 0.1) : null, courier, guia, creado]
  );
  await pool.query('UPDATE pedidos SET codigo = ? WHERE id = ?', [codigoPedido(r.insertId), r.insertId]);
  for (const l of lineas) {
    await pool.query(
      'INSERT INTO pedido_items (pedido_id, producto_id, nombre, categoria, precio_unitario, cantidad, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [r.insertId, l.p.id, l.p.nombre, l.p.categoria, l.p.precio, l.cantidad, Math.round(l.p.precio * l.cantidad * 100) / 100]);
  }
  // Ventas en el kardex (solo registro histórico; el stock real no se modifica con los datos de ejemplo)
  if (pagos.some(p => p[0] === 'aprobado') && estado !== 'cancelado') {
    for (const l of lineas) {
      await pool.query(
        `INSERT INTO inventario_movimientos (producto_id, tipo, cantidad, stock_resultante, motivo, pedido_id, creado_en)
         SELECT id, 'venta', ?, stock, ?, ?, ? FROM productos WHERE id = ?`,
        [-l.cantidad, 'Venta de ejemplo (datos demo)', r.insertId, mas(creado, 0.1), l.p.id]);
    }
  }
  for (const [e, detalle, h] of pagos) {
    await pool.query(
      `INSERT INTO pedido_pagos (pedido_id, proveedor, referencia, estado, detalle, metodo, ultimos4, monto, creado_en)
       VALUES (?, 'demo', ?, ?, ?, 'visa', '6176', ?, ?)`,
      [r.insertId, 'DEMO-' + entre(10000, 99999), e, detalle, total, mas(creado, h)]);
  }
  for (const [e, comentario, h] of historial) {
    if (!ESTADOS[e]) continue;
    await pool.query('INSERT INTO pedido_historial (pedido_id, estado, comentario, autor, creado_en) VALUES (?, ?, ?, ?, ?)',
      [r.insertId, e, comentario, ['pendiente_pago', 'pagado', 'pago_rechazado'].includes(e) ? 'sistema' : 'admin', mas(creado, h)]);
  }
}

async function crearRequerimiento(dias) {
  const nombre = azar(NOMBRES);
  const estado = dias < 3 ? 'nuevo' : azar(['nuevo', 'en_revision', 'en_revision', 'cotizado', 'cotizado', 'cerrado']);
  await pool.query(
    `INSERT INTO requerimientos (nombre, empresa, correo, telefono, servicio, plazo, detalle, estado, creado_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [nombre, azar(EMPRESAS), 'contacto' + entre(1, 999) + '@demo.bapeg.pe', '9' + entre(10000000, 99999999),
      azar(SERVICIOS), azar(['Inmediato', 'Menos de 15 días', 'Parada programada']),
      'Requerimiento de ejemplo generado para la demostración del panel.', estado, fechaHace(dias, entre(0, 10))]);
}

(async () => {
  try {
    await inicializar();
    if (process.argv.includes('--borrar')) { await borrar(); return; }
    let pedidos = 0;
    for (let dias = 59; dias >= 0; dias--) {
      const n = Math.random() < 0.25 ? 0 : entre(1, dias < 30 ? 4 : 3);
      for (let i = 0; i < n; i++) { await crearPedido(dias); pedidos++; }
      if (Math.random() < 0.45) await crearRequerimiento(dias);
    }
    console.log(`Listo: ${pedidos} pedidos y requerimientos de ejemplo creados. Bórralos con: npm run datos-demo -- --borrar`);
  } catch (error) {
    console.error('Error:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
