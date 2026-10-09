/*
  layout.js – Componentes compartidos
  1. Inserta el header y el footer en sus contenedores.
  2. Emite "layoutListo" cuando ambos componentes terminaron de cargar.

  fetch() requiere un servidor local; no funciona abriendo el HTML con file://.
  En VS Code se puede iniciar Live Server o usar `python -m http.server`.
*/

/* 1. Descarga un componente y lo inserta en el contenedor indicado. */
async function cargarComponente(id, ruta) {
  const destino = document.getElementById(id);
  if (!destino) return;
  try {
    const respuesta = await fetch(ruta);
    if (!respuesta.ok) throw new Error(respuesta.status);
    destino.innerHTML = await respuesta.text();
  } catch (error) {
    console.error('No se pudo cargar ' + ruta, error);
  }
}

/* 2. Carga el header y el footer antes de notificar a main.js. */
Promise.all([
  cargarComponente('header-placeholder', 'components/header.html'),
  cargarComponente('footer-placeholder', 'components/footer.html')
]).then(() => document.dispatchEvent(new Event('layoutListo')));
