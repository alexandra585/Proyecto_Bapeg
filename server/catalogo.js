/*
  catalogo.js – Datos iniciales de la tienda y reglas de envío
  Los productos y categorías de aquí solo se cargan la PRIMERA vez (base de datos vacía).
  Después se administran desde el panel → módulo Productos (la base de datos es la fuente de verdad).
*/
const PRODUCTOS = [
  { id: 'casco-seguridad', sku: 'SEG-001', nombre: 'Casco de seguridad', categoria: 'seguridad', tipo: 'Protección personal', precio: 39.90, stock: 40, detalle: 'Casco tipo I con suspensión de 4 puntos. Para planta, obra y campo.' },
  { id: 'lentes-claros', sku: 'SEG-002', nombre: 'Lentes de seguridad claros', categoria: 'seguridad', tipo: 'Protección personal', precio: 12.50, stock: 120, detalle: 'Mica de policarbonato antiempañante para mantenimiento.' },
  { id: 'lentes-oscuros', sku: 'SEG-003', nombre: 'Lentes de seguridad oscuros', categoria: 'seguridad', tipo: 'Protección personal', precio: 14.50, stock: 90, detalle: 'Filtro UV para trabajos en exteriores.' },
  { id: 'guantes-proteccion', sku: 'SEG-004', nombre: 'Guantes de protección', categoria: 'seguridad', tipo: 'Protección personal', precio: 18.90, stock: 150, detalle: 'Recubrimiento de nitrilo para manipulación de piezas.' },
  { id: 'guantes-nitrilo', sku: 'SEG-005', nombre: 'Guantes de nitrilo', categoria: 'seguridad', tipo: 'Protección personal', precio: 16.90, stock: 110, detalle: 'Resistentes a aceites y químicos ligeros.' },
  { id: 'botas-trabajo', sku: 'SEG-006', nombre: 'Botas de trabajo', categoria: 'seguridad', tipo: 'Protección personal', precio: 129.90, stock: 18, detalle: 'Puntera de acero y planta antideslizante. Tallas 38 a 44.' },
  { id: 'proteccion-auditiva', sku: 'SEG-007', nombre: 'Protección auditiva', categoria: 'seguridad', tipo: 'Protección personal', precio: 9.90, stock: 200, detalle: 'Orejeras con reducción de ruido NRR 25 dB.' },
  { id: 'respirador-reutilizable', sku: 'SEG-008', nombre: 'Respirador reutilizable', categoria: 'seguridad', tipo: 'Protección personal', precio: 59.90, stock: 25, detalle: 'Media cara con conexión para filtros intercambiables.' },
  { id: 'arnes-seguridad', sku: 'SEG-009', nombre: 'Arnés de seguridad', categoria: 'seguridad', tipo: 'Trabajo en altura', precio: 189.90, stock: 8, detalle: 'Arnés de cuerpo completo con 3 anillos en D.' },
  { id: 'llave-ajustable', sku: 'HER-001', nombre: 'Llave ajustable', categoria: 'herramientas', tipo: 'Herramientas', precio: 29.90, stock: 60, detalle: 'Acero cromo-vanadio de 10". Para mantenimiento y montaje.' },
  { id: 'juego-llaves-combinadas', sku: 'HER-002', nombre: 'Juego de llaves combinadas', categoria: 'herramientas', tipo: 'Herramientas', precio: 79.90, stock: 30, detalle: 'Set de 12 piezas de 8 a 19 mm con estuche.' },
  { id: 'juego-dados', sku: 'HER-003', nombre: 'Juego de dados', categoria: 'herramientas', tipo: 'Herramientas', precio: 99.90, stock: 22, detalle: 'Encastre de 1/2" con 24 piezas y matraca.' },
  { id: 'multimetro-digital', sku: 'INS-001', nombre: 'Multímetro digital', categoria: 'herramientas', tipo: 'Instrumentos', precio: 89.90, stock: 15, detalle: 'Medición de tensión, corriente y resistencia, CAT III.' },
  { id: 'pinza-amperimetrica', sku: 'INS-002', nombre: 'Pinza amperimétrica', categoria: 'herramientas', tipo: 'Instrumentos', precio: 119.90, stock: 12, detalle: 'Hasta 600 A AC con True RMS para inspección eléctrica.' },
  { id: 'overol-trabajo', sku: 'IND-001', nombre: 'Overol de trabajo', categoria: 'indumentaria', tipo: 'Indumentaria', precio: 69.90, stock: 35, detalle: 'Drill 100% algodón con cintas reflectivas. Tallas S a XXL.' },
  { id: 'chaleco-alta-visibilidad', sku: 'IND-002', nombre: 'Chaleco de alta visibilidad', categoria: 'indumentaria', tipo: 'Indumentaria', precio: 24.90, stock: 80, detalle: 'Malla transpirable con cinta reflectiva de 2".' },
  { id: 'camisa-trabajo', sku: 'IND-003', nombre: 'Camisa de trabajo', categoria: 'indumentaria', tipo: 'Indumentaria', precio: 39.90, stock: 45, detalle: 'Manga larga en drill, bolsillos con tapa.' },
  { id: 'casaca-termica', sku: 'IND-004', nombre: 'Casaca térmica', categoria: 'indumentaria', tipo: 'Indumentaria', precio: 99.90, stock: 20, detalle: 'Forro polar e impermeable para ambientes fríos.' }
].map(p => ({ ...p, imagen: `img/productos/${p.id}.jpg` }));

const CATEGORIAS_INICIALES = [
  { id: 'seguridad', nombre: 'Seguridad', icono: 'fa-helmet-safety' },
  { id: 'herramientas', nombre: 'Herramientas', icono: 'fa-screwdriver-wrench' },
  { id: 'indumentaria', nombre: 'Indumentaria', icono: 'fa-shirt' }
];

/* Envío: tarifas planas referenciales */
const ENVIO = {
  lima: 15,            // Lima Metropolitana y Callao
  provincia: 25,       // Resto del Perú
  gratisDesde: 300,    // Envío gratis desde este subtotal
  recojo: 0            // Recojo en almacén (Carabayllo)
};

const DEPARTAMENTOS = [
  'Amazonas', 'Áncash', 'Apurímac', 'Arequipa', 'Ayacucho', 'Cajamarca', 'Callao', 'Cusco',
  'Huancavelica', 'Huánuco', 'Ica', 'Junín', 'La Libertad', 'Lambayeque', 'Lima', 'Loreto',
  'Madre de Dios', 'Moquegua', 'Pasco', 'Piura', 'Puno', 'San Martín', 'Tacna', 'Tumbes', 'Ucayali'
];

function costoEnvio(tipoEntrega, departamento, subtotal) {
  if (tipoEntrega === 'recojo') return ENVIO.recojo;
  if (subtotal >= ENVIO.gratisDesde) return 0;
  return ['Lima', 'Callao'].includes(departamento) ? ENVIO.lima : ENVIO.provincia;
}

module.exports = { PRODUCTOS, CATEGORIAS_INICIALES, ENVIO, DEPARTAMENTOS, costoEnvio };
