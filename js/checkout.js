/*
  checkout.js – Finalizar compra (checkout.html)
  1. Resumen del carrito y costo de envío referencial.
  2. Paso 1: datos, comprobante y entrega → crea el pedido en el servidor.
  3. Paso 2: pago con Mercado Pago (Card Payment Brick) o modo demostración.
  4. Paso 3: resultado (aprobado, rechazado o pendiente).
*/
(function () {
  const formDatos = document.getElementById('paso-datos');
  if (!formDatos) return;
  const { apiTienda, Carrito, soles, esc, productos, config, costoEnvio } = window.BapegTienda;

  const pasos = {
    datos: formDatos,
    pago: document.getElementById('paso-pago'),
    resultado: document.getElementById('paso-resultado')
  };
  const estadoDatos = document.getElementById('estado-datos');
  let lista = [];
  let cfg = null;
  let pedido = null;        // { codigo, total, correo, envio, subtotal }
  let brick = null;         // controlador del Brick de Mercado Pago

  const porId = id => lista.find(p => p.id === id);
  const valor = nombre => formDatos.elements[nombre]?.value?.trim() || '';
  const radio = nombre => formDatos.querySelector(`[name="${nombre}"]:checked`).value;

  function irA(paso) {
    Object.entries(pasos).forEach(([clave, el]) => { el.hidden = clave !== paso; });
    const orden = ['datos', 'pago', 'resultado'];
    document.querySelectorAll('.pasos__item').forEach(li => {
      const i = orden.indexOf(li.dataset.paso);
      li.classList.toggle('activo', li.dataset.paso === paso);
      li.classList.toggle('hecho', i < orden.indexOf(paso));
    });
    document.getElementById('resumen-editar').hidden = paso !== 'datos';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* 1. Resumen */
  function lineas() { return Carrito.lineas().filter(l => porId(l.id)); }
  function subtotal() { return lineas().reduce((s, l) => s + porId(l.id).precio * l.cantidad, 0); }

  function pintarResumen() {
    document.getElementById('resumen-items').innerHTML = lineas().map(l => {
      const p = porId(l.id);
      return `<div class="resumen-item">
        <span class="resumen-item__foto"><img src="${esc(p.imagen)}" alt=""><b>${l.cantidad}</b></span>
        <span class="resumen-item__nombre">${esc(p.nombre)}<small>${soles(p.precio)} c/u</small></span>
        <strong>${soles(p.precio * l.cantidad)}</strong>
      </div>`;
    }).join('');
    const sub = pedido ? pedido.subtotal : subtotal();
    const envio = pedido ? pedido.envio : costoEnvio(cfg, radio('entrega'), valor('departamento'), sub);
    document.getElementById('resumen-subtotal').textContent = soles(sub);
    document.getElementById('resumen-envio').innerHTML = envio === null
      ? '<span class="resumen__pendiente">Elige destino</span>'
      : envio === 0 ? '<span class="resumen__gratis">Gratis</span>' : soles(envio);
    document.getElementById('resumen-total').textContent = soles(pedido ? pedido.total : sub + (envio || 0));
  }

  /* 2. Paso 1 */
  function actualizarFormulario() {
    const factura = radio('comprobante') === 'factura';
    const doc = document.getElementById('c-documento');
    document.getElementById('c-documento-label').textContent = factura ? 'RUC *' : 'DNI *';
    doc.maxLength = factura ? 11 : 8;
    doc.placeholder = factura ? '20XXXXXXXXX' : '8 dígitos';
    document.getElementById('campo-razon').hidden = !factura;

    const recojo = radio('entrega') === 'recojo';
    document.getElementById('campos-envio').hidden = recojo;
    document.getElementById('info-recojo').hidden = !recojo;
    pintarResumen();
  }

  formDatos.addEventListener('change', actualizarFormulario);
  // Al corregir un campo se quita su mensaje de error
  formDatos.addEventListener('input', ev => {
    const campo = ev.target;
    if (campo.getAttribute('aria-invalid') !== 'true') return;
    campo.removeAttribute('aria-invalid');
    campo.closest('.campo-t')?.querySelector('.campo-t__error')?.remove();
  });
  document.getElementById('c-documento').addEventListener('input', ev => {
    ev.target.value = ev.target.value.replace(/\D/g, '').slice(0, ev.target.maxLength);
  });

  function marcarErrores(errores = {}) {
    formDatos.querySelectorAll('[aria-invalid]').forEach(c => c.removeAttribute('aria-invalid'));
    formDatos.querySelectorAll('.campo-t__error').forEach(e => e.remove());
    Object.entries(errores).forEach(([nombre, mensaje]) => {
      const campo = formDatos.elements[nombre];
      if (!campo || !campo.closest) return;
      campo.setAttribute('aria-invalid', 'true');
      const nota = document.createElement('small');
      nota.className = 'campo-t__error';
      nota.textContent = mensaje;
      campo.closest('.campo-t')?.appendChild(nota);
    });
    formDatos.querySelector('[aria-invalid="true"]')?.focus();
  }

  function validarLocal() {
    const e = {};
    const factura = radio('comprobante') === 'factura';
    if (valor('nombre').length < 3) e.nombre = 'Ingresa tu nombre completo.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(valor('correo'))) e.correo = 'Revisa el correo.';
    if (valor('telefono').replace(/\D/g, '').length < 9) e.telefono = 'Ingresa un celular de 9 dígitos.';
    if (!factura && !/^\d{8}$/.test(valor('documento'))) e.documento = 'El DNI tiene 8 dígitos.';
    if (factura && !/^(10|20)\d{9}$/.test(valor('documento'))) e.documento = 'El RUC tiene 11 dígitos y empieza con 10 o 20.';
    if (factura && valor('razon_social').length < 3) e.razon_social = 'Ingresa la razón social.';
    if (radio('entrega') === 'envio') {
      if (!valor('departamento')) e.departamento = 'Selecciona el departamento.';
      if (valor('distrito').length < 3) e.distrito = 'Indica el distrito.';
      if (valor('direccion').length < 6) e.direccion = 'Indica la dirección.';
    }
    return e;
  }

  formDatos.addEventListener('submit', async ev => {
    ev.preventDefault();
    estadoDatos.textContent = '';
    const errores = validarLocal();
    marcarErrores(errores);
    if (Object.keys(errores).length) { estadoDatos.textContent = 'Revisa los campos marcados.'; return; }

    const boton = document.getElementById('btn-continuar');
    boton.disabled = true;
    boton.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> REGISTRANDO PEDIDO…';
    try {
      const { pedido: p } = await apiTienda('/pedidos', {
        method: 'POST',
        body: {
          cliente: {
            nombre: valor('nombre'), correo: valor('correo'), telefono: valor('telefono'),
            comprobante: radio('comprobante'), documento: valor('documento'), razon_social: valor('razon_social')
          },
          entrega: {
            tipo: radio('entrega'), departamento: valor('departamento'), distrito: valor('distrito'),
            direccion: valor('direccion'), referencia: valor('referencia')
          },
          items: lineas()
        }
      });
      pedido = p;
      pintarResumen();
      mostrarPago();
    } catch (e) {
      marcarErrores(e.datos?.errores);
      estadoDatos.textContent = e.message;
    } finally {
      boton.disabled = false;
      boton.innerHTML = 'CONTINUAR AL PAGO <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>';
    }
  });

  /* 3. Paso 2: pago */
  function mostrarPago(mensajeRechazo) {
    document.getElementById('pago-codigo').textContent = `PEDIDO ${pedido.codigo}`;
    document.getElementById('pago-total').textContent = soles(pedido.total);
    const aviso = document.getElementById('pago-rechazo');
    aviso.hidden = !mensajeRechazo;
    aviso.innerHTML = mensajeRechazo
      ? `<i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> <div><strong>Pago rechazado: ${esc(mensajeRechazo)}.</strong> Puedes intentarlo con otra tarjeta.</div>` : '';
    irA('pago');
    if (cfg.pasarela === 'mercadopago') montarBrick();
    else document.getElementById('pago-demo').hidden = false;
  }

  function cargarSdk() {
    if (window.MercadoPago) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://sdk.mercadopago.com/js/v2';
      s.onload = resolve;
      s.onerror = () => reject(new Error('No se pudo cargar Mercado Pago.'));
      document.head.appendChild(s);
    });
  }

  async function montarBrick() {
    document.getElementById('pago-mp').hidden = false;
    const cargando = document.getElementById('brick-cargando');
    cargando.hidden = false;
    try {
      await cargarSdk();
      if (brick) { await brick.unmount(); brick = null; }
      const mp = new window.MercadoPago(cfg.publicKey, { locale: 'es-PE' });
      brick = await mp.bricks().create('cardPayment', 'brick-tarjeta', {
        initialization: { amount: pedido.total, payer: { email: pedido.correo } },
        customization: {
          visual: { style: { theme: 'dark', customVariables: { baseColor: '#FF6B00', formBackgroundColor: '#1E1E1E' } } },
          paymentMethods: { maxInstallments: 1 }
        },
        callbacks: {
          onReady: () => { cargando.hidden = true; },
          // additionalData.paymentTypeId indica si es tarjeta de crédito o débito (lo pide la Orders API)
          onSubmit: (formData, additionalData) => pagar({
            formData: { ...formData, payment_type_id: additionalData?.paymentTypeId || formData.payment_type_id }
          }).catch(e => {
            // Error de la pasarela o del servidor: se muestra arriba del formulario
            setTimeout(() => mostrarPago(e.message), 0);
          }),
          onError: error => console.error('Mercado Pago:', error)
        }
      });
    } catch (e) {
      cargando.innerHTML = `<i class="fa-solid fa-plug-circle-xmark" aria-hidden="true"></i> ${esc(e.message)} Revisa tu conexión a internet.`;
    }
  }

  async function pagar(extra) {
    const r = await apiTienda(`/pedidos/${encodeURIComponent(pedido.codigo)}/pago`, {
      method: 'POST',
      body: { correo: pedido.correo, ...extra }
    }).catch(e => {
      // Si el pedido ya fue pagado (p. ej. doble clic), se muestra el resultado igualmente
      if (e.datos?.estado) return { pago: { estado: 'aprobado' }, pedido: { estado: e.datos.estado } };
      throw e;
    });
    // Se muestra el resultado después de devolver el control al Brick (que espera esta promesa)
    setTimeout(() => mostrarResultado(r), 0);
    return r;
  }

  document.querySelectorAll('[data-simular]').forEach(boton => boton.addEventListener('click', async () => {
    const botones = document.querySelectorAll('[data-simular]');
    botones.forEach(b => { b.disabled = true; });
    try { await pagar({ simulacion: boton.dataset.simular }); }
    catch (e) { mostrarPago(e.message); }
    finally { botones.forEach(b => { b.disabled = false; }); }
  }));

  document.getElementById('btn-editar').addEventListener('click', async () => {
    if (brick) { await brick.unmount().catch(() => {}); brick = null; }
    pedido = null;   // al continuar se registra un pedido nuevo con los datos corregidos
    pintarResumen();
    irA('datos');
  });

  /* 4. Resultado */
  function mostrarResultado({ pago, pedido: estadoPedido }) {
    if (pago.estado === 'rechazado') { mostrarPago(pago.mensaje || 'el banco no aprobó el pago'); return; }

    const aprobado = pago.estado === 'aprobado';
    const enlace = `seguimiento.html?codigo=${encodeURIComponent(pedido.codigo)}&correo=${encodeURIComponent(pedido.correo)}`;
    if (aprobado) Carrito.vaciar();
    pasos.resultado.innerHTML = `
      <div class="resultado resultado--${aprobado ? 'ok' : 'pendiente'}">
        <span class="resultado__icono"><i class="fa-solid ${aprobado ? 'fa-check' : 'fa-hourglass-half'}" aria-hidden="true"></i></span>
        <p class="etiqueta">${aprobado ? 'PAGO APROBADO' : 'PAGO EN REVISIÓN'}</p>
        <h2>${aprobado ? '¡Gracias por tu compra!' : 'Estamos confirmando tu pago'}</h2>
        <p>${aprobado
          ? `Tu pedido <strong>${esc(pedido.codigo)}</strong> fue confirmado. Enviamos el detalle a <strong>${esc(pedido.correo)}</strong>.`
          : `Mercado Pago está revisando el pago del pedido <strong>${esc(pedido.codigo)}</strong>. Te avisaremos por correo cuando se apruebe.`}</p>
        <div class="resultado__codigo"><span>Código de pedido</span><strong>${esc(pedido.codigo)}</strong></div>
        <ol class="resultado__siguiente">
          <li><i class="fa-solid fa-box" aria-hidden="true"></i> Preparamos tu pedido en almacén (24 h hábiles).</li>
          <li><i class="fa-solid fa-truck-fast" aria-hidden="true"></i> Te enviamos el número de guía del courier por correo.</li>
          <li><i class="fa-solid fa-location-dot" aria-hidden="true"></i> Sigue cada etapa desde “Rastrear pedido”.</li>
        </ol>
        <div class="resultado__acciones">
          <a class="btn btn--primario" href="${enlace}"><i class="fa-solid fa-route" aria-hidden="true"></i> VER ESTADO DEL PEDIDO</a>
          <a class="btn btn--borde" href="tienda.html">SEGUIR COMPRANDO</a>
        </div>
      </div>`;
    document.getElementById('resumen-editar').hidden = true;
    irA('resultado');
    if (estadoPedido?.estado) document.title = `Pedido ${pedido.codigo} | BAPEG Industrial`;
  }

  /* Carga inicial */
  Promise.all([productos(), config()]).then(([datos, c]) => {
    lista = datos;
    cfg = c;
    const select = document.getElementById('c-departamento');
    select.insertAdjacentHTML('beforeend', cfg.departamentos.map(d => `<option>${esc(d)}</option>`).join(''));
    document.getElementById('texto-envio').textContent =
      `Lima ${soles(cfg.envio.lima)} · Provincias ${soles(cfg.envio.provincia)} · Gratis desde ${soles(cfg.envio.gratisDesde)}`;
    if (!lineas().length) {
      document.getElementById('checkout-grid').hidden = true;
      document.getElementById('checkout-vacio').hidden = false;
      document.querySelector('.pasos').hidden = true;
      return;
    }
    actualizarFormulario();
  }).catch(() => {
    estadoDatos.textContent = 'No se pudo conectar con la tienda. Verifica que el servidor esté encendido.';
  });
})();
