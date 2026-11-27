// 1. Cargar el .env (GEMINI_API_KEY y GEMINI_MODEL)
require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

// 2. Crear el cliente: toma la clave sola de la variable GEMINI_API_KEY
const ai = new GoogleGenAI({});

// 3. Leer las instrucciones de Termi y la pregunta escrita en la terminal
const instrucciones = fs.readFileSync(path.join(__dirname, '../server/chatbot/instrucciones.txt'), 'utf8');
const pregunta = process.argv[2] || 'Hola, ¿quién eres?';

async function main() {
  // 4. Enviar la pregunta al modelo junto con las instrucciones del sistema
  const respuesta = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL,
    contents: pregunta,
    config: { systemInstruction: instrucciones }
  });

  // 5. Mostrar la respuesta
  console.log('Tú:   ', pregunta);
  console.log('Termi:', respuesta.text);
}

main().catch(error => console.error('Error:', error.message));