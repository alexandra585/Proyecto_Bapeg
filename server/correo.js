/*
  correo.js – Envío de correos con Nodemailer (Gmail)
  1. Crea el "transporte" SMTP con los datos de .env (MAIL_USER / MAIL_PASS).
  2. enviarConfirmacion(): correo al cliente con su código RFQ y un resumen.
  Si MAIL_USER o MAIL_PASS no están definidos, no se envía nada (solo un aviso en consola).

  Gmail exige una "contraseña de aplicación" (no tu contraseña normal):
  Cuenta de Google → Seguridad → Verificación en 2 pasos (activar) → Contraseñas de aplicaciones.
*/
const nodemailer = require('nodemailer');

const MAIL_USER = process.env.MAIL_USER;
const MAIL_PASS = (process.env.MAIL_PASS || '').replace(/\s+/g, ''); // Google la muestra con espacios
const REMITENTE = process.env.MAIL_FROM_NAME || 'BAPEG Industrial Perú';

/* 1. Transporte (se crea una sola vez) */
let transporte = null;
if (process.env.MAIL_TRANSPORT === 'prueba') {
  transporte = nodemailer.createTransport({ jsonTransport: true }); // solo para pruebas, no envía
} else if (MAIL_USER && MAIL_PASS) {
  transporte = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: MAIL_USER, pass: MAIL_PASS }
  });
}

const correoActivo = () => Boolean(transporte);

async function verificarCorreo() {
  if (!transporte) {
    console.warn('Aviso: correo desactivado. Define MAIL_USER y MAIL_PASS en .env para enviar confirmaciones.');
    return;
  }
  if (process.env.MAIL_TRANSPORT === 'prueba') return;
  try {
    await transporte.verify();
    console.log(`Correo listo: las confirmaciones se envían desde ${MAIL_USER}`);
  } catch (error) {
    console.warn('Aviso: no se pudo conectar a Gmail. Revise MAIL_USER y MAIL_PASS →', error.message);
  }
}

/* Escapa texto para insertarlo en el HTML del correo */
const esc = valor => String(valor ?? '').replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

/* 2. Plantilla HTML (estilos en línea: los clientes de correo ignoran <style>) */
function plantilla(r) {
  const fila = (etiqueta, valor) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #2a2a2a;font-family:'Courier New',monospace;font-size:11px;letter-spacing:1px;color:#a9a29b;text-transform:uppercase;width:38%;vertical-align:top;">${etiqueta}</td>
      <td style="padding:10px 0;border-bottom:1px solid #2a2a2a;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#e8e4e0;vertical-align:top;">${valor}</td>
    </tr>`;

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#121212;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#121212;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#1E1E1E;border:1px solid #333;border-top:4px solid #FF6B00;border-radius:6px;">
        <tr><td style="padding:28px 32px 8px;">
          <div style="font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:bold;color:#e8e4e0;">BAPEG
            <span style="font-family:'Courier New',monospace;font-size:11px;letter-spacing:2px;color:#a9a29b;font-weight:normal;">&nbsp;INDUSTRIAL PERÚ</span></div>
        </td></tr>
        <tr><td style="padding:16px 32px 0;">
          <div style="font-family:'Courier New',monospace;font-size:12px;letter-spacing:2px;color:#FF6B00;">REQUERIMIENTO RECIBIDO · ${esc(r.codigo)}</div>
          <h1 style="margin:10px 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:1.2;color:#e8e4e0;text-transform:uppercase;">Gracias, ${esc(r.nombre)}</h1>
          <p style="margin:0 0 20px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#a9a29b;">
            Hemos recibido su requerimiento técnico para <strong style="color:#e8e4e0;">${esc(r.empresa)}</strong>.
            Un ingeniero de cotizaciones lo revisará y le responderá en <strong style="color:#FFC000;">menos de 24 horas</strong>
            con la pre-evaluación correspondiente.</p>
        </td></tr>
        <tr><td style="padding:0 32px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#121212;border:1px solid #333;border-radius:6px;padding:4px 18px;">
            ${fila('Código', `<strong style="color:#FF6B00;font-family:'Courier New',monospace;">${esc(r.codigo)}</strong>`)}
            ${fila('Servicio', esc(r.servicio))}
            ${fila('Plazo', esc(r.plazo))}
            ${fila('Empresa', esc(r.empresa))}
            ${fila('Contacto', `${esc(r.nombre)}<br>${esc(r.telefono)}`)}
            ${r.archivo ? fila('Adjunto', esc(r.archivo)) : ''}
          </table>
        </td></tr>
        <tr><td style="padding:20px 32px 0;">
          <div style="font-family:'Courier New',monospace;font-size:11px;letter-spacing:1px;color:#a9a29b;text-transform:uppercase;margin-bottom:6px;">Detalle enviado</div>
          <div style="background:#121212;border:1px solid #333;border-left:3px solid #FFC000;border-radius:6px;padding:14px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#e8e4e0;white-space:pre-wrap;">${esc(r.detalle)}</div>
        </td></tr>
        <tr><td style="padding:24px 32px 28px;">
          <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:#a9a29b;">
            Si necesita agregar información, responda a este correo indicando el código <strong style="color:#e8e4e0;">${esc(r.codigo)}</strong>
            o escríbanos por WhatsApp al <a href="https://wa.me/51987654321" style="color:#38BDF8;text-decoration:none;">+51 987 654 321</a>.</p>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #333;background:#191919;border-radius:0 0 6px 6px;">
          <p style="margin:0;font-family:'Courier New',monospace;font-size:10px;letter-spacing:1px;color:#6b6560;">
            © ${new Date().getFullYear()} BAPEG INDUSTRIAL PERÚ EIRL · Este es un mensaje automático de confirmación.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function textoPlano(r) {
  return [
    `Gracias, ${r.nombre}.`,
    '',
    `Hemos recibido su requerimiento técnico (${r.codigo}) para ${r.empresa}.`,
    'Le responderemos en menos de 24 horas.',
    '',
    `Servicio: ${r.servicio}`,
    `Plazo: ${r.plazo}`,
    r.archivo ? `Adjunto: ${r.archivo}` : '',
    '',
    `Detalle: ${r.detalle}`,
    '',
    'BAPEG Industrial Perú · WhatsApp +51 987 654 321'
  ].filter(l => l !== null).join('\n');
}

/* Envía la confirmación. Nunca lanza error: si falla, solo lo registra. */
async function enviarConfirmacion(r) {
  if (!transporte) return false;
  try {
    const info = await transporte.sendMail({
      from: `"${REMITENTE}" <${MAIL_USER || 'pruebas@bapeg.local'}>`,
      to: r.correo,
      replyTo: MAIL_USER,
      subject: `Requerimiento recibido ${r.codigo} – BAPEG Industrial`,
      text: textoPlano(r),
      html: plantilla(r)
    });
    console.log(`Confirmación ${r.codigo} enviada a ${r.correo}`);
    return info;
  } catch (error) {
    console.warn(`Aviso: no se pudo enviar la confirmación ${r.codigo} →`, error.message);
    return false;
  }
}

module.exports = { enviarConfirmacion, verificarCorreo, correoActivo, plantilla };
