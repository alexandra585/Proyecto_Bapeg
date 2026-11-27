/*
  termi.js – Conexión con Google Gemini para el asistente virtual "Termi".
  - Lee las instrucciones del sistema desde instrucciones.txt.
  - Usa la clave GEMINI_API_KEY y el modelo GEMINI_MODEL del archivo .env.
  - responder(historial) recibe la conversación y devuelve la respuesta de Termi.
*/
const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

const INSTRUCCIONES = fs.readFileSync(path.join(__dirname, 'instrucciones.txt'), 'utf8');
const MODELO = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

// El cliente solo se crea si hay clave; sin clave el chatbot queda desactivado
const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

function chatbotActivo() {
  return Boolean(ai);
}

/*
  historial: [{ rol: 'usuario' | 'termi', texto: '...' }, ...]  (el último es la pregunta actual)
  Gemini llama "user" al usuario y "model" al asistente.
*/
async function responder(historial) {
  if (!ai) throw new Error('El chatbot no está configurado (falta GEMINI_API_KEY).');
  const contents = historial.map(m => ({
    role: m.rol === 'termi' ? 'model' : 'user',
    parts: [{ text: m.texto }]
  }));
  const respuesta = await ai.models.generateContent({
    model: MODELO,
    contents,
    config: {
      systemInstruction: INSTRUCCIONES,
      maxOutputTokens: 600,   // respuestas cortas
      temperature: 0.4        // más preciso y menos "creativo"
    }
  });
  return (respuesta.text || '').trim();
}

module.exports = { responder, chatbotActivo, MODELO };
