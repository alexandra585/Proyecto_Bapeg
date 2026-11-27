/*
  carrito.js – Utilidades compartidas de la tienda (tienda.html, checkout.html, seguimiento.html)
  1. apiTienda(): arma la URL del backend (mismo servidor, Live Server o GitHub Pages).
  2. Carrito: se guarda en el navegador para pasar de la tienda al checkout.
  3. Formatos (soles, fechas) y catálogo/configuración con caché.
*/
(function () {
  /* 1. URL del backend */
  function base() {
    const { hostname, port } = location;
    if (hostname.endsWith('github.io')) return typeof API_NUBE !== 'undefined' ? API_NUBE : '';
    if (/^(localhost|127\.0\.0\.1)$/.test(hostname) && port !== '3000') return 'http://localhost:3000';
    return '';
  }

  async function apiTienda(ruta, opciones = {}) {
    const respuesta = await fetch(base() + '/api/tienda' + ruta, {
      headers: opciones.body ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' },
      ...opciones,
      body: opciones.body ? JSON.stringify(opciones.body) : undefined
    });
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) {
      const error = new Error(datos.mensaje || 'No se pudo conectar con la tienda.');
      error.datos = datos;
      throw error;
    }
    return datos;
  }

  /* 2. Carrito persistente (localStorage con respaldo en memoria) */
  const CLAVE = 'bapeg-carrito-v2';
  let memoria = {};
  const leer = () => {
    try { return JSON.parse(localStorage.getItem(CLAVE)) || {}; } catch { return memoria; }
  };
  const guardar = datos => {
    memoria = datos;
    try { localStorage.setItem(CLAVE, JSON.stringify(datos)); } catch { /* solo memoria */ }
    document.dispatchEvent(new CustomEvent('carritoCambio', { detail: datos }));
  };

  const Carrito = {
    lineas: () => Object.entries(leer()).map(([id, cantidad]) => ({ id, cantidad })),
    cantidad: id => leer()[id] || 0,
    unidades: () => Object.values(leer()).reduce((a, b) => a + b, 0),
    fijar(id, cantidad, maximo = 50) {
      const datos = leer();
      const n = Math.max(0, Math.min(Number(cantidad) || 0, maximo, 50));
      if (n) datos[id] = n; else delete datos[id];
      guardar(datos);
    },
    sumar(id, delta, maximo) { this.fijar(id, this.cantidad(id) + delta, maximo); },
    vaciar: () => guardar({})
  };

  /* 3. Formatos y datos */
  const soles = n => 'S/ ' + Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fecha = iso => new Intl.DateTimeFormat('es-PE', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima'
  }).format(new Date(iso));
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let catalogo, configuracion;
  // Las fotos subidas en el panel se sirven desde el backend: se antepone su dirección
  const productos = () => (catalogo ||= apiTienda('/productos').then(d => d.productos.map(p => ({
    ...p, imagen: p.imagen.startsWith('/api/') ? base() + p.imagen : p.imagen
  }))));
  const config = () => (configuracion ||= apiTienda('/config'));

  /* Costo de envío referencial (el servidor recalcula el definitivo) */
  function costoEnvio(cfg, tipo, departamento, subtotal) {
    if (tipo === 'recojo') return 0;
    if (subtotal >= cfg.envio.gratisDesde) return 0;
    if (!departamento) return null;
    return ['Lima', 'Callao'].includes(departamento) ? cfg.envio.lima : cfg.envio.provincia;
  }

  window.BapegTienda = { apiTienda, Carrito, soles, fecha, esc, productos, config, costoEnvio };
})();
