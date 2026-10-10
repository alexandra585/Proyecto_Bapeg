/*
  main.js – Interacciones del sitio
  1. Navegación compartida y fecha del footer.
  2. Animación de entrada al desplazar la página.
  3. Selector de servicio del formulario.
  4. Envío del formulario.
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

  /* c) Año automático en el footer */
  document.getElementById('anio').textContent = new Date().getFullYear();

  /* d) Botón flotante para volver al inicio */
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

/* 4. Envío del formulario a Formspree, sin recargar la página.

   ===== PASOS PARA VINCULARLO A TU GMAIL (Formspree) =====
   1. Crea una cuenta gratis en https://formspree.io con tu correo de Gmail.
   2. Pulsa "New Form", ponle nombre y confirma tu correo (llega un email de verificación).
   3. Copia el endpoint, p. ej. https://formspree.io/f/xyzabcde
   4. En contacto.html reemplaza TU_ENDPOINT en el atributo action del <form> por ese código.
   5. Prueba el envío: los mensajes llegarán a tu bandeja de Gmail.
   ALTERNATIVA EmailJS: https://www.emailjs.com → crea servicio Gmail + plantilla, y usa
emailjs.sendForm(SERVICE_ID, TEMPLATE_ID, form, PUBLIC_KEY) en lugar del fetch de abajo. */
/* 4. Envía el formulario y presenta el resultado en pantalla. */
if (form) {
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const estado = document.getElementById('form-estado');
    estado.textContent = 'Enviando…';
    try {
      const respuesta = await fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' }
      });

      if (respuesta.ok) {
        estado.textContent = 'Requerimiento enviado. Responderemos en menos de 24 h.';
        form.reset();
      } else {
        throw new Error('El servicio de formularios devolvió un error.');
      }
    } catch {
      estado.textContent = 'No se pudo enviar. Revise el endpoint de Formspree o escriba a proyectos@bapegindustrial.com.';
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
