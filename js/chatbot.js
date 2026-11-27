/*
  chatbot.js – Widget del asistente virtual Termi
  1. Dibuja el botón flotante y la ventana de chat.
  2. Envía la conversación a POST /api/chat (el servidor habla con Gemini).
  3. Guarda la conversación en sessionStorage mientras la pestaña esté abierta.
  La clave de Gemini NUNCA está aquí: solo la conoce el servidor.
*/
(function () {
  if (document.getElementById('termi-panel')) return;

  /* URL del backend: mismo servidor, Live Server o GitHub Pages (igual que el formulario) */
  function urlChat() {
    const { hostname, port } = location;
    if (hostname.endsWith('github.io')) return (typeof API_NUBE !== 'undefined' ? API_NUBE : '') + '/api/chat';
    if (/^(localhost|127\.0\.0\.1)$/.test(hostname) && port !== '3000') return 'http://localhost:3000/api/chat';
    return '/api/chat';
  }

  const CLAVE = 'termi-conversacion';
  const SALUDO = 'Hola, soy **Termi**, el asistente virtual de BAPEG Industrial. ¿En qué te ayudo? Puedo contarte sobre nuestros servicios, horarios, envíos o cómo cotizar.';
  const SUGERENCIAS = ['¿Cuál es su horario?', '¿Hacen envíos a provincias?', '¿Cómo pido una cotización?', 'Tengo una emergencia en planta'];

  let historial = [];
  try { historial = JSON.parse(sessionStorage.getItem(CLAVE)) || []; } catch { historial = []; }
  const guardar = () => { try { sessionStorage.setItem(CLAVE, JSON.stringify(historial.slice(-20))); } catch { /* sin almacenamiento */ } };

  /* 1. Estructura del widget */
  const boton = document.createElement('button');
  boton.className = 'termi-boton';
  boton.type = 'button';
  boton.setAttribute('aria-controls', 'termi-panel');
  boton.setAttribute('aria-expanded', 'false');
  boton.innerHTML = '<i class="fa-solid fa-robot" aria-hidden="true"></i><span>PREGÚNTALE A TERMI</span>';

  const panel = document.createElement('section');
  panel.className = 'termi-panel';
  panel.id = 'termi-panel';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Chat con Termi, asistente virtual');
  panel.innerHTML = `
    <header class="termi-cabecera">
      <span class="termi-avatar" aria-hidden="true"><i class="fa-solid fa-robot"></i></span>
      <div><strong>Termi</strong><small>Asistente virtual · BAPEG</small></div>
      <button class="termi-cerrar" type="button" aria-label="Cerrar chat"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
    </header>
    <div class="termi-mensajes" role="log" aria-live="polite"></div>
    <div class="termi-sugerencias"></div>
    <form class="termi-form" autocomplete="off">
      <input type="text" name="mensaje" maxlength="800" placeholder="Escribe tu consulta…" aria-label="Escribe tu consulta" required>
      <button type="submit" aria-label="Enviar"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i></button>
    </form>
    <p class="termi-aviso">Termi es una IA y puede equivocarse. No compartas datos personales ni de tarjetas.</p>`;
  document.body.append(boton, panel);

  const lista = panel.querySelector('.termi-mensajes');
  const sugerencias = panel.querySelector('.termi-sugerencias');
  const form = panel.querySelector('.termi-form');
  const input = form.querySelector('input');
  const enviarBtn = form.querySelector('button');

  /* Texto seguro: se escapa el HTML y luego se permite **negrita**, listas y enlaces */
  function formato(texto) {
    const esc = String(texto).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const lineas = esc.split('\n');
    let html = '', enLista = false;
    for (const l of lineas) {
      const item = l.match(/^\s*[-*•]\s+(.*)/);
      if (item) { if (!enLista) { html += '<ul>'; enLista = true; } html += `<li>${item[1]}</li>`; continue; }
      if (enLista) { html += '</ul>'; enLista = false; }
      if (l.trim()) html += `<p style="margin:0 0 .35rem">${l}</p>`;
    }
    if (enLista) html += '</ul>';
    return html
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  }

  function agregar(rol, texto) {
    const div = document.createElement('div');
    div.className = `termi-msg termi-msg--${rol}`;
    if (rol === 'usuario') div.textContent = texto; else div.innerHTML = formato(texto);
    lista.append(div);
    lista.scrollTop = lista.scrollHeight;
    return div;
  }

  function pintarSugerencias() {
    sugerencias.innerHTML = '';
    if (historial.length) return; // solo al inicio de la conversación
    SUGERENCIAS.forEach(s => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = s;
      b.addEventListener('click', () => enviar(s));
      sugerencias.append(b);
    });
  }

  function iniciar() {
    lista.innerHTML = '';
    agregar('termi', SALUDO);
    historial.forEach(m => agregar(m.rol, m.texto));
    pintarSugerencias();
  }

  /* 2. Enviar la consulta al servidor */
  async function enviar(texto) {
    texto = texto.trim();
    if (!texto || enviarBtn.disabled) return;
    historial.push({ rol: 'usuario', texto });
    agregar('usuario', texto);
    pintarSugerencias();
    input.value = '';
    enviarBtn.disabled = true;

    const escribiendo = agregar('termi', '');
    escribiendo.innerHTML = '<span class="termi-escribiendo" aria-label="Termi está escribiendo"><span></span><span></span><span></span></span>';

    try {
      const r = await fetch(urlChat(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensajes: historial })
      });
      const datos = await r.json().catch(() => ({}));
      if (!r.ok || !datos.ok) throw new Error(datos.mensaje || 'No se pudo conectar con Termi.');
      escribiendo.remove();
      historial.push({ rol: 'termi', texto: datos.respuesta });
      agregar('termi', datos.respuesta);
    } catch (error) {
      escribiendo.remove();
      historial.pop(); // la pregunta sin respuesta no se guarda
      agregar('error', error.message === 'Failed to fetch' ? 'No se pudo conectar con el servidor.' : error.message);
    } finally {
      guardar();
      enviarBtn.disabled = false;
      input.focus();
    }
  }

  /* 3. Eventos */
  function alternar(abrir) {
    panel.hidden = !abrir;
    boton.setAttribute('aria-expanded', String(abrir));
    if (abrir) { if (!lista.childElementCount) iniciar(); input.focus(); }
  }
  boton.addEventListener('click', () => alternar(panel.hidden));
  panel.querySelector('.termi-cerrar').addEventListener('click', () => alternar(false));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) alternar(false); });
  form.addEventListener('submit', e => { e.preventDefault(); enviar(input.value); });
})();
