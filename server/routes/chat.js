/*
  chat.js – API del asistente virtual Termi
  POST /api/chat   body: { mensajes: [{ rol: 'usuario' | 'termi', texto }] }
  Respuesta:       { ok: true, respuesta: '...' }
*/
const express = require('express');
const rateLimit = require('express-rate-limit');
const { responder, chatbotActivo } = require('../chatbot/termi');

const router = express.Router();

/* Máximo 20 mensajes cada 5 minutos por IP: protege la cuota gratuita de Gemini */
const limiteChat = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, mensaje: 'Enviaste muchos mensajes seguidos. Espera unos minutos, por favor.' }
});

const MAX_MENSAJES = 20;     // historial que se envía a Gemini
const MAX_CARACTERES = 800;  // largo máximo de cada mensaje

router.post('/', limiteChat, async (req, res) => {
  if (!chatbotActivo()) {
    return res.status(503).json({ ok: false, mensaje: 'El asistente no está disponible en este momento.' });
  }

  // Validar el historial recibido (nunca confiar en lo que manda el navegador)
  const recibidos = Array.isArray(req.body?.mensajes) ? req.body.mensajes : [];
  const mensajes = recibidos
    .filter(m => m && (m.rol === 'usuario' || m.rol === 'termi') && typeof m.texto === 'string')
    .map(m => ({ rol: m.rol, texto: m.texto.trim().slice(0, MAX_CARACTERES) }))
    .filter(m => m.texto)
    .slice(-MAX_MENSAJES);

  if (!mensajes.length || mensajes[mensajes.length - 1].rol !== 'usuario') {
    return res.status(400).json({ ok: false, mensaje: 'Escribe tu consulta.' });
  }
  // Gemini exige que la conversación empiece con un mensaje del usuario
  while (mensajes.length && mensajes[0].rol !== 'usuario') mensajes.shift();

  try {
    const respuesta = await responder(mensajes);
    res.json({ ok: true, respuesta: respuesta || 'No pude generar una respuesta. ¿Puedes reformular tu pregunta?' });
  } catch (error) {
    console.warn('Aviso: error del chatbot Termi →', error.message);
    const cuota = /429|RESOURCE_EXHAUSTED|quota/i.test(error.message);
    res.status(cuota ? 429 : 502).json({
      ok: false,
      mensaje: cuota
        ? 'Termi recibió muchas consultas. Inténtalo en un minuto o escríbenos por WhatsApp.'
        : 'Termi no pudo responder ahora. Inténtalo de nuevo o escríbenos por WhatsApp.',
      detalle: String(error.message || '').slice(0, 300)
    });
  }
});

module.exports = router;
