/*
  mercadopago.js – Cliente mínimo de la API de Mercado Pago (sin SDK, con fetch)
  Integración: Checkout API vía Orders API + Card Payment Brick.
  1. El Brick (checkout.html) dibuja el formulario de tarjeta y la convierte en un "token".
  2. El servidor crea una "order" con POST /v1/orders, con el monto calculado por el servidor.
  Así el servidor nunca ve ni guarda números de tarjeta.

  Variables de .env (Tus integraciones → tu aplicación → Prueba → Credenciales de prueba):
    MP_PUBLIC_KEY    → clave pública (va al navegador)        Empieza con APP_USR-
    MP_ACCESS_TOKEN  → token privado (solo en el servidor)    Empieza con APP_USR-
  Si faltan, la tienda funciona en "modo demostración" sin cobrar nada.
  Nota: las credenciales de prueba APP_USR solo funcionan con /v1/orders; la API antigua
  /v1/payments responde "Unauthorized use of live credentials".
*/
const crypto = require('crypto');

const API_URL = process.env.MP_API_URL || 'https://api.mercadopago.com';
const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN || '';
const PUBLIC_KEY = process.env.MP_PUBLIC_KEY || '';

const activo = () => Boolean(ACCESS_TOKEN && PUBLIC_KEY);

/* Mensajes en español para los detalles más comunes (Orders API y Payments API) */
const MOTIVOS = {
  accredited: 'Pago acreditado',
  pending_contingency: 'Estamos procesando el pago',
  pending_review_manual: 'El pago está en revisión',
  in_process: 'El pago está en revisión',
  insufficient_amount: 'Fondos insuficientes',
  bad_filled_security_code: 'Código de seguridad incorrecto',
  bad_filled_date: 'Fecha de vencimiento incorrecta',
  bad_filled_card_number: 'Número de tarjeta incorrecto',
  bad_filled_other: 'Revisa los datos de la tarjeta',
  call_for_authorize: 'Debes autorizar el pago con tu banco',
  card_disabled: 'La tarjeta está deshabilitada',
  duplicated_payment: 'Ya realizaste un pago por este monto',
  high_risk: 'Pago rechazado por seguridad',
  max_attempts: 'Superaste el número de intentos permitidos',
  blacklist: 'No pudimos procesar el pago',
  invalid_installments: 'La tarjeta no acepta esas cuotas',
  rejected_by_issuer: 'El banco rechazó el pago',
  other_reason: 'El banco rechazó el pago',
  rejected_other_reason: 'El banco rechazó el pago'
};
// "cc_rejected_insufficient_amount" y "insufficient_amount" significan lo mismo
const clave = detalle => String(detalle || '').replace(/^cc_rejected_/, '');
const motivo = detalle => MOTIVOS[clave(detalle)] || MOTIVOS[detalle] || 'El pago no fue aprobado';

/* Convierte el estado de Mercado Pago al de la tienda */
function normalizarEstado(status) {
  if (['processed', 'approved', 'accredited'].includes(status)) return 'aprobado';
  if (['action_required', 'processing', 'pending', 'in_process', 'authorized', 'created'].includes(status)) return 'pendiente';
  return 'rechazado'; // failed, rejected, canceled, refunded, expired, charged_back
}

async function llamar(ruta, opciones = {}) {
  const respuesta = await fetch(API_URL + ruta, {
    ...opciones,
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      ...(opciones.headers || {})
    },
    signal: AbortSignal.timeout(20000)
  });
  const datos = await respuesta.json().catch(() => ({}));

  // Orders API: un pago rechazado responde 402 e incluye la order en "data"
  if (respuesta.status === 402 && (datos.data || datos.errors)) return { rechazoOrders: true, ...datos };

  if (!respuesta.ok) {
    const primero = (datos.errors && datos.errors[0]) || (Array.isArray(datos.cause) && datos.cause[0]) || null;
    const extra = primero ? ` (${primero.code || ''}${primero.message ? ': ' + primero.message : ''})` : '';
    const error = new Error((datos.message || `Mercado Pago respondió ${respuesta.status}`) + extra);
    error.status = respuesta.status;
    error.detalle = datos;
    throw error;
  }
  return datos;
}

/*
  Crea la order con los datos que entrega el Brick (token, marca, tipo, cuotas, pagador).
  El monto y la referencia los pone el servidor a partir del pedido guardado.
*/
async function crearPago({ formData, pedido }) {
  const monto = Number(pedido.total).toFixed(2);
  const identificacion = formData.payer?.identification;
  const cuerpo = {
    type: 'online',
    processing_mode: 'automatic',
    total_amount: monto,
    external_reference: pedido.codigo,
    description: `Pedido ${pedido.codigo} - BAPEG Industrial`,
    payer: {
      email: process.env.MP_EMAIL_COMPRADOR_PRUEBA || formData.payer?.email || pedido.correo,
      ...(identificacion?.number ? { identification: { type: identificacion.type, number: String(identificacion.number) } } : {})
    },
    transactions: {
      payments: [{
        amount: monto,
        payment_method: {
          id: formData.payment_method_id,
          type: formData.payment_type_id || 'credit_card',
          token: formData.token,
          installments: Number(formData.installments) || 1
        }
      }]
    }
  };

  const orden = await llamar('/v1/orders', {
    method: 'POST',
    headers: { 'X-Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify(cuerpo)
  });
  return resumir(orden);
}

async function obtenerPago(id) {
  return resumir(await llamar(`/v1/orders/${encodeURIComponent(id)}`));
}

function resumir(respuesta) {
  // Rechazo (HTTP 402): la order viene en "data"; el detalle puede venir en "errors"
  const orden = respuesta.rechazoOrders ? (respuesta.data || {}) : respuesta;
  const pago = orden.transactions?.payments?.[0] || {};
  const detalleError = respuesta.rechazoOrders
    ? (respuesta.errors?.[0]?.details?.[0] || respuesta.errors?.[0]?.code)
    : null;
  const estadoBase = respuesta.rechazoOrders ? 'failed' : (pago.status || orden.status);
  const detalle = pago.status_detail || orden.status_detail || detalleError || estadoBase;
  return {
    referencia: orden.id ? String(orden.id) : null,
    estado: normalizarEstado(estadoBase),
    detalle,
    mensaje: motivo(detalle),
    metodo: pago.payment_method?.id || null,
    ultimos4: pago.payment_method?.last_four_digits || null,
    monto: Number(pago.amount || orden.total_amount) || 0,
    pedido: orden.external_reference || null
  };
}

module.exports = { activo, publicKey: () => PUBLIC_KEY, crearPago, obtenerPago, motivo };
