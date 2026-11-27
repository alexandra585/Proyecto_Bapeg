/*
  tienda.js – Catálogo y carrito (tienda.html)
  1. Carga productos y stock desde el servidor.
  2. Filtros, búsqueda y orden.
  3. Carrito lateral con cantidades, barra de envío gratis y paso al checkout.
*/
(function () {
  const grid = document.getElementById('productos-grid');
  if (!grid) return;
  const { Carrito, soles, esc, productos, config } = window.BapegTienda;

  const busqueda = document.getElementById('buscar-producto');
  const orden = document.getElementById('ordenar');
  const contenedorFiltros = document.getElementById('tienda-filtros');
  let botones = [...document.querySelectorAll('.tienda-filtro')];
  const contador = document.getElementById('tienda-resultados');
  const sinResultados = document.getElementById('sin-resultados');
  const carrito = document.getElementById('carrito');
  const avisoEl = document.getElementById('tienda-aviso');
  let lista = [];
  let cfg = { envio: { gratisDesde: 300 } };
  let categoriaActiva = 'todos';

  const porId = id => lista.find(p => p.id === id);
  let ETIQUETA_CAT = {};

  function aviso(texto) {
    avisoEl.innerHTML = `<i class="fa-solid fa-circle-check" aria-hidden="true"></i> ${esc(texto)}`;
    avisoEl.classList.add('visible');
    clearTimeout(aviso.t);
    aviso.t = setTimeout(() => avisoEl.classList.remove('visible'), 2200);
  }

  function etiquetaStock(p) {
    if (p.stock <= 0) return '<span class="stock stock--agotado">Agotado</span>';
    if (p.stock <= 5) return `<span class="stock stock--bajo">¡Últimas ${p.stock}!</span>`;
    return `<span class="stock">${p.stock} en stock</span>`;
  }

  /* 2. Catálogo */
  function pintar() {
    const termino = busqueda.value.trim().toLocaleLowerCase('es');
    let visibles = lista.filter(p =>
      (categoriaActiva === 'todos' || p.categoria === categoriaActiva) &&
      `${p.nombre} ${p.detalle} ${p.tipo} ${p.sku}`.toLocaleLowerCase('es').includes(termino));
    const criterio = orden.value;   // "Destacados" usa el orden del servidor (destacados primero)
    if (criterio === 'precio-asc') visibles = [...visibles].sort((a, b) => a.precio - b.precio);
    if (criterio === 'precio-desc') visibles = [...visibles].sort((a, b) => b.precio - a.precio);
    if (criterio === 'nombre') visibles = [...visibles].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

    contador.textContent = `${visibles.length} ${visibles.length === 1 ? 'producto' : 'productos'}`;
    sinResultados.hidden = visibles.length > 0;
    grid.hidden = visibles.length === 0;
    grid.innerHTML = visibles.map(p => {
      const enCarrito = Carrito.cantidad(p.id);
      const agotado = p.stock <= 0;
      return `<article class="producto" data-id="${p.id}">
        <div class="producto__foto">
          <img src="${esc(p.imagen)}" alt="${esc(p.nombre)}" loading="lazy">
          <span class="producto__cat">${esc(ETIQUETA_CAT[p.categoria] || '')}</span>
          ${p.destacado ? '<span class="producto__destacado"><i class="fa-solid fa-star" aria-hidden="true"></i> Destacado</span>' : ''}
          ${p.descuento ? `<span class="producto__oferta">-${p.descuento}%</span>` : ''}
          ${etiquetaStock(p)}
        </div>
        <div class="producto__info">
          <span class="producto__sku">${esc(p.sku)} · ${esc(p.tipo)}</span>
          <h3>${esc(p.nombre)}</h3>
          <p>${esc(p.detalle)}</p>
          <div class="producto__compra">
            <div class="producto__precio">${p.precio_normal ? `<s>${soles(p.precio_normal)}</s>` : ''}<strong class="${p.precio_normal ? 'producto__precio--oferta' : ''}">${soles(p.precio)}</strong><small>Inc. IGV</small></div>
            ${agotado
              ? '<button class="producto__agregar" type="button" disabled>SIN STOCK</button>'
              : enCarrito
                ? `<div class="cantidad" role="group" aria-label="Cantidad de ${esc(p.nombre)}">
                     <button type="button" data-delta="-1" aria-label="Quitar uno">−</button>
                     <span>${enCarrito}</span>
                     <button type="button" data-delta="1" aria-label="Agregar uno" ${enCarrito >= p.stock ? 'disabled' : ''}>+</button>
                   </div>`
                : `<button class="producto__agregar" type="button" data-agregar><i class="fa-solid fa-cart-plus" aria-hidden="true"></i> AGREGAR</button>`}
          </div>
        </div>
      </article>`;
    }).join('');
  }

  /* Botones de categoría según lo configurado en el panel */
  function pintarFiltros(categorias) {
    ETIQUETA_CAT = Object.fromEntries(categorias.map(c => [c.id, c.nombre]));
    contenedorFiltros.querySelectorAll('[data-categoria]:not([data-categoria="todos"])').forEach(b => b.remove());
    const resultados = document.getElementById('tienda-resultados');
    categorias.forEach(c => resultados.insertAdjacentHTML('beforebegin',
      `<button class="tienda-filtro" type="button" data-categoria="${esc(c.id)}" aria-pressed="false">
        <i class="fa-solid ${esc(c.icono)}" aria-hidden="true"></i> ${esc(c.nombre)}
        <span>${lista.filter(p => p.categoria === c.id).length}</span></button>`));
    contenedorFiltros.querySelector('[data-conteo="todos"]').textContent = lista.length;
    botones = [...contenedorFiltros.querySelectorAll('.tienda-filtro')];
  }

  contenedorFiltros.addEventListener('click', ev => {
    const boton = ev.target.closest('.tienda-filtro');
    if (!boton) return;
    categoriaActiva = boton.dataset.categoria;
    botones.forEach(b => { b.classList.toggle('activo', b === boton); b.setAttribute('aria-pressed', String(b === boton)); });
    pintar();
  });
  busqueda.addEventListener('input', pintar);
  orden.addEventListener('change', pintar);
  document.getElementById('limpiar-busqueda').addEventListener('click', () => {
    busqueda.value = '';
    botones[0].click();
    busqueda.focus();
  });

  grid.addEventListener('click', ev => {
    const tarjeta = ev.target.closest('.producto');
    if (!tarjeta) return;
    const p = porId(tarjeta.dataset.id);
    if (ev.target.closest('[data-agregar]')) {
      Carrito.sumar(p.id, 1, p.stock);
      aviso(`${p.nombre} agregado al carrito`);
    } else if (ev.target.closest('[data-delta]')) {
      Carrito.sumar(p.id, Number(ev.target.closest('[data-delta]').dataset.delta), p.stock);
    }
  });

  /* 3. Carrito */
  function pintarCarrito() {
    const lineas = Carrito.lineas().filter(l => porId(l.id));
    const unidades = lineas.reduce((s, l) => s + l.cantidad, 0);
    const subtotal = lineas.reduce((s, l) => s + porId(l.id).precio * l.cantidad, 0);
    const boton = document.getElementById('abrir-carrito');
    document.getElementById('carrito-cantidad').textContent = unidades;
    boton.setAttribute('aria-label', `Abrir carrito, ${unidades} ${unidades === 1 ? 'producto' : 'productos'}`);
    boton.classList.toggle('carrito-flotante--lleno', unidades > 0);
    document.getElementById('carrito-subtotal').textContent = soles(subtotal);

    const pagar = document.getElementById('carrito-pagar');
    pagar.classList.toggle('deshabilitado', !lineas.length);
    pagar.setAttribute('aria-disabled', String(!lineas.length));

    const meta = cfg.envio.gratisDesde;
    const falta = Math.max(meta - subtotal, 0);
    document.getElementById('carrito-barra-envio').innerHTML = lineas.length ? `
      <p>${falta ? `Te faltan <strong>${soles(falta)}</strong> para el <strong>envío gratis</strong>` : '<i class="fa-solid fa-circle-check" aria-hidden="true"></i> ¡Tienes <strong>envío gratis</strong>!'}</p>
      <div class="carrito__progreso"><span style="width:${Math.min(subtotal / meta * 100, 100)}%"></span></div>` : '';

    document.getElementById('carrito-items').innerHTML = lineas.length ? lineas.map(l => {
      const p = porId(l.id);
      return `<div class="carrito-linea" data-id="${p.id}">
        <img src="${esc(p.imagen)}" alt="">
        <div class="carrito-linea__info">
          <strong>${esc(p.nombre)}</strong>
          <small>${soles(p.precio)} c/u · ${esc(p.sku)}</small>
          <div class="cantidad cantidad--chica" role="group" aria-label="Cantidad">
            <button type="button" data-delta="-1" aria-label="Quitar uno">−</button>
            <span>${l.cantidad}</span>
            <button type="button" data-delta="1" aria-label="Agregar uno" ${l.cantidad >= p.stock ? 'disabled' : ''}>+</button>
          </div>
        </div>
        <div class="carrito-linea__total">
          <strong>${soles(p.precio * l.cantidad)}</strong>
          <button type="button" data-quitar aria-label="Quitar ${esc(p.nombre)}"><i class="fa-regular fa-trash-can" aria-hidden="true"></i></button>
        </div>
      </div>`;
    }).join('') : `<div class="carrito-vacio">
        <i class="fa-solid fa-cart-shopping" aria-hidden="true"></i>
        <strong>Tu carrito está vacío</strong>
        <span>Agrega productos del catálogo para comenzar.</span></div>`;
  }

  document.getElementById('abrir-carrito').addEventListener('click', () => { pintarCarrito(); carrito.showModal(); });
  document.getElementById('carrito-cerrar').addEventListener('click', () => carrito.close());
  document.getElementById('carrito-seguir').addEventListener('click', () => carrito.close());
  carrito.addEventListener('click', ev => { if (ev.target === carrito) carrito.close(); });
  document.getElementById('carrito-pagar').addEventListener('click', ev => {
    if (!Carrito.unidades()) ev.preventDefault();
  });
  document.getElementById('carrito-items').addEventListener('click', ev => {
    const linea = ev.target.closest('.carrito-linea');
    if (!linea) return;
    const p = porId(linea.dataset.id);
    if (ev.target.closest('[data-quitar]')) Carrito.fijar(p.id, 0);
    else if (ev.target.closest('[data-delta]')) Carrito.sumar(p.id, Number(ev.target.closest('[data-delta]').dataset.delta), p.stock);
  });

  document.addEventListener('carritoCambio', () => { pintar(); pintarCarrito(); });

  /* 1. Carga inicial */
  Promise.all([productos(), config().catch(() => ({ ...cfg, categorias: [] }))]).then(([datos, c]) => {
    lista = datos;
    cfg = c;
    document.getElementById('beneficio-envio').textContent = `Gratis desde ${soles(cfg.envio.gratisDesde)}`;
    // Ajustar el carrito guardado al stock actual
    Carrito.lineas().forEach(l => {
      const p = porId(l.id);
      if (!p || p.stock <= 0) Carrito.fijar(l.id, 0);
      else if (l.cantidad > p.stock) Carrito.fijar(l.id, p.stock);
    });
    grid.removeAttribute('aria-busy');
    pintarFiltros(cfg.categorias || []);
    pintar();
    pintarCarrito();
    if (location.hash === '#carrito') { carrito.showModal(); }
  }).catch(() => {
    grid.removeAttribute('aria-busy');
    grid.innerHTML = `<div class="tienda-cargando tienda-cargando--error"><i class="fa-solid fa-plug-circle-xmark" aria-hidden="true"></i>
      No se pudo cargar el catálogo. Verifica que el servidor esté encendido (<code>npm start</code>).</div>`;
  });
})();
