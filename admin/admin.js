/*
  admin.js – Código común del panel administrativo (se carga en todas sus páginas)
  1. Utilidades (fetch a la API, formato de fechas, avisos).
  2. Página de login.
  3. Carcasa del panel: menú lateral, usuario, cierre de sesión e indicador de conexión.
  Cada módulo tiene su propio archivo en admin/js/: dashboard.js, requerimientos.js, pedidos.js y productos.js.
*/

/* 1. Utilidades */
const API = '/api';
const ESTADOS = { nuevo: 'Nuevo', en_revision: 'En revisión', cotizado: 'Cotizado', cerrado: 'Cerrado' };
const PRIORIDADES = { normal: 'Normal', alta: 'Alta', urgente: 'Urgente' };

async function api(ruta, opciones = {}) {
  const respuesta = await fetch(API + ruta, {
    credentials: 'same-origin',
    headers: opciones.body ? { 'Content-Type': 'application/json' } : {},
    ...opciones,
    body: opciones.body ? JSON.stringify(opciones.body) : undefined
  });
  const datos = await respuesta.json().catch(() => ({}));
  if (respuesta.status === 401 && document.body.dataset.pagina && document.body.dataset.pagina !== 'login') {
    location.href = 'login.html';
    throw new Error('Sesión expirada');
  }
  if (!respuesta.ok) throw new Error(datos.mensaje || 'Error de conexión con el servidor.');
  return datos;
}

/* Escapa texto antes de insertarlo como HTML (evita XSS) */
const esc = valor => String(valor ?? '').replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const formatoFecha = new Intl.DateTimeFormat('es-PE', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Lima'
});
const fecha = iso => formatoFecha.format(new Date(iso));
const fechaISO = valor => !valor ? '' : (typeof valor === 'string' ? valor.slice(0, 10) : new Date(valor).toISOString().slice(0, 10));
const fechaCorta = iso => iso ? iso.split('-').reverse().join('/') : '';
const hoyLima = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Lima' }).format(new Date());
const codigo = id => 'RFQ-' + String(id).padStart(4, '0');

function tamano(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function aviso(mensaje, tipo = 'ok') {
  const caja = document.getElementById('avisos');
  if (!caja) return;
  const el = document.createElement('div');
  el.className = 'aviso' + (tipo === 'error' ? ' aviso--error' : '');
  el.innerHTML = `<i class="fa-solid ${tipo === 'error' ? 'fa-circle-exclamation' : 'fa-circle-check'}"></i><span>${esc(mensaje)}</span>`;
  caja.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

const insignia = estado => `<span class="estado estado--${estado}">${ESTADOS[estado] || estado}</span>`;

/* 2. Login */
const formLogin = document.getElementById('form-login');
if (formLogin) {
  const error = document.getElementById('login-error');
  const errorTexto = document.getElementById('login-error-texto');
  const boton = document.getElementById('btn-ingresar');
  const clave = document.getElementById('password');

  document.getElementById('ver-clave').addEventListener('click', ev => {
    const mostrar = clave.type === 'password';
    clave.type = mostrar ? 'text' : 'password';
    ev.currentTarget.setAttribute('aria-label', mostrar ? 'Ocultar contraseña' : 'Mostrar contraseña');
    ev.currentTarget.innerHTML = `<i class="fa-solid ${mostrar ? 'fa-eye-slash' : 'fa-eye'}" aria-hidden="true"></i>`;
  });

  formLogin.addEventListener('submit', async ev => {
    ev.preventDefault();
    error.classList.remove('visible');
    const usuario = formLogin.usuario.value.trim();
    if (!usuario || !clave.value) {
      errorTexto.textContent = 'Ingrese usuario y contraseña.';
      error.classList.add('visible');
      return;
    }
    boton.disabled = true;
    try {
      await api('/auth/login', { method: 'POST', body: { usuario, password: clave.value } });
      location.href = './';  // entra al Dashboard
    } catch (e) {
      errorTexto.textContent = e.message;
      error.classList.add('visible');
      clave.select();
    } finally {
      boton.disabled = false;
    }
  });
}

/* 3. Carcasa del panel */
const PAGINA = document.body.dataset.pagina;
const soles = n => 'S/ ' + Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function actualizarConexion(tipo, mensaje) {
  const indicador = document.getElementById('estado-conexion');
  if (!indicador) return;
  indicador.classList.remove('estado-conexion--cargando', 'estado-conexion--ok', 'estado-conexion--error');
  indicador.classList.add('estado-conexion--' + tipo);
  indicador.title = mensaje;
  indicador.querySelector('span').textContent = mensaje;
}

if (PAGINA && PAGINA !== 'login') {
  document.querySelectorAll('.menu-lateral a[data-modulo]').forEach(a => {
    if (a.dataset.modulo === PAGINA) { a.classList.add('activo'); a.setAttribute('aria-current', 'page'); }
  });
  const fechaPanel = document.getElementById('fecha-panel');
  if (fechaPanel) {
    fechaPanel.textContent = new Intl.DateTimeFormat('es-PE', {
      weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Lima'
    }).format(new Date());
  }

  api('/auth/sesion').then(({ admin }) => {
    document.getElementById('admin-nombre').textContent = admin.nombre;
    document.getElementById('admin-iniciales').textContent =
      admin.nombre.split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase();
    actualizarConexion('ok', 'Servidor conectado');
  }).catch(() => actualizarConexion('error', 'Sin conexión'));

  document.getElementById('btn-salir').addEventListener('click', async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => { });
    location.href = 'login.html';
  });

  // Insignias del menú: pedidos por atender y requerimientos nuevos
  Promise.all([api('/admin/pedidos/resumen'), api('/admin/estadisticas'), api('/admin/productos/resumen')]).then(([p, r, pr]) => {
    const pon = (id, n) => { const el = document.getElementById(id); if (el) { el.textContent = n; el.hidden = !n; } };
    pon('menu-badge-pedidos', p.porAtender);
    pon('menu-badge-requerimientos', r.porEstado?.nuevo || 0);
    pon('menu-badge-productos', pr.bajos + pr.agotados);
  }).catch(() => { });

  // Cierra cualquier modal con los botones [data-cerrar] o al hacer clic fuera
  document.querySelectorAll('[data-cerrar]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
  document.querySelectorAll('dialog.modal').forEach(d => d.addEventListener('click', ev => { if (ev.target === d) d.close(); }));
}
