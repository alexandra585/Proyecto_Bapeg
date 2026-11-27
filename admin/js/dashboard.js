/*
  dashboard.js – Módulo "Dashboard" (admin/index.html)
  Solo cifras y gráficos (Chart.js). Para gestionar registros están los módulos Requerimientos y Pedidos.
*/
if (PAGINA === 'dashboard') {
  const COLORES = {
    naranja: '#FF6B00', amarillo: '#FFC000', azul: '#38BDF8', verde: '#4ade80',
    rojo: '#f87171', morado: '#a78bfa', celeste: '#0ea5e9', gris: '#6b6560', texto: '#a9a29b', rejilla: '#2a2a2a'
  };
  const COLOR_ESTADO = {
    pendiente_pago: COLORES.gris, pago_rechazado: COLORES.rojo, pagado: COLORES.amarillo,
    en_preparacion: COLORES.naranja, listo_recojo: COLORES.morado, despachado: COLORES.azul,
    en_reparto: COLORES.celeste, entregado: COLORES.verde, cancelado: '#3f3f3f'
  };
  const graficos = {};
  let dias = 30;

  if (window.Chart) {
    Chart.defaults.color = COLORES.texto;
    Chart.defaults.borderColor = COLORES.rejilla;
    Chart.defaults.font.family = "'Work Sans', sans-serif";
    Chart.defaults.plugins.legend.labels.boxWidth = 10;
    Chart.defaults.plugins.legend.labels.boxHeight = 10;
    Chart.defaults.plugins.tooltip.backgroundColor = '#111';
    Chart.defaults.plugins.tooltip.borderColor = '#333';
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.maintainAspectRatio = false;
  }

  const entero = n => Number(n || 0).toLocaleString('es-PE');
  const diaCorto = iso => new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(iso + 'T00:00:00Z'));

  /* Crea o actualiza un gráfico; si no hay datos muestra un aviso en su lugar */
  function dibujar(id, config, hayDatos) {
    const lienzo = document.getElementById(id);
    const caja = lienzo.parentElement;
    caja.querySelector('.grafico__vacio')?.remove();
    if (graficos[id]) { graficos[id].destroy(); delete graficos[id]; }
    if (!window.Chart) {
      caja.insertAdjacentHTML('beforeend', '<p class="grafico__vacio">No se pudo cargar Chart.js (revisa tu conexión).</p>');
      return;
    }
    if (!hayDatos) {
      caja.insertAdjacentHTML('beforeend', '<p class="grafico__vacio"><i class="fa-regular fa-chart-bar" aria-hidden="true"></i> Sin datos en este periodo</p>');
      return;
    }
    graficos[id] = new Chart(lienzo, config);
  }

  const dona = (etiquetas, valores, colores) => ({
    type: 'doughnut',
    data: { labels: etiquetas, datasets: [{ data: valores, backgroundColor: colores, borderColor: '#1E1E1E', borderWidth: 3, hoverOffset: 6 }] },
    options: { cutout: '64%', plugins: { legend: { position: 'right', labels: { padding: 12 } } } }
  });

  const barrasHorizontales = (etiquetas, valores, color, formato = entero) => ({
    type: 'bar',
    data: { labels: etiquetas, datasets: [{ data: valores, backgroundColor: color, borderRadius: 4, maxBarThickness: 22 }] },
    options: {
      indexAxis: 'y',
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' ' + formato(c.raw) } } },
      scales: { x: { beginAtZero: true, ticks: { precision: 0 } }, y: { grid: { display: false } } }
    }
  });

  function pintar(d) {
    const k = d.kpis;
    document.getElementById('k-ventas').textContent = soles(k.ventas);
    const variacion = document.getElementById('k-variacion');
    if (k.variacion === null) variacion.textContent = `Últimos ${d.dias} días`;
    else {
      const sube = k.variacion >= 0;
      variacion.innerHTML = `<span class="${sube ? 'sube' : 'baja'}"><i class="fa-solid fa-arrow-${sube ? 'up' : 'down'}" aria-hidden="true"></i> ${Math.abs(k.variacion).toFixed(1)}%</span> vs. periodo anterior`;
    }
    document.getElementById('k-pedidos').textContent = entero(k.pedidos);
    document.getElementById('k-ticket').textContent = `Ticket promedio ${soles(k.ticket)}`;
    document.getElementById('k-aprobacion').textContent = k.aprobacion === null ? '—' : k.aprobacion.toFixed(0) + '%';
    document.getElementById('k-intentos').textContent = `${d.pagos.aprobados} aprobados · ${d.pagos.rechazados} rechazados`;
    document.getElementById('k-atender').textContent = entero(k.porAtender);
    document.getElementById('k-req').textContent = entero(k.requerimientos);
    document.getElementById('k-req-nuevos').textContent = `${k.requerimientosNuevos} sin atender`;
    document.getElementById('k-stock').textContent = k.bajoStock
      ? `${k.bajoStock} producto(s) con stock bajo (≤ 5 unidades)` : 'Stock sin alertas';

    // Ventas por día: barras (soles) + línea (pedidos)
    const serie = d.ventasPorDia;
    const total = serie.reduce((s, x) => s + x.monto, 0);
    document.getElementById('g-ventas-total').innerHTML = `<strong>${soles(total)}</strong> en ${d.dias} días`;
    dibujar('g-ventas', {
      data: {
        labels: serie.map(x => diaCorto(x.dia)),
        datasets: [
          { type: 'bar', label: 'Ventas (S/)', data: serie.map(x => x.monto), backgroundColor: 'rgba(255,107,0,.75)', hoverBackgroundColor: COLORES.naranja, borderRadius: 3, yAxisID: 'y', order: 2 },
          { type: 'line', label: 'Pedidos', data: serie.map(x => x.pedidos), borderColor: COLORES.azul, backgroundColor: COLORES.azul, pointRadius: 0, pointHoverRadius: 4, cubicInterpolationMode: 'monotone', borderWidth: 2, yAxisID: 'y1', order: 1 },
          { type: 'line', label: 'Requerimientos', data: serie.map(x => x.requerimientos), borderColor: COLORES.verde, backgroundColor: COLORES.verde, borderDash: [4, 4], pointRadius: 0, pointHoverRadius: 4, cubicInterpolationMode: 'monotone', borderWidth: 2, yAxisID: 'y1', order: 0 }
        ]
      },
      options: {
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', align: 'end' },
          tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${c.dataset.yAxisID === 'y' ? soles(c.raw) : c.raw}` } }
        },
        scales: {
          x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 14 } },
          y: { beginAtZero: true, ticks: { callback: v => 'S/ ' + v } },
          y1: { beginAtZero: true, position: 'right', grid: { display: false }, ticks: { precision: 0 } }
        }
      }
    }, serie.some(x => x.monto || x.pedidos || x.requerimientos));

    const estados = d.pedidosPorEstado;
    dibujar('g-estados', dona(estados.map(e => e.etiqueta), estados.map(e => e.total), estados.map(e => COLOR_ESTADO[e.estado])), estados.length);

    dibujar('g-top', barrasHorizontales(d.topProductos.map(p => p.nombre), d.topProductos.map(p => p.unidades), COLORES.naranja, n => `${n} unidades`), d.topProductos.length);

    const cat = d.ventasPorCategoria;
    dibujar('g-categorias', dona(cat.map(c => c.categoria), cat.map(c => c.monto), [COLORES.naranja, COLORES.azul, COLORES.verde]), cat.length);
    if (graficos['g-categorias']) {
      graficos['g-categorias'].options.plugins.tooltip.callbacks = { label: c => ` ${c.label}: ${soles(c.raw)}` };
      graficos['g-categorias'].update();
    }

    const p = d.pagos;
    dibujar('g-pagos', dona(['Aprobados', 'Rechazados', 'Pendientes'], [p.aprobados, p.rechazados, p.pendientes], [COLORES.verde, COLORES.rojo, COLORES.amarillo]),
      p.aprobados + p.rechazados + p.pendientes > 0);

    const re = d.requerimientosPorEstado;
    dibujar('g-req-estado', {
      type: 'bar',
      data: { labels: re.map(r => r.etiqueta), datasets: [{ data: re.map(r => r.total), backgroundColor: [COLORES.naranja, COLORES.amarillo, COLORES.azul, COLORES.verde], borderRadius: 4, maxBarThickness: 46 }] },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } } }
    }, re.some(r => r.total));

    const rs = d.requerimientosPorServicio;
    dibujar('g-req-servicio', barrasHorizontales(rs.map(r => r.servicio), rs.map(r => r.total), COLORES.azul), rs.length);

    document.getElementById('ultima-actualizacion').textContent = new Intl.DateTimeFormat('es-PE', {
      hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima'
    }).format(new Date());
  }

  async function cargar() {
    const kpis = document.querySelector('.kpis');
    kpis.setAttribute('aria-busy', 'true');
    try {
      pintar(await api('/admin/dashboard?dias=' + dias));
    } catch (e) {
      aviso('No se pudo cargar el dashboard: ' + e.message, 'error');
    } finally {
      kpis.removeAttribute('aria-busy');
    }
  }

  document.querySelectorAll('.periodo button').forEach(b => b.addEventListener('click', () => {
    dias = Number(b.dataset.dias);
    document.querySelectorAll('.periodo button').forEach(x => {
      x.classList.toggle('activo', x === b);
      x.setAttribute('aria-pressed', String(x === b));
    });
    cargar();
  }));

  cargar();
  setInterval(cargar, 5 * 60 * 1000); // se refresca cada 5 minutos
}
