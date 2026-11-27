/*
  productos.js – Módulo "Productos" del panel (admin/productos.html)
  1. Resumen del inventario, filtros y tabla.
  2. Crear / editar producto (foto, precio, oferta, destacado, visible).
  3. Movimientos de stock con kardex (ingreso, salida, conteo).
  4. Categorías y eliminación (se desactiva si ya tiene ventas).
*/
if (PAGINA === 'productos') {
  const filtros = document.getElementById('filtros');
  const cuerpo = document.getElementById('tabla-productos');
  const modalProducto = document.getElementById('modal-producto');
  const formProducto = document.getElementById('form-producto');
  const modalStock = document.getElementById('modal-stock');
  const modalCategorias = document.getElementById('modal-categorias');
  const modalConfirmar = document.getElementById('modal-confirmar');
  let productos = [];
  let categorias = [];
  let actual = null;          // producto abierto en un modal
  const entero = n => Number(n || 0).toLocaleString('es-PE');

  /* Fetch con FormData (para subir la foto) */
  async function enviarFormulario(ruta, metodo, datos) {
    const r = await fetch(API + ruta, { method: metodo, body: datos, credentials: 'same-origin' });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) { location.href = 'login.html'; throw new Error('Sesión expirada'); }
    if (!r.ok) { const e = new Error(j.mensaje || 'No se pudo guardar.'); e.errores = j.errores; throw e; }
    return j;
  }

  /* 1. Resumen, filtros y tabla */
  async function cargarResumen() {
    const r = await api('/admin/productos/resumen');
    document.getElementById('r-activos').textContent = entero(r.activos);
    document.getElementById('r-valor').textContent = soles(r.valor);
    document.getElementById('r-unidades').textContent = entero(r.unidades);
    document.getElementById('r-bajos').textContent = entero(r.bajos);
    document.getElementById('r-agotados').textContent = entero(r.agotados);
    document.getElementById('r-inactivos').textContent = entero(r.inactivos);
    const badge = document.getElementById('menu-badge-productos');
    badge.textContent = r.bajos + r.agotados; badge.hidden = !(r.bajos + r.agotados);
  }

  async function cargarCategorias() {
    const r = await api('/admin/categorias');
    categorias = r.datos;
    const opciones = categorias.map(c => `<option value="${esc(c.id)}">${esc(c.nombre)}</option>`).join('');
    const filtro = document.getElementById('f-categoria');
    const elegido = filtro.value;
    filtro.innerHTML = '<option value="">Todas</option>' + opciones;
    filtro.value = elegido;
    document.getElementById('p-categoria').innerHTML = '<option value="">Selecciona…</option>' + opciones;
    document.getElementById('c-icono').innerHTML = r.iconos.map(i => `<option value="${i}">${i.replace('fa-', '')}</option>`).join('');
    pintarCategorias();
  }

  const nombreCategoria = id => categorias.find(c => c.id === id)?.nombre || id;

  function barraStock(p) {
    const tope = Math.max(p.stock_minimo * 3, p.stock, 1);
    return `<div class="stock-celda stock-celda--${p.nivel}">
      <div><strong>${entero(p.stock)}</strong><small>mín. ${p.stock_minimo}</small></div>
      <span class="stock-barra"><span style="width:${Math.min(p.stock / tope * 100, 100)}%"></span></span>
      ${p.nivel === 'agotado' ? '<em>Agotado</em>' : p.nivel === 'bajo' ? '<em>Stock bajo</em>' : ''}
    </div>`;
  }

  async function cargarTabla() {
    try {
      const params = new URLSearchParams();
      new FormData(filtros).forEach((v, k) => { if (String(v).trim()) params.set(k, String(v).trim()); });
      const r = await api('/admin/productos?' + params);
      productos = r.datos;
      document.querySelectorAll('.inv-cifra[data-estado]').forEach(b => b.classList.toggle('activo', b.dataset.estado === filtros.estado.value));
      if (!productos.length) {
        cuerpo.innerHTML = '<tr><td colspan="7"><div class="vacio"><i class="fa-regular fa-folder-open"></i>No hay productos con esos filtros.</div></td></tr>';
      } else {
        cuerpo.innerHTML = productos.map(p => `
          <tr data-id="${esc(p.id)}" class="${p.activo ? '' : 'fila-inactiva'}">
            <td class="producto-celda">
              <img src="${p.imagen.startsWith('/') ? esc(p.imagen) : '../' + esc(p.imagen)}" alt="" loading="lazy">
              <div><strong>${esc(p.nombre)} ${p.destacado ? '<i class="fa-solid fa-star destacado-ico" title="Destacado" aria-label="Destacado"></i>' : ''}</strong>
                <span>${esc(p.sku)}${p.tipo ? ' · ' + esc(p.tipo) : ''}</span></div>
            </td>
            <td data-label="CATEGORÍA">${esc(nombreCategoria(p.categoria))}</td>
            <td data-label="PRECIO">${p.precio_oferta
              ? `<span class="precio-oferta">${soles(p.precio_oferta)}</span><s>${soles(p.precio)}</s>`
              : `<strong>${soles(p.precio)}</strong>`}</td>
            <td data-label="STOCK">${barraStock(p)}</td>
            <td data-label="VENTAS 30 D">${p.vendidos_30d ? entero(p.vendidos_30d) + ' und.' : '<span class="sin-dato">—</span>'}</td>
            <td data-label="VISIBLE"><label class="interruptor interruptor--solo" title="${p.activo ? 'Visible en la tienda' : 'Oculto'}">
              <input type="checkbox" data-accion="activo" ${p.activo ? 'checked' : ''} aria-label="Visible en la tienda"><span></span></label></td>
            <td class="col-acciones">
              <button class="btn btn--icono" type="button" data-accion="stock" title="Movimiento de stock" aria-label="Stock de ${esc(p.nombre)}"><i class="fa-solid fa-boxes-stacked" aria-hidden="true"></i></button>
              <button class="btn btn--icono" type="button" data-accion="editar" title="Editar" aria-label="Editar ${esc(p.nombre)}"><i class="fa-solid fa-pen" aria-hidden="true"></i></button>
            </td>
          </tr>`).join('');
      }
      document.getElementById('pie-productos').textContent = `${productos.length} producto(s) mostrados`;
    } catch (e) {
      cuerpo.innerHTML = `<tr><td colspan="7"><div class="vacio"><i class="fa-solid fa-plug-circle-xmark"></i>${esc(e.message)}</div></td></tr>`;
    }
  }

  const recargar = () => Promise.all([cargarResumen().catch(() => {}), cargarTabla()]);

  let espera;
  filtros.addEventListener('input', ev => { clearTimeout(espera); espera = setTimeout(cargarTabla, ev.target.type === 'search' ? 300 : 0); });
  filtros.addEventListener('submit', ev => ev.preventDefault());
  filtros.addEventListener('reset', () => setTimeout(cargarTabla));
  document.querySelectorAll('.inv-cifra[data-estado]').forEach(b => b.addEventListener('click', () => {
    filtros.estado.value = filtros.estado.value === b.dataset.estado ? '' : b.dataset.estado;
    cargarTabla();
  }));
  document.getElementById('btn-exportar').addEventListener('click', () => {
    const params = new URLSearchParams(new FormData(filtros));
    location.href = API + '/admin/productos/exportar.csv?' + params;
  });

  cuerpo.addEventListener('change', async ev => {
    if (ev.target.dataset.accion !== 'activo') return;
    const id = ev.target.closest('tr').dataset.id;
    try {
      await api('/admin/productos/' + encodeURIComponent(id), { method: 'PATCH', body: { activo: ev.target.checked } });
      aviso(ev.target.checked ? 'Producto visible en la tienda.' : 'Producto oculto de la tienda.');
      recargar();
    } catch (e) { aviso(e.message, 'error'); ev.target.checked = !ev.target.checked; }
  });
  cuerpo.addEventListener('click', ev => {
    const boton = ev.target.closest('[data-accion]');
    if (!boton || boton.dataset.accion === 'activo') return;
    const id = boton.closest('tr').dataset.id;
    if (boton.dataset.accion === 'editar') abrirProducto(id);
    if (boton.dataset.accion === 'stock') abrirStock(id);
  });

  /* 2. Crear / editar */
  const vista = document.getElementById('p-vista');
  const vistaVacia = document.getElementById('p-vista-vacia');
  const archivo = document.getElementById('p-imagen');
  const quitar = document.getElementById('p-quitar-imagen');
  let quitarImagen = false;

  function mostrarFoto(url) {
    vista.hidden = !url; vistaVacia.hidden = Boolean(url);
    if (url) vista.src = url;
    quitar.hidden = !url;
  }

  archivo.addEventListener('change', () => {
    const f = archivo.files[0];
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) { aviso('La imagen supera los 2 MB.', 'error'); archivo.value = ''; return; }
    quitarImagen = false;
    mostrarFoto(URL.createObjectURL(f));
  });
  quitar.addEventListener('click', () => { archivo.value = ''; quitarImagen = true; mostrarFoto(null); });

  function limpiarErrores() {
    formProducto.querySelectorAll('[aria-invalid]').forEach(c => c.removeAttribute('aria-invalid'));
    formProducto.querySelectorAll('.campo__error').forEach(e => e.remove());
  }

  async function abrirProducto(id) {
    limpiarErrores();
    formProducto.reset();
    archivo.value = '';
    quitarImagen = false;
    actual = null;
    const nuevo = !id;
    document.getElementById('campo-stock').hidden = !nuevo;
    document.getElementById('p-nota-stock').hidden = nuevo;
    document.getElementById('p-eliminar').hidden = nuevo;
    document.getElementById('producto-etiqueta').textContent = nuevo ? 'NUEVO PRODUCTO' : 'EDITAR PRODUCTO';
    document.getElementById('producto-titulo').textContent = nuevo ? 'Nuevo producto' : 'Editar producto';
    mostrarFoto(null);
    if (!nuevo) {
      try {
        const { dato: p } = await api('/admin/productos/' + encodeURIComponent(id));
        actual = p;
        document.getElementById('producto-titulo').textContent = p.nombre;
        const f = formProducto.elements;
        f.nombre.value = p.nombre; f.sku.value = p.sku; f.categoria.value = p.categoria;
        f.tipo.value = p.tipo || ''; f.detalle.value = p.detalle || '';
        f.precio.value = p.precio.toFixed(2); f.precio_oferta.value = p.precio_oferta ? p.precio_oferta.toFixed(2) : '';
        f.stock_minimo.value = p.stock_minimo; f.activo.checked = p.activo; f.destacado.checked = p.destacado;
        mostrarFoto(p.imagen.startsWith('/') ? p.imagen : '../' + p.imagen);
        quitar.hidden = !p.tiene_imagen;
      } catch (e) { aviso(e.message, 'error'); return; }
    }
    modalProducto.showModal();
    formProducto.elements.nombre.focus();
  }
  document.getElementById('btn-nuevo').addEventListener('click', () => abrirProducto(null));

  // Sugerir SKU según la categoría (p. ej. SEG-011)
  document.getElementById('p-categoria').addEventListener('change', ev => {
    const sku = formProducto.elements.sku;
    if (actual || sku.value) return;
    const prefijo = ev.target.value.slice(0, 3).toUpperCase();
    const numeros = productos.filter(p => p.sku.startsWith(prefijo + '-')).map(p => parseInt(p.sku.split('-')[1], 10) || 0);
    sku.value = `${prefijo}-${String(Math.max(0, ...numeros) + 1).padStart(3, '0')}`;
  });

  formProducto.addEventListener('submit', async ev => {
    ev.preventDefault();
    limpiarErrores();
    const datos = new FormData(formProducto);
    datos.set('activo', formProducto.elements.activo.checked);
    datos.set('destacado', formProducto.elements.destacado.checked);
    if (!archivo.files[0]) datos.delete('imagen');
    if (quitarImagen) datos.set('quitar_imagen', 'true');
    if (actual) datos.delete('stock');
    const boton = document.getElementById('p-guardar');
    boton.disabled = true;
    try {
      const r = actual
        ? await enviarFormulario('/admin/productos/' + encodeURIComponent(actual.id), 'PUT', datos)
        : await enviarFormulario('/admin/productos', 'POST', datos);
      modalProducto.close();
      aviso(r.mensaje);
      recargar();
    } catch (e) {
      aviso(e.message, 'error');
      Object.entries(e.errores || {}).forEach(([campo, mensaje]) => {
        const input = formProducto.elements[campo];
        if (!input) return;
        input.setAttribute('aria-invalid', 'true');
        input.closest('.campo')?.insertAdjacentHTML('beforeend', `<small class="campo__error">${esc(mensaje)}</small>`);
      });
      formProducto.querySelector('[aria-invalid="true"]')?.focus();
    } finally { boton.disabled = false; }
  });

  /* 3. Stock y kardex */
  const formStock = document.getElementById('form-stock');
  const TIPO_MOV = {
    inicial: ['Stock inicial', 'fa-flag'], ingreso: ['Ingreso', 'fa-arrow-down'], ajuste: ['Ajuste', 'fa-sliders'],
    venta: ['Venta', 'fa-cart-shopping'], devolucion: ['Devolución', 'fa-rotate-left']
  };

  function pintarStock(p) {
    document.getElementById('stock-sku').textContent = p.sku;
    document.getElementById('stock-titulo').textContent = p.nombre;
    document.getElementById('stock-actual').innerHTML = `
      <div class="stock-actual__dato stock-actual__dato--${p.nivel}"><span>Stock actual</span><b>${entero(p.stock)}</b><small>unidades</small></div>
      <div class="stock-actual__dato"><span>Stock mínimo</span><b>${entero(p.stock_minimo)}</b><small>alerta</small></div>
      <div class="stock-actual__dato"><span>Valor en stock</span><b>${soles(p.stock * p.precio_vigente)}</b><small>a ${soles(p.precio_vigente)} c/u</small></div>`;
    document.getElementById('kardex').innerHTML = p.movimientos.length ? p.movimientos.map(m => {
      const [etiqueta, icono] = TIPO_MOV[m.tipo] || [m.tipo, 'fa-circle'];
      return `<tr>
        <td>${fecha(m.creado_en)}</td>
        <td><span class="mov mov--${m.tipo}"><i class="fa-solid ${icono}" aria-hidden="true"></i> ${etiqueta}</span></td>
        <td class="${m.cantidad >= 0 ? 'cant-mas' : 'cant-menos'}">${m.cantidad > 0 ? '+' : ''}${m.cantidad}</td>
        <td>${m.stock_resultante}</td>
        <td>${esc(m.motivo || '')}${m.pedido ? ` · <strong>${esc(m.pedido)}</strong>` : ''}<small> · ${esc(m.autor)}</small></td>
      </tr>`;
    }).join('') : '<tr><td colspan="5" class="sin-dato">Sin movimientos.</td></tr>';
  }

  async function abrirStock(id) {
    try {
      const { dato } = await api('/admin/productos/' + encodeURIComponent(id));
      actual = dato;
      formStock.reset();
      actualizarFormStock();
      pintarStock(dato);
      if (!modalStock.open) modalStock.showModal();
      document.getElementById('s-cantidad').focus();
    } catch (e) { aviso(e.message, 'error'); }
  }

  function actualizarFormStock() {
    const tipo = formStock.elements.tipo.value;
    const cantidad = document.getElementById('s-cantidad');
    document.getElementById('s-cantidad-label').textContent =
      tipo === 'ingreso' ? 'CANTIDAD QUE INGRESA' : tipo === 'salida' ? 'CANTIDAD QUE SALE' : 'STOCK REAL CONTADO';
    cantidad.min = tipo === 'conteo' ? 0 : 1;
    document.getElementById('s-motivo').placeholder = tipo === 'ingreso'
      ? 'Ej. Factura F001-2345 de proveedor' : tipo === 'salida' ? 'Ej. Producto dañado en almacén' : 'Ej. Inventario físico de fin de mes';
    const n = Number(cantidad.value);
    const previa = document.getElementById('s-previa');
    if (!actual || cantidad.value === '' || !Number.isInteger(n)) { previa.textContent = ''; return; }
    const resultado = tipo === 'ingreso' ? actual.stock + n : tipo === 'salida' ? actual.stock - n : n;
    previa.innerHTML = resultado < 0
      ? '<span class="previa--error">No hay suficiente stock para esa salida.</span>'
      : `Stock: <b>${entero(actual.stock)}</b> → <b>${entero(resultado)}</b> unidades`;
  }
  formStock.addEventListener('input', actualizarFormStock);
  formStock.addEventListener('change', actualizarFormStock);

  formStock.addEventListener('submit', async ev => {
    ev.preventDefault();
    const boton = document.getElementById('s-guardar');
    boton.disabled = true;
    try {
      const r = await api(`/admin/productos/${encodeURIComponent(actual.id)}/stock`, {
        method: 'POST',
        body: { tipo: formStock.elements.tipo.value, cantidad: Number(document.getElementById('s-cantidad').value), motivo: document.getElementById('s-motivo').value }
      });
      aviso(r.mensaje);
      await abrirStock(actual.id);
      recargar();
    } catch (e) { aviso(e.message, 'error'); }
    finally { boton.disabled = false; }
  });

  /* 4. Categorías */
  function pintarCategorias() {
    document.getElementById('lista-categorias').innerHTML = categorias.map(c => `
      <li data-id="${esc(c.id)}">
        <i class="fa-solid ${esc(c.icono)}" aria-hidden="true"></i>
        <input class="input" value="${esc(c.nombre)}" maxlength="60" aria-label="Nombre de la categoría">
        <span class="categorias-lista__n" title="Productos">${c.productos}</span>
        <button class="btn btn--icono" type="button" data-cat="guardar" title="Guardar nombre" aria-label="Guardar"><i class="fa-solid fa-check" aria-hidden="true"></i></button>
        <button class="btn btn--icono btn--peligro" type="button" data-cat="borrar" title="Eliminar" aria-label="Eliminar" ${c.productos ? 'disabled' : ''}><i class="fa-solid fa-trash" aria-hidden="true"></i></button>
      </li>`).join('');
  }
  document.getElementById('btn-categorias').addEventListener('click', () => modalCategorias.showModal());
  document.getElementById('lista-categorias').addEventListener('click', async ev => {
    const boton = ev.target.closest('[data-cat]');
    if (!boton) return;
    const li = boton.closest('li');
    const c = categorias.find(x => x.id === li.dataset.id);
    try {
      const r = boton.dataset.cat === 'guardar'
        ? await api('/admin/categorias/' + encodeURIComponent(c.id), { method: 'PUT', body: { nombre: li.querySelector('input').value, icono: c.icono } })
        : await api('/admin/categorias/' + encodeURIComponent(c.id), { method: 'DELETE' });
      aviso(r.mensaje);
      await cargarCategorias();
      cargarTabla();
    } catch (e) { aviso(e.message, 'error'); }
  });
  document.getElementById('form-categoria').addEventListener('submit', async ev => {
    ev.preventDefault();
    try {
      const r = await api('/admin/categorias', { method: 'POST', body: { nombre: document.getElementById('c-nombre').value, icono: document.getElementById('c-icono').value } });
      aviso(r.mensaje);
      document.getElementById('c-nombre').value = '';
      await cargarCategorias();
    } catch (e) { aviso(e.message, 'error'); }
  });

  /* Eliminar (o desactivar si tiene ventas) */
  document.getElementById('p-eliminar').addEventListener('click', () => {
    document.getElementById('confirmar-titulo').textContent = `¿Eliminar "${actual.nombre}"?`;
    document.getElementById('confirmar-texto').textContent =
      'Si el producto ya tiene ventas, se desactivará (dejará de verse en la tienda) para conservar el historial de pedidos. Si nunca se vendió, se borrará definitivamente.';
    modalConfirmar.showModal();
  });
  document.getElementById('confirmar-si').addEventListener('click', async () => {
    try {
      const r = await api('/admin/productos/' + encodeURIComponent(actual.id), { method: 'DELETE' });
      modalConfirmar.close();
      modalProducto.close();
      aviso(r.mensaje);
      recargar();
    } catch (e) { aviso(e.message, 'error'); }
  });

  cargarCategorias().then(recargar).catch(e => aviso(e.message, 'error'));
}
