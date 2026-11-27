/*
  inventario.js – Utilidades del catálogo y del stock
  1. moverStock(): cambia el stock y deja el registro en el kardex (inventario_movimientos).
  2. precioVigente(): precio de oferta si existe y es menor; si no, el precio normal.
  3. productoPublico(): datos que ve la tienda (sin la imagen binaria).
*/

/* 1. Movimiento de stock (cantidad positiva = entra, negativa = sale). Usar dentro de una transacción. */
async function moverStock(conexion, productoId, tipo, cantidad, { motivo = null, pedidoId = null, autor = 'sistema' } = {}) {
  await conexion.query('UPDATE productos SET stock = GREATEST(CAST(stock AS SIGNED) + ?, 0) WHERE id = ?', [cantidad, productoId]);
  const [[p]] = await conexion.query('SELECT stock FROM productos WHERE id = ?', [productoId]);
  if (!p) return null;
  await conexion.query(
    `INSERT INTO inventario_movimientos (producto_id, tipo, cantidad, stock_resultante, motivo, pedido_id, autor)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [productoId, tipo, cantidad, p.stock, motivo ? String(motivo).slice(0, 200) : null, pedidoId, autor]
  );
  return p.stock;
}

/* 2. Precio que se cobra */
function precioVigente(p) {
  const normal = Number(p.precio);
  const oferta = p.precio_oferta === null || p.precio_oferta === undefined ? null : Number(p.precio_oferta);
  return oferta !== null && oferta > 0 && oferta < normal ? oferta : normal;
}

/* Ruta de la foto: subida al panel (guardada en MySQL) o archivo del sitio (img/productos) */
function urlImagen(p) {
  if (p.tiene_imagen) return `/api/tienda/productos/${encodeURIComponent(p.id)}/imagen?v=${new Date(p.actualizado_en).getTime()}`;
  return p.imagen_ruta || 'img/logo.svg';
}

/* 3. Vista pública de un producto */
function productoPublico(p) {
  const precio = precioVigente(p);
  const normal = Number(p.precio);
  return {
    id: p.id,
    sku: p.sku,
    nombre: p.nombre,
    categoria: p.categoria,
    tipo: p.tipo || '',
    detalle: p.detalle || '',
    precio,
    precio_normal: precio < normal ? normal : null,
    descuento: precio < normal ? Math.round((1 - precio / normal) * 100) : 0,
    destacado: Boolean(p.destacado),
    stock: Number(p.stock),
    imagen: urlImagen(p)
  };
}

/* Columnas a leer sin traer el binario de la imagen */
const COLUMNAS_PRODUCTO = `id, sku, nombre, categoria, tipo, detalle, precio, precio_oferta, stock, stock_minimo,
  destacado, activo, imagen_ruta, (imagen_datos IS NOT NULL) AS tiene_imagen, creado_en, actualizado_en`;

module.exports = { moverStock, precioVigente, urlImagen, productoPublico, COLUMNAS_PRODUCTO };
