/*
  pedidos.js – Módulo "Pedidos tienda" (admin/pedidos.html)
  1. Bandejas de trabajo (por atender, en camino…), filtros y tabla paginada.
  2. Modal del pedido: cliente, entrega, productos, pagos, historial.
  3. Gestión: avanzar al siguiente estado (con courier y guía al despachar), cancelar y notas internas.
*/
if (PAGINA === 'pedidos') {
  const estado = { pagina: 1, porPagina: 10, actual: null };
  const filtros = document.getElementById('filtros');
  const cuerpo = document.getElementById('tabla-pedidos');
  const modal = document.getElementById('modal-pedido');
  const modalCuerpo = document.getElementById('pedido-cuerpo');

  const ICONO = {
    pendiente_pago: 'fa-hourglass-half', pago_rechazado: 'fa-circle-xmark', pagado: 'fa-credit-card',
    en_preparacion: 'fa-box-open', listo_recojo: 'fa-store', despachado: 'fa-truck-ramp-box',
    en_reparto: 'fa-truck-fast', entregado: 'fa-house-circle-check', cancelado: 'fa-ban'
  };
  // Texto del botón para cada paso siguiente
  const ACCION = {
    en_preparacion: 'Iniciar preparación', despachado: 'Despachar al courier', en_reparto: 'Marcar en reparto',
    listo_recojo: 'Listo para recoger', entregado: 'Confirmar entrega', cancelado: 'Cancelar pedido'
  };
  const chip = (e, etiqueta) => `<span class="pedido-chip pedido-chip--${e}"><i class="fa-solid ${ICONO[e]}" aria-hidden="true"></i> ${esc(etiqueta)}</span>`;

  function parametros(extra = {}) {
    const p = new URLSearchParams();
    new FormData(filtros).forEach((v, k) => { if (String(v).trim()) p.set(k, String(v).trim()); });
    Object.entries(extra).forEach(([k, v]) => p.set(k, v));
    return p;
  }

  /* 1. Bandejas y tabla */
  async function cargarResumen() {
    const r = await api('/admin/pedidos/resumen');
    document.getElementById('b-total').textContent = r.total;
    document.getElementById('b-atender').textContent = r.porAtender;
    document.getElementById('b-camino').textContent = r.enCamino;
    document.getElementById('b-entregados').textContent = r.entregados;
    document.getElementById('b-sinpago').textContent = r.pendientesPago;
    document.getElementById('b-cancelados').textContent = r.cancelados;
    const badge = document.getElementById('menu-badge-pedidos');
    badge.textContent = r.porAtender; badge.hidden = !r.porAtender;
  }

  async function cargarTabla() {
    try {
      const r = await api('/admin/pedidos?' + parametros({ pagina: estado.pagina, por_pagina: estado.porPagina }));
      if (!r.datos.length) {
        cuerpo.innerHTML = '<tr><td colspan="7"><div class="vacio"><i class="fa-regular fa-folder-open"></i>No hay pedidos en esta bandeja.</div></td></tr>';
      } else {
        cuerpo.innerHTML = r.datos.map(p => {
          const urgente = ['pagado', 'en_preparacion'].includes(p.estado);
          return `<tr data-id="${p.id}">
            <td class="col-id"><strong class="pedido-codigo">${esc(p.codigo)}</strong></td>
            <td class="col-fecha" data-label="FECHA">${fecha(p.creado_en)}</td>
            <td class="cliente"><strong>${esc(p.nombre)}</strong><span>${esc(p.correo)}</span></td>
            <td data-label="ENTREGA">${p.tipo_entrega === 'recojo'
              ? '<span class="entrega-tag"><i class="fa-solid fa-warehouse" aria-hidden="true"></i> Recojo</span>'
              : `<span class="entrega-tag"><i class="fa-solid fa-truck" aria-hidden="true"></i> ${esc(p.distrito)}, ${esc(p.departamento)}</span>`}
              ${p.numero_guia ? `<small class="guia-tag">${esc(p.courier)} · ${esc(p.numero_guia)}</small>` : ''}</td>
            <td data-label="TOTAL"><strong>${soles(p.total)}</strong><small class="sin-dato"> · ${p.unidades} und.</small></td>
            <td data-label="ESTADO">${chip(p.estado, p.etiqueta)}</td>
            <td class="col-acciones"><button class="btn ${urgente ? 'btn--primario' : 'btn--borde'} btn--chico" type="button">
              ${urgente ? 'ATENDER' : 'VER'}</button></td>
          </tr>`;
        }).join('');
      }
      const p = r.paginacion;
      const desde = p.total ? (p.pagina - 1) * p.porPagina + 1 : 0;
      document.getElementById('pag-info').textContent = `Mostrando ${desde}–${Math.min(p.pagina * p.porPagina, p.total)} de ${p.total} pedidos`;
      document.getElementById('pag-actual').textContent = `${p.pagina} / ${p.paginas}`;
      document.getElementById('pag-anterior').disabled = p.pagina <= 1;
      document.getElementById('pag-siguiente').disabled = p.pagina >= p.paginas;
    } catch (e) {
      cuerpo.innerHTML = `<tr><td colspan="7"><div class="vacio"><i class="fa-solid fa-plug-circle-xmark"></i>${esc(e.message)}</div></td></tr>`;
    }
  }

  const recargar = () => Promise.all([cargarResumen().catch(() => {}), cargarTabla()]);

  function elegirBandeja(valor) {
    document.getElementById('f-estado').value = valor;
    document.querySelectorAll('.bandeja').forEach(b => {
      const activa = b.dataset.estado === valor;
      b.classList.toggle('activo', activa);
      b.setAttribute('aria-selected', String(activa));
    });
    estado.pagina = 1;
    cargarTabla();
  }
  document.querySelectorAll('.bandeja').forEach(b => b.addEventListener('click', () => elegirBandeja(b.dataset.estado)));

  let espera;
  filtros.addEventListener('input', ev => {
    clearTimeout(espera);
    espera = setTimeout(() => { estado.pagina = 1; cargarTabla(); }, ev.target.type === 'search' ? 300 : 0);
  });
  filtros.addEventListener('submit', ev => ev.preventDefault());
  filtros.addEventListener('reset', () => setTimeout(() => elegirBandeja('')));
  document.getElementById('pag-anterior').addEventListener('click', () => { estado.pagina--; cargarTabla(); });
  document.getElementById('pag-siguiente').addEventListener('click', () => { estado.pagina++; cargarTabla(); });
  document.getElementById('btn-recargar').addEventListener('click', () => { recargar(); aviso('Pedidos actualizados.'); });
  document.getElementById('btn-exportar').addEventListener('click', () => {
    location.href = API + '/admin/pedidos/exportar.csv?' + parametros();
  });
  cuerpo.addEventListener('click', ev => {
    const fila = ev.target.closest('tr[data-id]');
    if (fila) abrir(fila.dataset.id);
  });

  /* 2. Modal del pedido */
  async function abrir(id) {
    try {
      const { dato: p } = await api('/admin/pedidos/' + id);
      estado.actual = p;
      pintarModal(p);
      if (!modal.open) modal.showModal();
    } catch (e) { aviso(e.message, 'error'); }
  }

  function pintarModal(p) {
    document.getElementById('pedido-codigo').textContent = `${p.codigo} · ${fecha(p.creado_en)}`;
    document.getElementById('pedido-titulo').textContent = p.nombre;
    const indice = p.ruta.findIndex(r => r.estado === p.estado);
    const doc = p.comprobante === 'factura' ? `Factura · RUC ${esc(p.documento)}` : `Boleta · DNI ${esc(p.documento)}`;
    const wa = p.telefono.replace(/\D/g, '').replace(/^(?!51)(9\d{8})$/, '51$1');

    const acciones = p.siguientes.filter(s => s.estado !== 'cancelado');
    const puedeCancelar = p.siguientes.some(s => s.estado === 'cancelado');

    modalCuerpo.innerHTML = `
      <div class="pedido-resumen">
        ${chip(p.estado, p.etiqueta)}
        <span class="pedido-resumen__total">${soles(p.total)}</span>
      </div>
      ${indice >= 0 || ['pendiente_pago', 'pago_rechazado'].includes(p.estado) ? `
      <ol class="mini-etapas">${p.ruta.map((r, i) => `<li class="${i < indice ? 'hecha' : ''} ${i === indice ? 'actual' : ''}">
        <span><i class="fa-solid ${i < indice ? 'fa-check' : ICONO[r.estado]}" aria-hidden="true"></i></span>${esc(r.etiqueta)}</li>`).join('')}</ol>` : ''}

      ${acciones.length || puedeCancelar ? `
      <section class="gestion-pedido" aria-label="Siguiente paso">
        <h3><i class="fa-solid fa-forward-step" aria-hidden="true"></i> Siguiente paso</h3>
        <div class="gestion-pedido__acciones">
          ${acciones.map(s => `<button class="btn btn--primario" type="button" data-siguiente="${s.estado}">
            <i class="fa-solid ${ICONO[s.estado]}" aria-hidden="true"></i> ${ACCION[s.estado] || s.etiqueta}</button>`).join('')}
          ${puedeCancelar ? '<button class="btn btn--peligro" type="button" data-siguiente="cancelado"><i class="fa-solid fa-ban" aria-hidden="true"></i> Cancelar pedido</button>' : ''}
        </div>
        <form class="gestion-pedido__form" id="form-estado" hidden>
          <p class="gestion-pedido__titulo" id="form-estado-titulo"></p>
          <div class="campos-despacho" id="campos-despacho" hidden>
            <div class="campo"><label for="g-courier">COURIER</label>
              <select class="select" id="g-courier">${p.couriers.map(c => `<option>${esc(c)}</option>`).join('')}</select></div>
            <div class="campo"><label for="g-guia">N.° DE GUÍA</label>
              <input class="input" id="g-guia" maxlength="60" placeholder="Ej. 4501-889120"></div>
          </div>
          <div class="campo"><label for="g-comentario">COMENTARIO <small>(opcional)</small></label>
            <input class="input" id="g-comentario" maxlength="300" placeholder="Ej. Se entregó a recepción, firmó Juan Pérez"></div>
          <div class="gestion-pedido__opciones">
            <label><input type="checkbox" id="g-notificar" checked> Avisar al cliente por correo</label>
            <label><input type="checkbox" id="g-visible" checked> Mostrar en su seguimiento</label>
          </div>
          <div class="gestion-pedido__botones">
            <button class="btn btn--borde" type="button" id="g-cancelar">VOLVER</button>
            <button class="btn btn--primario" type="submit" id="g-confirmar">CONFIRMAR</button>
          </div>
        </form>
      </section>` : `<p class="gestion-pedido__fin"><i class="fa-solid ${p.estado === 'entregado' ? 'fa-circle-check' : 'fa-circle-info'}" aria-hidden="true"></i>
        ${p.estado === 'entregado' ? 'Pedido completado.' : p.estado === 'cancelado' ? 'Pedido cancelado. No admite más cambios.' : 'Sin acciones disponibles.'}</p>`}

      <div class="pedido-columnas">
        <section class="pedido-bloque">
          <h3>Cliente</h3>
          <dl class="lista-datos">
            <div><dt>Correo</dt><dd><a href="mailto:${esc(p.correo)}">${esc(p.correo)}</a></dd></div>
            <div><dt>Celular</dt><dd><a href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener">${esc(p.telefono)}</a></dd></div>
            <div><dt>Comprobante</dt><dd>${doc}</dd></div>
            ${p.razon_social ? `<div><dt>Razón social</dt><dd>${esc(p.razon_social)}</dd></div>` : ''}
          </dl>
        </section>
        <section class="pedido-bloque">
          <h3>Entrega</h3>
          <dl class="lista-datos">
            ${p.tipo_entrega === 'recojo'
              ? '<div><dt>Tipo</dt><dd>Recojo en almacén (Carabayllo)</dd></div>'
              : `<div><dt>Dirección</dt><dd>${esc(p.direccion)}</dd></div>
                 <div><dt>Distrito</dt><dd>${esc(p.distrito)}, ${esc(p.departamento)}</dd></div>
                 ${p.referencia ? `<div><dt>Referencia</dt><dd>${esc(p.referencia)}</dd></div>` : ''}`}
            ${p.numero_guia ? `<div><dt>Courier</dt><dd>${esc(p.courier)} · <strong class="pedido-codigo">${esc(p.numero_guia)}</strong></dd></div>` : ''}
          </dl>
        </section>
      </div>

      <section class="pedido-bloque">
        <h3>Productos</h3>
        <table class="tabla tabla--compacta">
          <thead><tr><th>Producto</th><th>Cant.</th><th>P. unit.</th><th>Subtotal</th></tr></thead>
          <tbody>${p.items.map(i => `<tr><td>${esc(i.nombre)}</td><td>${i.cantidad}</td><td>${soles(i.precio_unitario)}</td><td>${soles(i.subtotal)}</td></tr>`).join('')}</tbody>
          <tfoot>
            <tr><td colspan="3">Envío</td><td>${Number(p.costo_envio) ? soles(p.costo_envio) : 'Gratis'}</td></tr>
            <tr class="fila-total"><td colspan="3">Total</td><td>${soles(p.total)}</td></tr>
          </tfoot>
        </table>
      </section>

      <div class="pedido-columnas">
        <section class="pedido-bloque">
          <h3>Pagos</h3>
          ${p.pagos.length ? `<ul class="lista-pagos">${p.pagos.map(g => `
            <li class="pago-${g.estado}"><i class="fa-solid ${g.estado === 'aprobado' ? 'fa-circle-check' : g.estado === 'rechazado' ? 'fa-circle-xmark' : 'fa-clock'}" aria-hidden="true"></i>
              <div><strong>${g.estado === 'aprobado' ? 'Aprobado' : g.estado === 'rechazado' ? 'Rechazado' : 'Pendiente'} · ${soles(g.monto)}</strong>
              <small>${g.proveedor === 'demo' ? 'Simulación' : 'Mercado Pago'} ${g.referencia ? '#' + esc(g.referencia) : ''} · ${esc((g.metodo || '').toUpperCase())} ${g.ultimos4 ? '•••• ' + esc(g.ultimos4) : ''}</small>
              <small>${esc(g.mensaje)} · ${fecha(g.creado_en)}</small></div></li>`).join('')}</ul>`
            : '<p class="sin-dato">Aún no hay intentos de pago.</p>'}
        </section>
        <section class="pedido-bloque">
          <h3>Historial</h3>
          <ol class="linea-tiempo">${[...p.historial].reverse().map(h => `
            <li><strong>${esc(h.etiqueta)}</strong>${h.visible_cliente ? '' : ' <span class="interno">interno</span>'}
              ${h.comentario ? `<p>${esc(h.comentario)}</p>` : ''}
              <small>${fecha(h.creado_en)} · ${esc(h.autor)}</small></li>`).join('')}</ol>
        </section>
      </div>

      <section class="pedido-bloque">
        <h3>Notas internas</h3>
        <textarea class="textarea" id="g-notas" maxlength="5000" placeholder="Solo visible para el equipo: observaciones, coordinación con almacén…">${esc(p.notas_internas || '')}</textarea>
        <button class="btn btn--borde btn--chico" type="button" id="g-guardar-notas"><i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> GUARDAR NOTAS</button>
      </section>`;
  }

  /* 3. Gestión */
  modalCuerpo.addEventListener('click', ev => {
    const boton = ev.target.closest('[data-siguiente]');
    if (boton) {
      const destino = boton.dataset.siguiente;
      const form = document.getElementById('form-estado');
      form.dataset.destino = destino;
      form.hidden = false;
      document.querySelector('.gestion-pedido__acciones').hidden = true;
      document.getElementById('campos-despacho').hidden = destino !== 'despachado';
      document.getElementById('form-estado-titulo').innerHTML = destino === 'cancelado'
        ? '<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Se cancelará el pedido. Si ya estaba pagado, se devuelve el stock y se registra el reembolso.'
        : `Cambiar a <strong>${esc(boton.textContent.trim())}</strong>`;
      document.getElementById('g-confirmar').className = destino === 'cancelado' ? 'btn btn--peligro-solido' : 'btn btn--primario';
      (destino === 'despachado' ? document.getElementById('g-guia') : document.getElementById('g-comentario')).focus();
    }
    if (ev.target.closest('#g-cancelar')) {
      document.getElementById('form-estado').hidden = true;
      document.querySelector('.gestion-pedido__acciones').hidden = false;
    }
    if (ev.target.closest('#g-guardar-notas')) guardarNotas();
  });

  modalCuerpo.addEventListener('submit', async ev => {
    if (ev.target.id !== 'form-estado') return;
    ev.preventDefault();
    const destino = ev.target.dataset.destino;
    const boton = document.getElementById('g-confirmar');
    boton.disabled = true;
    try {
      const r = await api(`/admin/pedidos/${estado.actual.id}/estado`, {
        method: 'POST',
        body: {
          estado: destino,
          comentario: document.getElementById('g-comentario').value,
          courier: document.getElementById('g-courier')?.value,
          guia: document.getElementById('g-guia')?.value,
          notificar: document.getElementById('g-notificar').checked,
          visible: document.getElementById('g-visible').checked
        }
      });
      aviso(r.mensaje);
      await abrir(estado.actual.id);
      recargar();
    } catch (e) {
      aviso(e.message, 'error');
      boton.disabled = false;
    }
  });

  async function guardarNotas() {
    try {
      const r = await api(`/admin/pedidos/${estado.actual.id}`, { method: 'PATCH', body: { notas_internas: document.getElementById('g-notas').value } });
      aviso(r.mensaje);
    } catch (e) { aviso(e.message, 'error'); }
  }

  // Bandeja inicial desde la URL (p. ej. el Dashboard enlaza a ?estado=por_atender)
  const inicial = new URLSearchParams(location.search).get('estado') || '';
  cargarResumen().catch(() => {});
  elegirBandeja(document.querySelector(`.bandeja[data-estado="${inicial}"]`) ? inicial : '');
}
