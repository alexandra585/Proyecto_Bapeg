/*
  main.js – Interacciones del sitio
  1. Navegación compartida y fecha del footer.
  2. Animación de entrada al desplazar la página.
  3. Selector de servicio del formulario.
  4. Envío del formulario al backend (Node.js + MySQL).
  5. Carrusel de imágenes.
*/

/* 1. Se ejecuta cuando layout.js terminó de insertar header y footer. */
document.addEventListener('layoutListo', () => {
  /* a) Marcar el enlace de la página actual */
  const actual = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav a:not(.btn)').forEach(a => {
    if (a.getAttribute('href') === actual) a.classList.add('activo');
  });

  /* b) Menú hamburguesa: abre/cierra y actualiza aria-expanded */
  const boton = document.querySelector('.hamburguesa');
  const menu = document.getElementById('menu');
  boton.addEventListener('click', () => {
    const abierto = menu.classList.toggle('abierto');
    boton.classList.toggle('abierto', abierto);
    boton.setAttribute('aria-expanded', abierto);
  });

  /* c) Enlace al panel: en GitHub Pages apunta al backend publicado */
  const enlaceAdmin = document.getElementById('enlace-admin');
  if (enlaceAdmin && location.hostname.endsWith('github.io')) enlaceAdmin.href = API_NUBE + '/admin/';

  /* d) Año automático en el footer */
  document.getElementById('anio').textContent = new Date().getFullYear();

  /* e) Botón flotante para volver al inicio */
  const volverArriba = document.getElementById('volver-arriba');
  const actualizarBotonSubida = () => {
    volverArriba.classList.toggle('is-visible', window.scrollY > 350);
  };

  window.addEventListener('scroll', actualizarBotonSubida, { passive: true });
  volverArriba.addEventListener('click', () => {
    const movimientoReducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: movimientoReducido ? 'instant' : 'smooth' });
  });
  actualizarBotonSubida();
});

/* 2. Scroll reveal: anima cada .reveal al entrar en pantalla. */
const observador = new IntersectionObserver((entradas) => {
  entradas.forEach(entrada => {
    if (entrada.isIntersecting) {
      entrada.target.classList.add('visible');
      observador.unobserve(entrada.target);
    }
  });
}, { threshold: 0.15 });
document.querySelectorAll('.reveal').forEach(el => observador.observe(el));

/* 3. Selector de servicio: conserva los datos en el select del formulario. */
const form = document.getElementById('form-contacto');
const servicioSelect = document.getElementById('servicio-select');
if (servicioSelect) {
  const selectNativo = document.getElementById('servicio');
  const control = document.getElementById('servicio-control');
  const valor = document.getElementById('servicio-valor');
  const lista = document.getElementById('servicio-opciones');
  const opciones = [...lista.querySelectorAll('[role="option"]')];
  let activa = -1;

  function marcarActiva(indice) {
    activa = (indice + opciones.length) % opciones.length;
    opciones.forEach((opcion, i) => opcion.classList.toggle('is-activa', i === activa));
    control.setAttribute('aria-activedescendant', opciones[activa].id);
    opciones[activa].scrollIntoView({ block: 'nearest' });
  }

  function cerrar() {
    lista.hidden = true;
    control.setAttribute('aria-expanded', 'false');
    servicioSelect.classList.remove('is-abierto');
    control.removeAttribute('aria-activedescendant');
    opciones.forEach(opcion => opcion.classList.remove('is-activa'));
    activa = -1;
  }

  function abrir() {
    lista.hidden = false;
    control.setAttribute('aria-expanded', 'true');
    servicioSelect.classList.add('is-abierto');
    const seleccionada = opciones.findIndex(opcion => opcion.dataset.value === selectNativo.value);
    marcarActiva(seleccionada >= 0 ? seleccionada : 0);
  }

  function elegir(opcion) {
    selectNativo.value = opcion.dataset.value;
    valor.textContent = opcion.textContent;
    opciones.forEach(item => item.setAttribute('aria-selected', String(item === opcion)));
    control.removeAttribute('aria-invalid');
    selectNativo.dispatchEvent(new Event('change', { bubbles: true }));
    cerrar();
    control.focus();
  }

  control.addEventListener('click', () => {
    const abierto = control.getAttribute('aria-expanded') === 'true';
    if (abierto) cerrar();
    else abrir();
  });
  control.addEventListener('keydown', event => {
    const abierto = control.getAttribute('aria-expanded') === 'true';
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!abierto) abrir();
      else marcarActiva(activa + (event.key === 'ArrowDown' ? 1 : -1));
    } else if (event.key === 'Home' && abierto) {
      event.preventDefault();
      marcarActiva(0);
    } else if (event.key === 'End' && abierto) {
      event.preventDefault();
      marcarActiva(opciones.length - 1);
    } else if ((event.key === 'Enter' || event.key === ' ') && abierto) {
      event.preventDefault();
      if (activa >= 0) elegir(opciones[activa]);
    } else if (event.key === 'Escape' && abierto) {
      event.preventDefault();
      cerrar();
    } else if (event.key === 'Tab' && abierto) {
      cerrar();
    }
  });

  opciones.forEach((opcion, indice) => {
    opcion.addEventListener('pointerenter', () => marcarActiva(indice));
    opcion.addEventListener('click', () => elegir(opcion));
  });

  selectNativo.addEventListener('invalid', event => {
    event.preventDefault();
    control.setAttribute('aria-invalid', 'true');
    control.focus();
  });
  document.addEventListener('pointerdown', event => {
    if (!servicioSelect.contains(event.target)) {
      cerrar();
    }
  });
  form?.addEventListener('reset', () => requestAnimationFrame(() => {
    valor.textContent = selectNativo.options[0].textContent;
    opciones.forEach(opcion => opcion.setAttribute('aria-selected', 'false'));
    control.removeAttribute('aria-invalid');
    cerrar();
  }));
}

/* 4. Envío del formulario al backend Node.js + MySQL, sin recargar la página.

   ¿A qué servidor se envía?
   - Si la página la sirve el propio servidor Node (localhost:3000 o la nube) → misma URL.
   - Si se abre con Live Server (otro puerto) → http://localhost:3000.
   - Si se abre desde GitHub Pages → API_NUBE (cámbiala por la URL de tu backend publicado). */
const API_NUBE = 'https://bapeg-industrial.onrender.com';

function urlFormulario() {
  const { hostname, port } = location;
  if (hostname.endsWith('github.io')) return API_NUBE + '/api/requerimientos';
  if (/^(localhost|127\.0\.0\.1)$/.test(hostname) && port !== '3000') return 'http://localhost:3000/api/requerimientos';
  return '/api/requerimientos';
}

if (form) {
  const estado = document.getElementById('form-estado');
  const boton = form.querySelector('[type="submit"]');
  const archivo = document.getElementById('archivo');
  const archivoNombre = document.getElementById('archivo-nombre');
  const textoArchivo = archivoNombre?.textContent;

  /* Muestra el nombre del archivo elegido */
  archivo?.addEventListener('change', () => {
    const elegido = archivo.files[0];
    if (elegido && elegido.size > 25 * 1024 * 1024) {
      archivo.value = '';
      archivoNombre.textContent = 'El archivo supera los 25 MB. Elija otro.';
      return;
    }
    archivoNombre.textContent = elegido ? '📎 ' + elegido.name : textoArchivo;
  });
  form.addEventListener('reset', () => { if (archivoNombre) archivoNombre.textContent = textoArchivo; });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    form.querySelectorAll('[aria-invalid="true"]').forEach(c => c.removeAttribute('aria-invalid'));
    estado.textContent = 'Enviando…';
    boton.disabled = true;

    try {
      const respuesta = await fetch(urlFormulario(), {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' }
      });
      const datos = await respuesta.json().catch(() => ({}));

      if (respuesta.ok) {
        const codigo = datos.id ? ' Código: RFQ-' + String(datos.id).padStart(4, '0') + '.' : '';
        estado.textContent = 'Requerimiento enviado.' + codigo + ' Responderemos en menos de 24 h.';
        form.reset();
      } else {
        // Marca los campos con error que devuelve el servidor
        Object.keys(datos.errores || {}).forEach(nombre => {
          form.querySelector(`[name="${nombre}"]`)?.setAttribute('aria-invalid', 'true');
        });
        const detalle = datos.errores ? ' ' + Object.values(datos.errores).join(' ') : '';
        estado.textContent = (datos.mensaje || 'No se pudo enviar el requerimiento.') + detalle;
      }
    } catch {
      estado.textContent = 'No se pudo conectar con el servidor. Intente nuevamente o escriba a proyectos@bapegindustrial.com.';
    } finally {
      boton.disabled = false;
    }
  });
}

/* 5. Banner rotativo: cambia cada 5 s y genera los controles automáticamente. */
(function () {
  const banner = document.querySelector('.banner');
  if (!banner) return;

  const slides = banner.querySelectorAll('.banner__slide');
  if (slides.length < 2) return;

  const INTERVALO = 5000;
  let actual = 0;
  let timer = null;

  // Crear los puntos
  const contPuntos = document.createElement('div');
  contPuntos.className = 'banner__puntos';
  slides.forEach((_, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'banner__punto' + (i === 0 ? ' activo' : '');
    b.setAttribute('aria-label', 'Imagen ' + (i + 1));
    b.addEventListener('click', () => {
      mostrar(i);
      iniciar();
    });
    contPuntos.appendChild(b);
  });
  banner.appendChild(contPuntos);
  const puntos = contPuntos.querySelectorAll('.banner__punto');

  function mostrar(i) {
    slides[actual].classList.remove('activo');
    puntos[actual].classList.remove('activo');
    actual = (i + slides.length) % slides.length;
    slides[actual].classList.add('activo');
    puntos[actual].classList.add('activo');
  }

  function iniciar() {
    detener();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    timer = setInterval(() => mostrar(actual + 1), INTERVALO);
  }

  function detener() {
    clearInterval(timer);
  }

  banner.addEventListener('mouseenter', detener);
  banner.addEventListener('mouseleave', iniciar);
  banner.addEventListener('focusin', detener);
  banner.addEventListener('focusout', iniciar);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) detener();
    else iniciar();
  });

  iniciar();
})();
