/*
  admin.js – Lógica del panel administrativo
  1. Utilidades (fetch a la API, formato de fechas, avisos).
  2. Página de login.
  3. Panel: estadísticas, filtros, tabla y paginación.
  4. Modal de detalle: cambiar estado, notas, descargar adjunto, eliminar.
*/

/* 1. Utilidades */
const API = '/api';
const ESTADOS = { nuevo: 'Nuevo', en_revision: 'En revisión', cotizado: 'Cotizado', cerrado: 'Cerrado' };

async function api(ruta, opciones = {}) {
  const respuesta = await fetch(API + ruta, {
    credentials: 'same-origin',
    headers: opciones.body ? { 'Content-Type': 'application/json' } : {},
    ...opciones,
    body: opciones.body ? JSON.stringify(opciones.body) : undefined
  });
  const datos = await respuesta.json().catch(() => ({}));
  if (respuesta.status === 401 && document.body.dataset.pagina === 'panel') {
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
      location.href = './';
    } catch (e) {
      errorTexto.textContent = e.message;
      error.classList.add('visible');
      clave.select();
    } finally {
      boton.disabled = false;
    }
  });
}

/* 3. Panel */
if (document.body.dataset.pagina === 'panel') {
  const estadoPanel = { pagina: 1, porPagina: 10, actualId: null };
  const filtros = document.getElementById('filtros');
  const cuerpo = document.getElementById('tabla-cuerpo');

  /* a) Datos del administrador */
  api('/auth/sesion').then(({ admin }) => {
    document.getElementById('admin-nombre').textContent = admin.nombre;
    document.getElementById('admin-iniciales').textContent =
      admin.nombre.split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase();
  }).catch(() => {});

  document.getElementById('btn-salir').addEventListener('click', async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    location.href = 'login.html';
  });

  /* b) Parámetros de filtro → query string */
  function parametros(extra = {}) {
    const p = new URLSearchParams();
    new FormData(filtros).forEach((v, k) => { if (String(v).trim()) p.set(k, String(v).trim()); });
    Object.entries(extra).forEach(([k, v]) => p.set(k, v));
    return p;
  }

  /* c) Estadísticas */
  async function cargarEstadisticas() {
    try {
      const s = await api('/admin/estadisticas');
      document.getElementById('st-total').textContent = s.total;
      document.getElementById('st-semana').textContent = s.semana;
      Object.entries(s.porEstado).forEach(([k, v]) => {
        document.getElementById('st-' + k).textContent = v;
      });
    } catch (e) { /* se muestra en la tabla */ }
  }

  function marcarStat() {
    const actual = filtros.estado.value;
    document.querySelectorAll('.stat[data-estado]').forEach(b => {
      b.setAttribute('aria-pressed', String(b.dataset.estado === actual));
    });
  }

  /* d) Tabla */
  async function cargarTabla() {
    try {
      const r = await api('/admin/requerimientos?' + parametros({
        pagina: estadoPanel.pagina, por_pagina: estadoPanel.porPagina
      }));
      pintarTabla(r.datos);
      pintarPaginacion(r.paginacion);
    } catch (e) {
      cuerpo.innerHTML = `<tr><td colspan="8"><div class="vacio"><i class="fa-solid fa-plug-circle-xmark"></i>${esc(e.message)}</div></td></tr>`;
    }
  }

  function pintarTabla(filas) {
    if (!filas.length) {
      cuerpo.innerHTML = `<tr><td colspan="8"><div class="vacio"><i class="fa-regular fa-folder-open"></i>
        No hay requerimientos que coincidan con los filtros.</div></td></tr>`;
      return;
    }
    cuerpo.innerHTML = filas.map(f => `
      <tr data-id="${f.id}">
        <td class="col-id">${codigo(f.id)}</td>
        <td class="col-fecha" data-label="FECHA">${fecha(f.creado_en)}</td>
        <td class="cliente"><strong>${esc(f.nombre)}</strong><span>${esc(f.empresa)}</span></td>
        <td data-label="SERVICIO">${esc(f.servicio)}</td>
        <td data-label="PLAZO" class="${f.plazo === 'Inmediato' ? 'plazo-urgente' : ''}">${esc(f.plazo)}</td>
        <td data-label="ESTADO">${insignia(f.estado)}</td>
        <td data-label="ADJUNTO">${f.archivo_nombre
          ? `<i class="fa-solid fa-paperclip adjunto-icono" title="${esc(f.archivo_nombre)}"></i>`
          : '<span class="sin-dato">—</span>'}</td>
        <td class="col-acciones">
          <button class="btn btn--icono" type="button" data-accion="ver" title="Ver detalle" aria-label="Ver detalle de ${codigo(f.id)}">
            <i class="fa-solid fa-eye" aria-hidden="true"></i></button>
          <button class="btn btn--icono btn--peligro" type="button" data-accion="eliminar" title="Eliminar" aria-label="Eliminar ${codigo(f.id)}">
            <i class="fa-solid fa-trash" aria-hidden="true"></i></button>
        </td>
      </tr>`).join('');
  }

  function pintarPaginacion(p) {
    const desde = p.total ? (p.pagina - 1) * p.porPagina + 1 : 0;
    const hasta = Math.min(p.pagina * p.porPagina, p.total);
    document.getElementById('pag-info').textContent = `Mostrando ${desde}–${hasta} de ${p.total} requerimientos`;
    document.getElementById('pag-actual').textContent = `${p.pagina} / ${p.paginas}`;
    document.getElementById('pag-anterior').disabled = p.pagina <= 1;
    document.getElementById('pag-siguiente').disabled = p.pagina >= p.paginas;
  }

  const recargar = () => Promise.all([cargarEstadisticas(), cargarTabla()]);

  /* e) Eventos de filtros, estadísticas y paginación */
  let espera;
  filtros.addEventListener('input', ev => {
    clearTimeout(espera);
    espera = setTimeout(() => {
      estadoPanel.pagina = 1;
      marcarStat();
      cargarTabla();
    }, ev.target.type === 'search' ? 300 : 0);
  });
  filtros.addEventListener('submit', ev => ev.preventDefault());
  filtros.addEventListener('reset', () => setTimeout(() => {
    estadoPanel.pagina = 1;
    marcarStat();
    cargarTabla();
  }));

  document.querySelectorAll('.stat[data-estado]').forEach(b => b.addEventListener('click', () => {
    filtros.estado.value = b.dataset.estado;
    estadoPanel.pagina = 1;
    marcarStat();
    cargarTabla();
  }));

  document.getElementById('pag-anterior').addEventListener('click', () => { estadoPanel.pagina--; cargarTabla(); });
  document.getElementById('pag-siguiente').addEventListener('click', () => { estadoPanel.pagina++; cargarTabla(); });

  document.getElementById('btn-exportar').addEventListener('click', () => {
    location.href = API + '/admin/requerimientos/exportar.csv?' + parametros();
  });

  /* f) Clic en la tabla: ver o eliminar */
  cuerpo.addEventListener('click', ev => {
    const fila = ev.target.closest('tr[data-id]');
    if (!fila) return;
    const accion = ev.target.closest('[data-accion]')?.dataset.accion;
    if (accion === 'eliminar') confirmarEliminar(fila.dataset.id);
    else abrirDetalle(fila.dataset.id);
  });

  /* 4. Modal de detalle */
  const modal = document.getElementById('modal-detalle');
  const modalCuerpo = document.getElementById('detalle-cuerpo');
  const modalConfirmar = document.getElementById('modal-confirmar');

  document.querySelectorAll('[data-cerrar]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
  [modal, modalConfirmar].forEach(d => d.addEventListener('click', ev => { if (ev.target === d) d.close(); }));

  async function abrirDetalle(id) {
    try {
      const { dato: d } = await api('/admin/requerimientos/' + id);
      estadoPanel.actualId = d.id;
      document.getElementById('detalle-codigo').textContent = `${codigo(d.id)} · ${fecha(d.creado_en)}`;
      document.getElementById('detalle-titulo').textContent = d.empresa;

      const opciones = Object.entries(ESTADOS)
        .map(([v, t]) => `<option value="${v}" ${v === d.estado ? 'selected' : ''}>${t}</option>`).join('');

      modalCuerpo.innerHTML = `
        <div class="datos">
          <div><div class="dato__label">Contacto</div><div class="dato__valor">${esc(d.nombre)}</div></div>
          <div><div class="dato__label">RUC</div><div class="dato__valor">${esc(d.ruc) || '<span class="sin-dato">No indicado</span>'}</div></div>
          <div><div class="dato__label">Correo</div><div class="dato__valor"><a href="mailto:${esc(d.correo)}">${esc(d.correo)}</a></div></div>
          <div><div class="dato__label">Teléfono / WhatsApp</div><div class="dato__valor">
            <a href="https://wa.me/${esc(d.telefono.replace(/\D/g, ''))}" target="_blank" rel="noopener">${esc(d.telefono)}</a></div></div>
          <div><div class="dato__label">Servicio</div><div class="dato__valor">${esc(d.servicio)}</div></div>
          <div><div class="dato__label">Plazo</div><div class="dato__valor">${esc(d.plazo)}</div></div>
        </div>
        <div>
          <div class="dato__label">Detalles del proyecto</div>
          <div class="detalle-texto">${esc(d.detalle)}</div>
        </div>
        ${d.archivo_nombre ? `
        <div>
          <div class="dato__label">Archivo adjunto</div>
          <div class="archivo">
            <i class="fa-solid fa-file-arrow-down" aria-hidden="true"></i>
            <div><strong>${esc(d.archivo_nombre)}</strong><span>${tamano(d.archivo_tamano)}</span></div>
            <a class="btn btn--borde" href="${API}/admin/requerimientos/${d.id}/archivo">DESCARGAR</a>
          </div>
        </div>` : ''}
        <div class="gestion">
          <div class="campo">
            <label for="detalle-estado">ESTADO</label>
            <select class="select" id="detalle-estado">${opciones}</select>
          </div>
          <div class="campo">
            <label for="detalle-notas">NOTAS INTERNAS</label>
            <textarea class="textarea" id="detalle-notas" maxlength="5000"
              placeholder="Seguimiento, monto cotizado, ingeniero asignado…">${esc(d.notas)}</textarea>
          </div>
        </div>`;
      modal.showModal();
    } catch (e) {
      aviso(e.message, 'error');
    }
  }

  document.getElementById('detalle-guardar').addEventListener('click', async ev => {
    const boton = ev.currentTarget;
    boton.disabled = true;
    try {
      await api('/admin/requerimientos/' + estadoPanel.actualId, {
        method: 'PATCH',
        body: {
          estado: document.getElementById('detalle-estado').value,
          notas: document.getElementById('detalle-notas').value
        }
      });
      modal.close();
      aviso(`${codigo(estadoPanel.actualId)} actualizado.`);
      recargar();
    } catch (e) {
      aviso(e.message, 'error');
    } finally {
      boton.disabled = false;
    }
  });

  document.getElementById('detalle-eliminar').addEventListener('click', () => confirmarEliminar(estadoPanel.actualId));

  function confirmarEliminar(id) {
    estadoPanel.actualId = Number(id);
    document.getElementById('confirmar-texto').textContent =
      `Se eliminará ${codigo(id)} y su archivo adjunto. Esta acción no se puede deshacer.`;
    modalConfirmar.showModal();
  }

  document.getElementById('confirmar-si').addEventListener('click', async ev => {
    const boton = ev.currentTarget;
    boton.disabled = true;
    try {
      await api('/admin/requerimientos/' + estadoPanel.actualId, { method: 'DELETE' });
      modalConfirmar.close();
      if (modal.open) modal.close();
      aviso(`${codigo(estadoPanel.actualId)} eliminado.`);
      recargar();
    } catch (e) {
      aviso(e.message, 'error');
    } finally {
      boton.disabled = false;
    }
  });

  recargar();
}
