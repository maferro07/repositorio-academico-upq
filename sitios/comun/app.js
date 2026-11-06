/* ═══════════════════════════════════════════════════════════════════
 *  Mini Data Center · Ejercicio 1 — lógica de la página
 *  sitios/comun/app.js (compartido por los 3 nodos)
 *
 *  Dos modos de funcionamiento:
 *   · EN VIVO ...... la página está detrás del balanceador Docker: cada
 *                    petición a /whoami la responde un nodo real.
 *   · SIMULACIÓN ... abriste el HTML sin Docker (o el balanceador no
 *                    responde): el reparto se calcula aquí con los mismos
 *                    algoritmos que usa Nginx, para que puedas predecir.
 *
 *  No necesitas editar este archivo para el ejercicio, pero léelo:
 *  busca "fetch(" para ver exactamente qué peticiones hace la página.
 * ═══════════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  const CFG = window.DC_CONFIG || { nodos: [], puertos: {}, simulacion: {} };
  const YO = window.NODO || { id: 'web?', nombre: 'Nodo desconocido', color: '#64748b' };
  const P = Object.assign({ app: 8080, grafana: 3000, portainer: 9443, portainerHttp: 9000 }, CFG.puertos);
  const SIM = Object.assign({ latenciaBase: {}, pesos: {} }, CFG.simulacion);
  const PALETA_EXTRA = ['#9333ea', '#db2777', '#0891b2', '#65a30d', '#ea580c', '#4f46e5', '#0d9488', '#be123c'];
  const reducido = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
  const hora = () => new Date().toLocaleTimeString('es-MX', { hour12: false });
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ─────────────────────────── Estado ─────────────────────────── */
  const estado = {
    modo: 'detectando',        // 'vivo' | 'sim'
    algoritmoReal: null,       // lo que reporta /lb-info
    nodos: new Map(),          // id -> nodo
    rr: 0,                     // puntero de round robin
    clientes: 'uno',
    corriendo: false,
    prueba: null,              // resultados de la prueba actual
    historialLocal: [],
    visitasLocal: {},
    filasBitacora: 0
  };

  function crearNodo(n, i) {
    return {
      id: n.id, nombre: n.nombre || n.id, color: n.color || PALETA_EXTRA[i % PALETA_EXTRA.length],
      rack: n.rack || '', activo: true, conex: 0, cw: 0,
      peso: Number(SIM.pesos[n.id] ?? n.peso ?? 1) || 1,
      latencia: Number(SIM.latenciaBase[n.id] ?? 18),
      hits: 0, tiempos: [], hosts: new Set()
    };
  }
  CFG.nodos.forEach((n, i) => estado.nodos.set(n.id, crearNodo(n, i)));
  if (!estado.nodos.has(YO.id) && YO.id) estado.nodos.set(YO.id, crearNodo(YO, estado.nodos.size));

  /* ───────────────────── Identidad del nodo (hero) ───────────────────── */
  function aplicarIdentidad() {
    document.documentElement.style.setProperty('--nodo', YO.color);
    $$('[data-nodo]').forEach((el) => {
      const k = el.dataset.nodo;
      if (YO[k] !== undefined) el.textContent = YO[k];
    });
    document.title = `MiniDC · ${YO.nombre} (${YO.id})`;
    const pie = $('#pie-hora'); if (pie) pie.textContent = new Date().toLocaleString('es-MX');
  }

  /* ─────────────────────────── Diagrama SVG ─────────────────────────── */
  const NS = 'http://www.w3.org/2000/svg';
  const geo = {};          // coordenadas calculadas
  let svg;

  function el(tag, attrs = {}, padre) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (padre) padre.appendChild(e);
    return e;
  }
  function texto(padre, x, y, cls, t, extra = {}) {
    const e = el('text', Object.assign({ x, y, class: cls }, extra), padre);
    e.textContent = t; return e;
  }

  function dibujarDiagrama() {
    svg = $('#diagrama-svg');
    if (!svg) return;
    svg.innerHTML = '';
    const lista = [...estado.nodos.values()];
    const n = lista.length;
    const W = 1000, PASO = 78, ALTO_NODO = 62;
    const H = Math.max(430, 150 + n * PASO);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const cy = H / 2 + 6;
    Object.assign(geo, { W, H, cy });

    // Filtro de brillo para los paquetes
    const defs = el('defs', {}, svg);
    const f = el('filter', { id: 'brillo', x: '-100%', y: '-100%', width: '300%', height: '300%' }, defs);
    el('feGaussianBlur', { stdDeviation: '3', result: 'b' }, f);
    const m = el('feMerge', {}, f); el('feMergeNode', { in: 'b' }, m); el('feMergeNode', { in: 'SourceGraphic' }, m);

    // Borde del host
    el('rect', { x: 8, y: 8, width: W - 16, height: H - 16, rx: 16, class: 'host-borde' }, svg);
    texto(svg, 24, 30, 't3', 'HOST DOCKER · TU LAPTOP O VM');
    texto(svg, 254, 30, 't3', '── red_publica ──', { fill: '#5f86c9' });
    texto(svg, 762, 30, 't3', '── red_datos ──', { fill: '#5f86c9' });

    const capaRutas = el('g', {}, svg);
    const capaCajas = el('g', {}, svg);
    geo.capaPaquetes = el('g', {}, svg);

    // Cliente
    const cli = { x: 26, y: cy - 34, w: 150, h: 68 };
    caja(capaCajas, cli, '🌐 Navegador', 'localhost:' + P.app, '#7aa7ff');
    // Balanceador
    const lb = { x: 238, y: cy - 40, w: 170, h: 80 };
    const gLb = caja(capaCajas, lb, 'Nginx · lb', 'upstream granja_web', '#f6c343');
    geo.textoAlgo = texto(gLb, lb.x + 16, lb.y + 66, 't3', 'algoritmo: …', { fill: '#f6c343' });
    // Columna de nodos
    const xN = 486, wN = 196;
    const bloque = n * PASO - (PASO - ALTO_NODO);
    const y0 = cy - bloque / 2;
    geo.nodos = {};
    lista.forEach((nodo, i) => {
      const r = { x: xN, y: y0 + i * PASO, w: wN, h: ALTO_NODO };
      geo.nodos[nodo.id] = { ...r, cx: r.x, cy: r.y + r.h / 2 };
      cajaNodo(capaCajas, r, nodo);
    });
    // Capa de datos (derecha)
    const api = { x: 766, y: 46, w: 196, h: 58 };
    caja(capaCajas, api, '⚙️ API · Python', '/api/* → :5000', '#8bd3a0');
    const dbY = 130;
    cilindro(capaCajas, 790, dbY, 148, 78);
    const obs = { x: 766, y: H - 168, w: 196, h: 120 };
    cajaObs(capaCajas, obs);
    const port = { x: 26, y: H - 92, w: 170, h: 58 };
    caja(capaCajas, port, '🏗️ Portainer', ':' + P.portainer + ' · docker.sock', '#c084fc');

    // Rutas
    geo.rutas = {};
    geo.rutas.cli = ruta(capaRutas, `M ${cli.x + cli.w} ${cy} L ${lb.x} ${cy}`);
    for (const [id, g] of Object.entries(geo.nodos)) {
      const x1 = lb.x + lb.w, x2 = g.x, y2 = g.cy;
      geo.rutas[id] = ruta(capaRutas, `M ${x1} ${cy} C ${x1 + 50} ${cy}, ${x2 - 50} ${y2}, ${x2} ${y2}`);
    }
    // LB → API por arriba de la granja
    geo.rutas.api = ruta(capaRutas, `M ${lb.x + lb.w / 2} ${lb.y} C ${lb.x + lb.w / 2} 60, ${api.x - 120} ${api.y + 20}, ${api.x} ${api.y + 29}`);
    geo.rutas.db = ruta(capaRutas, `M ${api.x + api.w / 2} ${api.y + api.h} L ${api.x + api.w / 2} ${dbY}`);
    // Logs (punteado) de la granja hacia Alloy
    const gx = xN + wN;
    el('path', { class: 'ruta-log', d: `M ${gx} ${cy} C ${gx + 40} ${cy}, ${obs.x - 40} ${obs.y + 40}, ${obs.x} ${obs.y + 40}` }, capaRutas);
    el('path', { class: 'ruta-log', d: `M ${lb.x + lb.w / 2} ${lb.y + lb.h} C ${lb.x + lb.w / 2} ${H - 30}, ${obs.x - 60} ${H - 30}, ${obs.x} ${obs.y + 90}` }, capaRutas);
    el('path', { class: 'ruta-log', d: `M ${api.x + api.w} ${api.y + 30} C ${W - 14} ${api.y + 30}, ${W - 14} ${obs.y}, ${obs.x + obs.w - 30} ${obs.y}` }, capaRutas);

    actualizarDiagrama();
  }

  function caja(padre, r, t1, t2, acento) {
    const g = el('g', {}, padre);
    el('rect', { x: r.x, y: r.y, width: r.w, height: r.h, rx: 12, class: 'caja' }, g);
    el('rect', { x: r.x, y: r.y + 10, width: 4, height: r.h - 20, rx: 2, fill: acento }, g);
    texto(g, r.x + 16, r.y + 26, 't1', t1);
    texto(g, r.x + 16, r.y + 45, 't2', t2);
    return g;
  }

  function cajaNodo(padre, r, nodo) {
    const g = el('g', { class: 'caja-nodo', 'data-id': nodo.id, tabindex: '0', role: 'button',
      'aria-label': `${nodo.id} ${nodo.nombre}. Clic para encender o apagar en simulación` }, padre);
    el('rect', { x: r.x, y: r.y, width: r.w, height: r.h, rx: 12, class: 'caja' }, g);
    el('rect', { x: r.x, y: r.y + 10, width: 4, height: r.h - 20, rx: 2, fill: nodo.color }, g);
    el('circle', { cx: r.x + r.w - 16, cy: r.y + 15, r: 4.5, fill: '#22c55e', class: 'led' }, g);
    texto(g, r.x + 16, r.y + 25, 't1', nodo.id + (nodo.id === YO.id ? '  ★' : ''));
    texto(g, r.x + 16, r.y + 44, 't2', nodo.nombre.length > 18 ? nodo.nombre.slice(0, 17) + '…' : nodo.nombre);
    const c = texto(g, r.x + r.w - 14, r.y + 47, 'contador', '0', { 'text-anchor': 'end' });
    c.dataset.contador = nodo.id;
    if (nodo.id === YO.id) texto(g, r.x + 16, r.y + r.h + 12, 't3', 'te sirvió esta página', { fill: nodo.color });
    const alternar = () => alternarNodo(nodo.id);
    g.addEventListener('click', alternar);
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alternar(); } });
  }

  function cilindro(padre, x, y, w, h) {
    const g = el('g', {}, padre);
    const ry = 11;
    el('path', { d: `M ${x} ${y + ry} L ${x} ${y + h - ry} A ${w / 2} ${ry} 0 0 0 ${x + w} ${y + h - ry} L ${x + w} ${y + ry}`, class: 'caja' }, g);
    el('ellipse', { cx: x + w / 2, cy: y + ry, rx: w / 2, ry, class: 'caja' }, g);
    texto(g, x + w / 2, y + 44, 't1', '🗄️ MariaDB', { 'text-anchor': 'middle' });
    texto(g, x + w / 2, y + 62, 't3', 'vol: db_data', { 'text-anchor': 'middle', fill: '#f6c343' });
    return g;
  }

  function cajaObs(padre, r) {
    const g = el('g', {}, padre);
    el('rect', { x: r.x, y: r.y, width: r.w, height: r.h, rx: 12, class: 'caja' }, g);
    el('rect', { x: r.x, y: r.y + 10, width: 4, height: r.h - 20, rx: 2, fill: '#fb923c' }, g);
    texto(g, r.x + 16, r.y + 24, 't3', 'OBSERVABILIDAD', { fill: '#fb923c' });
    texto(g, r.x + 16, r.y + 50, 't1', 'Alloy → Loki');
    texto(g, r.x + 16, r.y + 72, 't1', '📊 Grafana');
    texto(g, r.x + 16, r.y + 92, 't2', ':' + P.grafana + ' · requiere login');
    return g;
  }

  function ruta(padre, d) { return el('path', { d, class: 'ruta' }, padre); }

  function actualizarDiagrama() {
    if (!svg) return;
    for (const nodo of estado.nodos.values()) {
      const g = svg.querySelector(`.caja-nodo[data-id="${CSS.escape(nodo.id)}"]`);
      if (g) g.classList.toggle('caido', !nodo.activo);
      const c = svg.querySelector(`[data-contador="${CSS.escape(nodo.id)}"]`);
      if (c) c.textContent = nodo.hits;
    }
    if (geo.textoAlgo) geo.textoAlgo.textContent = 'algoritmo: ' + (estado.modo === 'vivo' ? (estado.algoritmoReal || 'ver lb.conf') : algoritmoUI());
  }

  /* Paquete luminoso que recorre una ruta */
  let paquetesEnVuelo = 0;
  function animarPaquete(rutaEl, color = '#ffffff', ms = 380) {
    return new Promise((resolve) => {
      if (!rutaEl || reducido || paquetesEnVuelo > 60 || !geo.capaPaquetes) { resolve(); return; }
      const L = rutaEl.getTotalLength();
      const p = el('circle', { r: 5.5, fill: color, filter: 'url(#brillo)' }, geo.capaPaquetes);
      paquetesEnVuelo++;
      rutaEl.classList.add('activa');
      const t0 = performance.now();
      (function paso(t) {
        const k = Math.min(1, (t - t0) / ms);
        const e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        const pt = rutaEl.getPointAtLength(e * L);
        p.setAttribute('cx', pt.x); p.setAttribute('cy', pt.y);
        if (k < 1) requestAnimationFrame(paso);
        else { p.remove(); paquetesEnVuelo--; rutaEl.classList.remove('activa'); resolve(); }
      })(t0);
    });
  }
  function golpearNodo(id) {
    const g = svg && svg.querySelector(`.caja-nodo[data-id="${CSS.escape(id)}"]`);
    if (!g || reducido) return;
    g.classList.remove('golpe'); void g.getBBox(); g.classList.add('golpe');
  }

  /* ─────────────────────── Controles del laboratorio ─────────────────────── */
  const AYUDA = {
    round_robin: 'Cada nodo recibe una petición por turno: 1 → 2 → 3 → 1…',
    weighted: 'Como round robin, pero un nodo con weight=3 recibe 3 turnos por cada 1 de los demás (algoritmo “smooth” de Nginx).',
    least_conn: 'Envía al nodo con menos conexiones abiertas. Con concurrencia 1 se parece a round robin; súbela.',
    ip_hash: 'El mismo cliente (misma red /24) siempre llega al mismo nodo: afinidad de sesión.'
  };
  const algoritmoUI = () => $('#algoritmo').value;

  function prepararControles() {
    const enlazar = (id, fmt = (v) => v) => {
      const i = $('#' + id), o = $('#' + id + '-v');
      const upd = () => { o.textContent = fmt(i.value); };
      i.addEventListener('input', upd); upd();
    };
    enlazar('total'); enlazar('concurrencia'); enlazar('ritmo', (v) => v + ' ms');

    $('#algoritmo').addEventListener('change', () => {
      const a = algoritmoUI();
      $('#algoritmo-ayuda').textContent = AYUDA[a];
      $('#control-clientes').classList.toggle('oculto', a !== 'ip_hash');
      $$('.toggle-nodo .peso').forEach((p) => p.classList.toggle('oculto', a !== 'weighted'));
      estado.rr = 0; for (const nd of estado.nodos.values()) nd.cw = 0;
      actualizarDiagrama();
    });
    $$('[data-clientes]').forEach((b) => b.addEventListener('click', () => {
      estado.clientes = b.dataset.clientes;
      $$('[data-clientes]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    }));
    $('#lanzar').addEventListener('click', () => (estado.corriendo ? detener() : lanzarPrueba()));
    $('#reiniciar').addEventListener('click', reiniciarContadores);
    $('#guardar').addEventListener('click', guardarPrueba);
    pintarToggles();
    pintarMedidores();
  }

  function pintarToggles() {
    const caja = $('#toggles');
    caja.innerHTML = '';
    const vivo = estado.modo === 'vivo';
    for (const nodo of estado.nodos.values()) {
      const fila = document.createElement('label');
      fila.className = 'toggle-nodo';
      fila.innerHTML = `<input type="checkbox" class="interruptor" ${nodo.activo ? 'checked' : ''} ${vivo ? 'disabled' : ''} aria-label="Encender ${esc(nodo.id)}">
        <span class="punto" style="background:${esc(nodo.color)}"></span>
        <span><b class="mono">${esc(nodo.id)}</b> <span style="color:var(--texto-3)">${esc(nodo.nombre)}</span></span>
        <span class="peso ${algoritmoUI() === 'weighted' ? '' : 'oculto'}">w=<input type="number" min="1" max="10" value="${nodo.peso}" ${vivo ? 'disabled' : ''} aria-label="Peso de ${esc(nodo.id)}"></span>`;
      fila.querySelector('.interruptor').addEventListener('change', (e) => { nodo.activo = e.target.checked; refrescarNodos(); });
      fila.querySelector('.peso input').addEventListener('change', (e) => {
        nodo.peso = Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 1)); e.target.value = nodo.peso;
      });
      caja.appendChild(fila);
    }
  }

  function alternarNodo(id) {
    if (estado.modo === 'vivo') {
      aviso(`En modo en vivo apaga el nodo de verdad: docker compose stop ${id}`);
      return;
    }
    const nodo = estado.nodos.get(id); if (!nodo) return;
    nodo.activo = !nodo.activo;
    pintarToggles(); refrescarNodos();
  }
  function refrescarNodos() { actualizarDiagrama(); pintarMedidores(); }

  function pintarMedidores() {
    const caja = $('#medidores');
    const total = [...estado.nodos.values()].reduce((s, n) => s + n.hits, 0);
    caja.innerHTML = '';
    for (const nodo of estado.nodos.values()) {
      const pct = total ? (nodo.hits / total) * 100 : 0;
      const prom = nodo.tiempos.length ? nodo.tiempos.reduce((a, b) => a + b, 0) / nodo.tiempos.length : 0;
      const d = document.createElement('div');
      d.className = 'medidor' + (nodo.activo ? '' : ' caido');
      d.style.setProperty('--c', nodo.color);
      d.innerHTML = `<div class="cab"><b>${esc(nodo.id)}</b><span>${esc(nodo.nombre)}</span></div>
        <div class="cifra">${nodo.hits}</div>
        <div class="barra-pct"><i style="width:${pct.toFixed(1)}%"></i></div>
        <div class="meta"><span>${pct.toFixed(1)} %</span><span>${prom ? prom.toFixed(1) + ' ms' : '—'}</span></div>`;
      caja.appendChild(d);
    }
  }

  function reiniciarContadores() {
    for (const n of estado.nodos.values()) { n.hits = 0; n.tiempos = []; n.conex = 0; n.cw = 0; }
    estado.rr = 0; estado.prueba = null; estado.filasBitacora = 0;
    $('#bitacora').innerHTML = '<tr><td colspan="6" class="vacio">Lanza una prueba para ver la bitácora del balanceador.</td></tr>';
    ['total', 'ok', 'fallos'].forEach((k) => { $('#kpi-' + k).textContent = '0'; });
    $('#kpi-ms').textContent = '— ms'; $('#kpi-eq').textContent = '—';
    $('#kpi-fallos-caja').classList.remove('mal');
    $('#guardar').disabled = true;
    refrescarNodos();
  }

  /* ─────────────────── Algoritmos de balanceo (simulación) ───────────────────
   * Reproducen la lógica de Nginx para que puedas PREDECIR el resultado real. */
  const IPS_LOCALES = ['192.168.1.37'];
  const IPS_VARIAS = ['10.0.1.15', '10.0.2.20', '172.16.5.9', '192.168.1.37', '192.168.7.4', '10.8.0.2',
    '172.20.3.33', '10.0.9.120', '192.168.50.11', '10.1.1.1', '172.31.0.8', '10.44.2.5'];

  function elegirNodo(ipCliente) {
    const activos = [...estado.nodos.values()].filter((n) => n.activo);
    if (!activos.length) return null;
    switch (algoritmoUI()) {
      case 'weighted': {             // smooth weighted round robin (como Nginx)
        let mejor = null, total = 0;
        for (const n of activos) {
          n.cw += n.peso; total += n.peso;
          if (!mejor || n.cw > mejor.cw) mejor = n;
        }
        mejor.cw -= total;
        return mejor;
      }
      case 'least_conn': {           // menos conexiones activas; empate → por turno
        const min = Math.min(...activos.map((n) => n.conex));
        const empatados = activos.filter((n) => n.conex === min);
        return empatados[(estado.rr++) % empatados.length];
      }
      case 'ip_hash': {              // hash de los 3 primeros octetos (como Nginx)
        const todos = [...estado.nodos.values()];
        const oct = ipCliente.split('.').slice(0, 3).map(Number);
        let hash = 89;
        for (let intento = 0; intento < 20; intento++) {
          for (const o of oct) hash = (hash * 113 + o) % 6271;
          const n = todos[hash % todos.length];
          if (n.activo) return n;    // si el elegido está caído, re-hashea
        }
        return activos[0];
      }
      default: {                     // round robin
        const n = activos[estado.rr % activos.length];
        estado.rr++;
        return n;
      }
    }
  }

  async function peticionSimulada(i) {
    const ips = estado.clientes === 'uno' ? IPS_LOCALES : IPS_VARIAS;
    const ip = ips[i % ips.length];
    const nodo = elegirNodo(ip);
    if (!nodo) { await dormir(30); return { ok: false, estado: 502, ms: 30, nodo: null, host: 'sin nodos activos' }; }
    nodo.conex++;
    const ms = nodo.latencia * (0.7 + Math.random() * 0.8) + nodo.conex * 3;
    await dormir(ms);
    nodo.conex--;
    return { ok: true, estado: 200, ms, nodo: nodo.id, host: 'simulado · ' + ip };
  }

  /* ─────────────────────── Petición real (modo en vivo) ─────────────────────── */
  function claveNodo(d) {
    if (d.nodo === 'auto' || !d.nodo) return 'r-' + String(d.host || '?').slice(0, 6); // reto --scale
    return d.nodo;
  }
  function asegurarNodo(id, d) {
    if (estado.nodos.has(id)) return estado.nodos.get(id);
    const nuevo = crearNodo({ id, nombre: d.nombre && d.nombre !== 'auto' ? d.nombre : 'Réplica ' + id.slice(2),
      color: /^#[0-9a-f]{6}$/i.test(d.color || '') ? d.color : null }, estado.nodos.size);
    estado.nodos.set(id, nuevo);
    dibujarDiagrama(); pintarToggles();
    return nuevo;
  }
  async function peticionReal(i) {
    const t0 = performance.now();
    try {
      const r = await fetch(`/whoami?p=${i}&t=${Date.now()}`, { cache: 'no-store' });
      const ms = performance.now() - t0;
      if (!r.ok) return { ok: false, estado: r.status, ms, nodo: r.headers.get('X-Nodo'), host: '—' };
      const d = await r.json();
      const id = claveNodo(d);
      asegurarNodo(id, d);
      estado.nodos.get(id).hosts.add(d.host);
      return { ok: true, estado: r.status, ms, nodo: id, host: d.host };
    } catch (e) {
      return { ok: false, estado: 'ERR', ms: performance.now() - t0, nodo: null, host: e.name };
    }
  }

  /* ───────────────────────────── La prueba ───────────────────────────── */
  async function lanzarPrueba() {
    reiniciarContadores();
    estado.corriendo = true;
    const btn = $('#lanzar');
    btn.textContent = '■ Detener'; btn.dataset.estado = 'corriendo';
    const total = +$('#total').value, conc = +$('#concurrencia').value, ritmo = +$('#ritmo').value;
    const algoritmo = estado.modo === 'vivo' ? (estado.algoritmoReal || 'nginx') : algoritmoUI();
    const pr = estado.prueba = { total: 0, exitos: 0, fallos: 0, tiempos: [], algoritmo, t0: performance.now() };
    let enviados = 0;

    const trabajador = async () => {
      while (estado.corriendo && enviados < total) {
        const i = ++enviados;
        pr.total++;
        $('#kpi-total').textContent = pr.total;
        const ida = animarPaquete(geo.rutas && geo.rutas.cli, '#cfe0ff', ritmo ? 260 : 120);
        const res = estado.modo === 'vivo' ? await peticionReal(i) : await peticionSimulada(i);
        if (ritmo) await ida;            // con pausa 0, la prueba no espera a la animación
        registrar(i, res);
        if (res.ok && geo.rutas && geo.rutas[res.nodo]) {
          const nodo = estado.nodos.get(res.nodo);
          animarPaquete(geo.rutas[res.nodo], nodo ? nodo.color : '#fff', ritmo ? 320 : 140).then(() => golpearNodo(res.nodo));
        }
        if (ritmo) await dormir(ritmo);
      }
    };
    await Promise.all(Array.from({ length: conc }, trabajador));
    detener();
  }

  function detener() {
    estado.corriendo = false;
    const btn = $('#lanzar');
    btn.textContent = '▶ Lanzar prueba'; delete btn.dataset.estado;
    if (estado.prueba && estado.prueba.total) $('#guardar').disabled = false;
  }

  function registrar(i, res) {
    const pr = estado.prueba;
    if (res.ok) {
      pr.exitos++;
      const nodo = estado.nodos.get(res.nodo);
      if (nodo) { nodo.hits++; nodo.tiempos.push(res.ms); }
    } else pr.fallos++;
    pr.tiempos.push(res.ms);

    $('#kpi-ok').textContent = pr.exitos;
    $('#kpi-fallos').textContent = pr.fallos;
    $('#kpi-fallos-caja').classList.toggle('mal', pr.fallos > 0);
    $('#kpi-ms').textContent = (pr.tiempos.reduce((a, b) => a + b, 0) / pr.tiempos.length).toFixed(1) + ' ms';
    $('#kpi-eq').textContent = equilibrio();

    const tb = $('#bitacora');
    if (estado.filasBitacora === 0) tb.innerHTML = '';
    estado.filasBitacora++;
    const nodo = res.nodo && estado.nodos.get(res.nodo);
    const tr = document.createElement('tr');
    tr.className = 'nueva';
    tr.innerHTML = `<td class="mono">${i}</td><td class="mono">${hora()}</td>
      <td>${nodo ? `<span class="chip-nodo" style="--c:${esc(nodo.color)}">${esc(nodo.id)}</span>` : '<span class="estado-mal">—</span>'}</td>
      <td class="${res.ok ? 'estado-ok' : 'estado-mal'}">${esc(res.estado)}</td>
      <td class="mono">${res.ms.toFixed(1)}</td><td class="mono">${esc(res.host || '')}</td>`;
    tb.prepend(tr);
    while (tb.rows.length > 80) tb.deleteRow(tb.rows.length - 1);
    refrescarNodos();
  }

  /* Qué tan cerca está el reparto del ideal (100 % = idéntico) */
  function equilibrio() {
    const activos = [...estado.nodos.values()].filter((n) => n.activo || n.hits);
    const total = activos.reduce((s, n) => s + n.hits, 0);
    if (!total || !activos.length) return '—';
    const usarPesos = estado.modo === 'sim' && algoritmoUI() === 'weighted';
    const sumaP = activos.reduce((s, n) => s + (usarPesos ? n.peso : 1), 0);
    let desv = 0;
    for (const n of activos) desv += Math.abs(n.hits / total - (usarPesos ? n.peso : 1) / sumaP);
    return Math.max(0, 100 - desv * 50).toFixed(0) + ' %';
  }

  /* ─────────────────────── Persistencia (MariaDB) ─────────────────────── */
  async function guardarPrueba() {
    const pr = estado.prueba; if (!pr) return;
    const distribucion = {};
    for (const n of estado.nodos.values()) if (n.hits) distribucion[n.id] = n.hits;
    const cuerpo = {
      algoritmo: pr.algoritmo, total: pr.total, exitos: pr.exitos, fallos: pr.fallos,
      t_prom_ms: pr.tiempos.reduce((a, b) => a + b, 0) / Math.max(1, pr.tiempos.length), distribucion
    };
    const btn = $('#guardar'); btn.disabled = true;
    // Paquete visual: LB → API → MariaDB
    animarPaquete(geo.rutas.api, '#8bd3a0', 420).then(() => animarPaquete(geo.rutas.db, '#f6c343', 300));
    if (estado.modo === 'vivo') {
      try {
        const r = await fetch('/api/pruebas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        aviso('✅ Prueba guardada en MariaDB (tabla pruebas).');
        cargarHistorial(); cargarVisitas();
      } catch (e) {
        aviso('⚠️ No se pudo guardar: ' + e.message + '. ¿Está arriba el contenedor api y db?');
        btn.disabled = false;
      }
    } else {
      estado.historialLocal.unshift(Object.assign({ fecha: new Date().toLocaleString('es-MX') }, cuerpo));
      pintarHistorial(estado.historialLocal);
      aviso('💾 Guardada en memoria (simulación). Con Docker se guardaría en MariaDB.');
    }
  }

  async function cargarHistorial() {
    try {
      const r = await fetch('/api/pruebas', { cache: 'no-store' });
      if (!r.ok) throw 0;
      const d = await r.json();
      pintarHistorial(d.pruebas || []);
    } catch { /* la sección se queda con su mensaje */ }
  }

  function pintarHistorial(filas) {
    const tb = $('#historial');
    if (!filas.length) { tb.innerHTML = '<tr><td colspan="6" class="vacio">Aún no hay pruebas guardadas.</td></tr>'; return; }
    tb.innerHTML = filas.map((f) => {
      const dist = f.distribucion || {};
      const tot = Object.values(dist).reduce((a, b) => a + b, 0) || 1;
      const barras = Object.entries(dist).map(([id, v]) => {
        const c = (estado.nodos.get(id) || {}).color || '#94a3b8';
        return `<i style="width:${(v / tot) * 100}%;background:${esc(c)}" title="${esc(id)}: ${v}"></i>`;
      }).join('');
      const fecha = String(f.fecha).replace('T', ' ').slice(0, 19);
      return `<tr><td class="mono">${esc(fecha)}</td><td class="mono">${esc(f.algoritmo)}</td><td class="mono">${f.total}</td>
        <td class="mono"><span class="estado-ok">${f.exitos}</span> / <span class="${f.fallos ? 'estado-mal' : ''}">${f.fallos}</span></td>
        <td><div class="apilada">${barras}</div></td><td class="mono">${Number(f.t_prom_ms).toFixed(1)}</td></tr>`;
    }).join('');
  }

  async function cargarVisitas() {
    let filas = [];
    if (estado.modo === 'vivo') {
      try { const r = await fetch('/api/visitas', { cache: 'no-store' }); if (r.ok) filas = (await r.json()).visitas || []; } catch { /* nada */ }
    } else {
      filas = Object.entries(estado.visitasLocal).map(([nodo, visitas]) => ({ nodo, visitas }));
    }
    const caja = $('#visitas');
    if (!filas.length) { caja.innerHTML = '<p style="color:var(--texto-3); margin:0">Sin visitas registradas todavía.</p>'; return; }
    const max = Math.max(...filas.map((f) => f.visitas));
    caja.innerHTML = filas.map((f) => {
      const c = (estado.nodos.get(f.nodo) || {}).color || '#94a3b8';
      return `<div class="medidor" style="--c:${esc(c)}"><div class="cab"><b>${esc(f.nodo)}</b><span>visitas</span></div>
        <div class="cifra">${f.visitas}</div><div class="barra-pct"><i style="width:${(f.visitas / max) * 100}%"></i></div></div>`;
    }).join('');
  }

  /* ─────────────────────── Detección de modo y servicios ─────────────────────── */
  async function conTiempo(url, ms = 2000, opciones = {}) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    try { return await fetch(url, Object.assign({ cache: 'no-store', signal: ctl.signal }, opciones)); }
    finally { clearTimeout(t); }
  }

  function svc(nombre, e, detalle) {
    const s = $(`[data-svc="${nombre}"]`); if (!s) return;
    s.dataset.e = e;
    if (detalle !== undefined) s.querySelector('span').textContent = detalle;
  }

  async function detectarModo() {
    let vivo = false;
    if (location.protocol.startsWith('http')) {
      try {
        // Preguntamos "¿quién soy?" hasta que conteste ESTE nodo (con round robin bastan ~3 intentos)
        for (let intento = 0; intento < 8; intento++) {
          const r = await conTiempo('/whoami?inicio=' + intento + '-' + Date.now(), 2500);
          if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) break;
          const d = await r.json();
          vivo = !!d.nodo;
          if (d.nodo === YO.id || d.nodo === 'auto') { $('#ficha-host').textContent = d.host; $('#ficha-ip').textContent = d.ip; break; }
          $('#ficha-host').textContent = 'no coincidió (¿ip_hash?)';
        }
      } catch { /* sin balanceador */ }
    }
    estado.modo = vivo ? 'vivo' : 'sim';
    const m = $('#modo');
    if (vivo) {
      m.className = 'modo vivo'; m.textContent = 'En vivo · Docker';
      m.title = 'Las peticiones las atienden contenedores reales a través del balanceador.';
    } else {
      m.className = 'modo sim'; m.textContent = 'Simulación';
      m.title = 'No se detectó el balanceador: el reparto se calcula en el navegador con los algoritmos de Nginx.';
      $('#ficha-host').textContent = 'sin contenedor (simulación)';
      $('#ficha-ip').textContent = '—';
    }
    $('#aviso-vivo').classList.toggle('oculto', !vivo);
    $('#algoritmo').disabled = vivo;
    pintarToggles();
  }

  async function revisarServicios() {
    const host = location.hostname || 'localhost';
    const urlGrafana = `http://${host}:${P.grafana}`;
    const urlPortainer = `https://${host}:${P.portainer}`;
    $('#link-grafana').href = urlGrafana;
    $('#link-portainer').href = urlPortainer;

    if (estado.modo !== 'vivo') {
      ['lb', 'nodos', 'api', 'db', 'grafana', 'portainer'].forEach((s) => svc(s, 'sim', s === 'lb' ? 'simulado' : 'sin Docker'));
      return;
    }
    svc('lb', 'ok', ':' + (location.port || 80));
    try {
      const r = await conTiempo('/lb-info', 2000);
      if (r.ok) { const d = await r.json(); estado.algoritmoReal = d.algoritmo; }
    } catch { /* opcional */ }
    if (estado.algoritmoReal) {
      const sel = $('#algoritmo');
      if ([...sel.options].some((o) => o.value === estado.algoritmoReal)) sel.value = estado.algoritmoReal;
      $('#algoritmo-ayuda').textContent = 'Reportado por /lb-info: ' + estado.algoritmoReal + '. Cámbialo en nginx/lb.conf.';
    }
    try {
      const r = await conTiempo('/api/salud', 3000);
      const d = r.ok ? await r.json() : {};
      svc('api', d.api ? 'ok' : 'mal', d.api ? 'ok' : 'sin respuesta');
      svc('db', d.db ? 'ok' : 'mal', d.db ? 'conectada' : 'sin conexión');
    } catch { svc('api', 'mal', 'sin respuesta'); svc('db', 'mal', '?'); }

    // Sondeo de puertos: una respuesta "opaca" (no-cors) basta para saber que hay alguien escuchando
    const sondear = async (nombre, url) => {
      try { await conTiempo(url, 2500, { mode: 'no-cors' }); svc(nombre, 'ok', 'responde'); }
      catch { svc(nombre, 'mal', 'no responde'); }
    };
    sondear('grafana', urlGrafana + '/api/health');
    sondear('portainer', `http://${host}:${P.portainerHttp}/api/system/status`);

    // ¿Cuántos nodos distintos contestan? (6 peticiones rápidas)
    const vistos = new Set();
    for (let i = 0; i < 6; i++) {
      try { const r = await conTiempo('/whoami?ping=' + i + '-' + Date.now(), 1500); if (r.ok) vistos.add((await r.json()).nodo); } catch { /* */ }
    }
    svc('nodos', vistos.size ? 'ok' : 'mal', vistos.size + ' respondiendo');
  }

  async function registrarVisita() {
    if (estado.modo === 'vivo') {
      try {
        await fetch('/api/visitas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nodo: YO.id }) });
      } catch { /* la página sigue funcionando sin API */ }
    } else {
      estado.visitasLocal[YO.id] = (estado.visitasLocal[YO.id] || 0) + 1;
    }
    cargarVisitas();
  }

  /* ─────────────────────── Utilidades de interfaz ─────────────────────── */
  let avisoT;
  function aviso(msg) {
    let a = $('#aviso-flotante');
    if (!a) {
      a = document.createElement('div');
      a.id = 'aviso-flotante';
      a.setAttribute('role', 'status');
      a.style.cssText = 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:50;max-width:min(92vw,560px);' +
        'background:#0d1626;color:#e7eefb;border:1px solid #2b3d5e;border-radius:12px;padding:12px 16px;font-size:.9rem;box-shadow:0 10px 30px rgba(0,0,0,.3)';
      document.body.appendChild(a);
    }
    a.textContent = msg; a.hidden = false;
    clearTimeout(avisoT); avisoT = setTimeout(() => { a.hidden = true; }, 4200);
  }

  function botonesCopiar() {
    $$('pre.codigo').forEach((pre) => {
      const b = document.createElement('button');
      b.className = 'copiar'; b.type = 'button'; b.textContent = 'Copiar';
      b.addEventListener('click', async () => {
        const t = pre.innerText.replace(/^Copiar\s*/, '').replace(/\nCopiar$/, '').trim();
        try { await navigator.clipboard.writeText(t); b.textContent = '¡Copiado!'; }
        catch { b.textContent = 'Selecciona y copia'; }
        setTimeout(() => { b.textContent = 'Copiar'; }, 1500);
      });
      pre.appendChild(b);
    });
  }

  function preparTema() {
    const raiz = document.documentElement;
    try { const t = localStorage.getItem('minidc-tema'); if (t) raiz.dataset.theme = t; } catch { /* sin storage */ }
    $('#btn-tema').addEventListener('click', () => {
      const oscuro = raiz.dataset.theme ? raiz.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
      raiz.dataset.theme = oscuro ? 'light' : 'dark';
      try { localStorage.setItem('minidc-tema', raiz.dataset.theme); } catch { /* */ }
    });
    $('#btn-lapices').addEventListener('click', () => document.body.classList.toggle('sin-lapices'));
  }

  /* ─────────────────────────────── Arranque ─────────────────────────────── */
  async function iniciar() {
    aplicarIdentidad();
    preparTema();
    prepararControles();
    dibujarDiagrama();
    botonesCopiar();
    await detectarModo();
    actualizarDiagrama();
    registrarVisita();
    if (estado.modo === 'vivo') cargarHistorial();
    revisarServicios().then(actualizarDiagrama);
    // Paquete de bienvenida: muestra el camino que siguió ESTA página
    setTimeout(() => {
      animarPaquete(geo.rutas.cli, '#cfe0ff', 500).then(() =>
        animarPaquete(geo.rutas[YO.id], YO.color, 520).then(() => golpearNodo(YO.id)));
    }, 500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
