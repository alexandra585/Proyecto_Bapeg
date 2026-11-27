/*
  requerimientos.js – Módulo "Requerimientos" del panel (admin/requerimientos.html)
  Tarjetas por estado, filtros, tabla paginada y modal de gestión (estado, prioridad, seguimiento, notas).
*/
if (PAGINA === 'requerimientos') {
  const estadoPanel = { pagina: 1, porPagina: 10, actualId: null };
  const filtros = document.getElementById('filtros');
  const cuerpo = document.getElementById('tabla-cuerpo');
  const tarjetasResumen = document.querySelector('.stats');

  /* b) Parámetros de filtro → query string */
  function parametros(extra = {}) {
    const p = new URLSearchParams();
    new FormData(filtros).forEach((v, k) => { if (String(v).trim()) p.set(k, String(v).trim()); });
    Object.entries(extra).forEach(([k, v]) => p.set(k, v));
    return p;
  }

  /* c) Tarjetas por estado (los gráficos están en el Dashboard) */
  async function cargarEstadisticas() {
    tarjetasResumen.setAttribute('aria-busy', 'true');
    try {
      const s = await api('/admin/estadisticas');
      document.getElementById('st-total').textContent = s.total;
      document.getElementById('st-semana').textContent = s.semana;
      Object.entries(s.porEstado).forEach(([k, v]) => {
        document.getElementById('st-' + k).textContent = v;
      });
      document.getElementById('ultima-actualizacion').textContent = new Intl.DateTimeFormat('es-PE', {
        hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima'
      }).format(new Date());
    } catch (e) {
      aviso('No se pudieron cargar las cifras: ' + e.message, 'error');
    } finally {
      tarjetasResumen.removeAttribute('aria-busy');
    }
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
      <tr data-id="${f.id}" data-tiene-adjunto="${f.archivo_nombre ? 'true' : 'false'}">
        <td class="col-id">${codigo(f.id)}</td>
        <td class="col-fecha" data-label="FECHA">${fecha(f.creado_en)}</td>
        <td class="cliente"><strong>${esc(f.nombre)}</strong><span>${esc(f.empresa)}</span></td>
        <td data-label="SERVICIO">${esc(f.servicio)}</td>
        <td data-label="PLAZO" class="celda-seguimiento">
          <span class="plazo-texto ${f.plazo === 'Inmediato' ? 'plazo-urgente' : ''}">${esc(f.plazo)}</span>
          <span class="prioridad-chip prioridad-chip--${PRIORIDADES[f.prioridad] ? f.prioridad : 'normal'}">${PRIORIDADES[f.prioridad] || 'Normal'}</span>
          ${f.seguimiento_en ? `<small class="seguimiento-chip ${fechaISO(f.seguimiento_en) < hoyLima() && f.estado !== 'cerrado' ? 'seguimiento-chip--atrasado' : ''}">${fechaISO(f.seguimiento_en) < hoyLima() && f.estado !== 'cerrado' ? 'Atrasado' : 'Seguimiento'} · ${fechaCorta(fechaISO(f.seguimiento_en))}</small>` : ''}
        </td>
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


  async function abrirDetalle(id) {
    try {
      const { dato: d } = await api('/admin/requerimientos/' + id);
      estadoPanel.actualId = d.id;
      document.getElementById('detalle-codigo').textContent = `${codigo(d.id)} · ${fecha(d.creado_en)}`;
      document.getElementById('detalle-titulo').textContent = d.empresa;

      const opciones = Object.entries(ESTADOS)
        .map(([v, t]) => `<option value="${v}" ${v === d.estado ? 'selected' : ''}>${t}</option>`).join('');
      const opcionesPrioridad = Object.entries(PRIORIDADES)
        .map(([v, t]) => `<option value="${v}" ${v === d.prioridad ? 'selected' : ''}>${t}</option>`).join('');

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
            <label for="detalle-prioridad">PRIORIDAD</label>
            <select class="select" id="detalle-prioridad">${opcionesPrioridad}</select>
          </div>
          <div class="campo">
            <label for="detalle-seguimiento">PRÓXIMO SEGUIMIENTO</label>
            <input class="input" id="detalle-seguimiento" type="date" value="${fechaISO(d.seguimiento_en)}">
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
          prioridad: document.getElementById('detalle-prioridad').value,
          seguimiento_en: document.getElementById('detalle-seguimiento').value,
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
