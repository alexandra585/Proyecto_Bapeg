/*
  termi.js – Conexión rápida con Google Gemini para el asistente virtual "Termi".
*/
const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

const INSTRUCCIONES = fs.readFileSync(path.join(__dirname, 'instrucciones.txt'), 'utf8').trim();
const API_KEY = (process.env.GEMINI_API_KEY || '').trim();
const MODELO = (process.env.GEMINI_MODEL || 'gemini-3.8-flash').trim();

const ai = API_KEY ? new GoogleGenAI({ apiKey: API_KEY }) : null;

function chatbotActivo() {
  return Boolean(ai);
}

/* Atajos instantáneos (0 ms) para consultas frecuentes */
const ATAJOS = [
  {
    patron: /^(¿?\s*cu[aá]l es su horario\??|horarios?\s*(de atenci[oó]n)?\??)$/i,
    respuesta: 'Nuestro horario de atención es de lunes a viernes de 7:30 a 18:00 y sábados de 8:00 a 13:00. También puedes escribirnos en cualquier momento por WhatsApp o desde el formulario de Contacto.'
  },
  {
    patron: /^(¿?\s*c[oó]mo pido una cotizaci[oó]n\??|cotizar|cotizaci[oó]n)$/i,
    respuesta: 'Para cotizar, haz clic en el botón naranja "COTIZAR" (o ve a Contacto), completa tus datos, el servicio requerido y adjunta tus planos o especificaciones. Un ingeniero te responderá en menos de 24 horas.'
  }
];

async function responder(historial) {
  if (!ai) throw new Error('El chatbot no está configurado (falta GEMINI_API_KEY).');

  const ultimaPregunta = (historial[historial.length - 1]?.texto || '').trim();
  const atajo = ATAJOS.find(a => a.patron.test(ultimaPregunta));
  if (atajo) return atajo.respuesta;

  // Enviar solo los últimos 6 mensajes para reducir latencia
  const recientes = historial.slice(-6);
  const contents = recientes.map(m => ({
    role: m.rol === 'termi' ? 'model' : 'user',
    parts: [{ text: m.texto }]
  }));

  const respuesta = await ai.models.generateContent({
    model: MODELO,
    contents,
    config: {
      systemInstruction: (INSTRUCCIONES || 'Eres Termi, asistente de BAPEG Industrial Perú.') +
        '\nResponde siempre en máximo 2 o 3 oraciones directas y claras.',
      maxOutputTokens: 220,
      temperature: 0.3,
      thinkingConfig: { thinkingBudget: 0 }
    }
  });

  return (respuesta.text || '').trim();
}

module.exports = { responder, chatbotActivo, MODELO };