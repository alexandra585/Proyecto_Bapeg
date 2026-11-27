/*
  termi.js – Conexión rápida con Google Gemini para el asistente virtual "Termi".
*/
const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

const INSTRUCCIONES = fs.readFileSync(path.join(__dirname, 'instrucciones.txt'), 'utf8').trim();
const API_KEY = (process.env.GEMINI_API_KEY || '').trim();
const MODELO = (process.env.GEMINI_MODEL || 'gemini-3.8-flash').trim();

const GROQ_KEY = (process.env.GROQ_API_KEY || '').trim();
const GROQ_MODELO = (process.env.GROQ_MODEL || 'llama-3.3-70b-versatile').trim();
const TIMEOUT_MS = Number(process.env.CHAT_TIMEOUT_MS) || 10000;

// Sin reintentos y con límite de tiempo: si Gemini no responde, no se queda colgado
const ai = API_KEY
  ? new GoogleGenAI({ apiKey: API_KEY, httpOptions: { timeout: TIMEOUT_MS, retryOptions: { attempts: 1 } } })
  : null;

function chatbotActivo() {
  return Boolean(ai || GROQ_KEY);
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

function sistema() {
  return (INSTRUCCIONES || 'Eres Termi, asistente de BAPEG Industrial Perú.') +
    '\nResponde siempre en máximo 2 o 3 oraciones directas y claras.';
}

async function conGemini(recientes) {
  const contents = recientes.map(m => ({
    role: m.rol === 'termi' ? 'model' : 'user',
    parts: [{ text: m.texto }]
  }));
  const respuesta = await ai.models.generateContent({
    model: MODELO,
    contents,
    config: {
      systemInstruction: sistema(),
      maxOutputTokens: 220,
      temperature: 0.3,
      thinkingConfig: { thinkingBudget: 0 }
    }
  });
  return (respuesta.text || '').trim();
}

async function conGroq(recientes) {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_KEY}` },
    body: JSON.stringify({
      model: GROQ_MODELO,
      messages: [
        { role: 'system', content: sistema() },
        ...recientes.map(m => ({ role: m.rol === 'termi' ? 'assistant' : 'user', content: m.texto }))
      ],
      max_tokens: 220,
      temperature: 0.3
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Groq ${r.status}: ${datos.error?.message || r.statusText}`);
  return (datos.choices?.[0]?.message?.content || '').trim();
}

async function responder(historial) {
  if (!chatbotActivo()) throw new Error('El chatbot no está configurado (falta GEMINI_API_KEY o GROQ_API_KEY).');

  const ultimaPregunta = (historial[historial.length - 1]?.texto || '').trim();
  const atajo = ATAJOS.find(a => a.patron.test(ultimaPregunta));
  if (atajo) return atajo.respuesta;

  // Últimos 6 mensajes, pero siempre empezando por un mensaje del usuario
  const recientes = historial.slice(-6);
  while (recientes.length > 1 && recientes[0].rol !== 'usuario') recientes.shift();

  // Groq primero (responde en ~1 s); Gemini solo como respaldo
  if (GROQ_KEY) {
    try {
      return await conGroq(recientes);
    } catch (error) {
      console.warn(`Aviso: Groq (${GROQ_MODELO}) falló →`, error.message);
      if (!ai) throw error;
    }
  }
  return await conGemini(recientes);
}

module.exports = { responder, chatbotActivo, MODELO };
