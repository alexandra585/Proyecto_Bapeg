/*
  seguimiento.js – Consulta pública del estado de un pedido (seguimiento.html)
  Muestra una barra de etapas, el historial con fechas y el detalle de la compra.
*/
(function () {
  const form = document.getElementById('form-rastreo');
  if (!form) return;
  const { apiTienda, soles, fecha, esc } = window.BapegTienda;
  const estado = document.getElementById('rastreo-estado');

  const ICONOS = {
    pendiente_pago: 'fa-hourglass-half', pago_rechazado: 'fa-circle-xmark', pagado: 'fa-credit-card',
    en_preparacion: 'fa-box-open', listo_recojo: 'fa-store', despachado: 'fa-truck-ramp-box',
    en_reparto: 'fa-truck-fast', entregado: 'fa-house-circle-check', cancelado: 'fa-ban'
  };

  function pintar(p) {
    const indice = p.pasos.findIndex(s => s.estado === p.estado);
    const fuera = indice === -1; // pendiente, rechazado o cancelado
    const tono = p.estado === 'cancelado' || p.estado === 'pago_rechazado' ? 'alerta'
      : p.estado === 'entregado' ? 'ok' : fuera ? 'espera' : 'activo';

    document.getElementById('pedido-estado').innerHTML = `
      <div class="pedido-estado__cabecera pedido-estado__cabecera--${tono}">
        <span class="pedido-estado__icono"><i class="fa-solid ${ICONOS[p.estado]}" aria-hidden="true"></i></span>
        <div>
          <p class="etiqueta">PEDIDO ${esc(p.codigo)} · ${fecha(p.creado_en)}</p>
          <h2>${esc(p.etiqueta)}</h2>
          <p>${esc(p.descripcion)}</p>
        </div>
      </div>
      ${fuera ? '' : `<ol class="etapas" aria-label="Etapas del pedido">
        ${p.pasos.map((s, i) => `<li class="etapa ${i < indice ? 'etapa--hecha' : ''} ${i === indice ? 'etapa--actual' : ''}">
          <span class="etapa__punto"><i class="fa-solid ${i < indice ? 'fa-check' : ICONOS[s.estado]}" aria-hidden="true"></i></span>
          <span class="etapa__texto">${esc(s.etiqueta)}</span></li>`).join('')}
      </ol>`}
      ${p.numero_guia ? `<div class="guia">
        <i class="fa-solid fa-barcode" aria-hidden="true"></i>
        <div><span>Courier</span><strong>${esc(p.courier)}</strong></div>
        <div><span>N.° de guía</span><strong class="guia__numero">${esc(p.numero_guia)}</strong></div>
      </div>` : ''}`;

    document.getElementById('historial').innerHTML = [...p.historial].reverse().map((h, i) => `
      <li class="historial__item ${i === 0 ? 'historial__item--ultimo' : ''}">
        <span class="historial__punto"><i class="fa-solid ${ICONOS[h.estado] || 'fa-circle'}" aria-hidden="true"></i></span>
        <div><strong>${esc(h.etiqueta)}</strong>
          ${h.comentario ? `<p>${esc(h.comentario)}</p>` : ''}
          <time>${fecha(h.fecha)}</time></div>
      </li>`).join('');

    document.getElementById('detalle-pedido').innerHTML = `
      <dl class="detalle-lista">
        <div><dt>Cliente</dt><dd>${esc(p.nombre)}</dd></div>
        <div><dt>${p.tipo_entrega === 'recojo' ? 'Recojo en' : 'Destino'}</dt><dd>${esc(p.destino)}</dd></div>
        ${p.metodo_pago ? `<div><dt>Pago</dt><dd>${esc(p.metodo_pago)}</dd></div>` : ''}
      </dl>
      <ul class="detalle-items">${p.items.map(i => `<li><span>${esc(i.nombre)} <small>× ${i.cantidad}</small></span><strong>${soles(i.subtotal)}</strong></li>`).join('')}</ul>
      <dl class="resumen__totales">
        <div><dt>Subtotal</dt><dd>${soles(p.subtotal)}</dd></div>
        <div><dt>Envío</dt><dd>${p.costo_envio ? soles(p.costo_envio) : 'Gratis'}</dd></div>
        <div class="resumen__total"><dt>Total</dt><dd>${soles(p.total)}</dd></div>
      </dl>
      ${['pendiente_pago', 'pago_rechazado'].includes(p.estado)
        ? '<a class="btn btn--borde detalle-ayuda" href="tienda.html">VOLVER A LA TIENDA</a>'
        : `<a class="btn btn--borde detalle-ayuda" target="_blank" rel="noopener" href="https://wa.me/51987654321?text=${encodeURIComponent('Hola, tengo una consulta sobre mi pedido ' + p.codigo)}"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i> AYUDA CON MI PEDIDO</a>`}`;

    document.getElementById('resultado').hidden = false;
  }

  async function consultar() {
    const codigo = form.codigo.value.trim().toUpperCase();
    const correo = form.correo.value.trim();
    if (!codigo || !correo) { estado.textContent = 'Completa el código y el correo.'; return; }
    estado.textContent = 'Consultando…';
    try {
      const { pedido } = await apiTienda(`/seguimiento?codigo=${encodeURIComponent(codigo)}&correo=${encodeURIComponent(correo)}`);
      estado.textContent = '';
      pintar(pedido);
      history.replaceState(null, '', `?codigo=${encodeURIComponent(codigo)}`);
    } catch (e) {
      document.getElementById('resultado').hidden = true;
      estado.textContent = e.message;
    }
  }

  form.addEventListener('submit', ev => { ev.preventDefault(); consultar(); });

  // Enlace desde el correo o el checkout: ?codigo=BP-000001&correo=...
  const q = new URLSearchParams(location.search);
  if (q.get('codigo')) form.codigo.value = q.get('codigo');
  if (q.get('correo')) form.correo.value = q.get('correo');
  if (q.get('codigo') && q.get('correo')) consultar();
  else if (q.get('codigo')) form.correo.focus();
})();
