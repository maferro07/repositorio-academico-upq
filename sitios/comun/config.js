/* ═══════════════════════════════════════════════════════════════════
 *  ✏️ ZONA EDITABLE B · Configuración COMPARTIDA por todos los nodos
 *  Archivo: sitios/comun/config.js  (montado en los 3 contenedores web)
 *
 *  Si agregas un nodo en nginx/lb.conf y en docker-compose.yml,
 *  agrégalo también aquí para que aparezca en el diagrama.
 *  (Aunque lo olvides, la prueba en vivo lo detecta y lo dibuja sola.)
 * ═══════════════════════════════════════════════════════════════════ */
window.DC_CONFIG = {
  proyecto: "Mini Data Center · Ejercicio 1",
  curso: "Centro de Datos · Ing. en Datos e IA",

  // Debe reflejar los "server" del upstream granja_web en nginx/lb.conf
  nodos: [
    { id: "web1", nombre: "Nodo Alfa",  color: "#1f6feb", rack: "Rack A · U12" },
    { id: "web2", nombre: "Nodo Beta",  color: "#d97706", rack: "Rack A · U14" },
    { id: "web3", nombre: "Nodo Gamma", color: "#16a34a", rack: "Rack B · U08" },
    // { id: "web4", nombre: "Nodo Delta", color: "#9333ea", rack: "Rack B · U10" },
  ],

  // Puertos publicados en el host (docker-compose.yml → ports)
  puertos: { app: 8080, grafana: 3000, portainer: 9443, portainerHttp: 9000 },

  // Solo para el MODO SIMULACIÓN (cuando abres el HTML sin Docker):
  // latencia base en ms de cada nodo. web3 es "más lento" a propósito
  // para que least_conn tenga algo que demostrar.
  simulacion: {
    latenciaBase: { web1: 14, web2: 18, web3: 34 },
    pesos:        { web1: 1,  web2: 1,  web3: 1 }
  }
};
