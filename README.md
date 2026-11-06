# Mini Data Center con Docker · Ejercicio 1
## Balanceo de carga con Nginx + persistencia + monitoreo

**Asignatura:** Centro de Datos · Ing. en Datos e Inteligencia Artificial
**Sello A:** Mini Data Center con Docker

> *“Dime y lo olvido, enséñamelo y lo recuerdo, involúcrame y lo aprendo.”*

---

### 1. ¿Qué vas a construir?

Un mini centro de datos de **10 contenedores** dentro de tu laptop o VM (local o en la nube):

| Capa | Servicio | Imagen | Puerto host | Para qué sirve |
|---|---|---|---|---|
| Entrada | `lb` | nginx:1.28-alpine | **8080** | Balanceador de carga (la “recepcionista”) |
| Granja web | `web1`, `web2`, `web3` | nginx:1.28-alpine | — (internos) | Tres páginas estáticas **distintas** |
| Datos | `api` | imagen propia (`./api/Dockerfile`) | — | Puente HTTP → MariaDB |
| Datos | `db` | mariadb:11.4 | 127.0.0.1:3307 | Visitas y pruebas de carga (volumen `db_data`) |
| Observabilidad | `alloy` | grafana/alloy | 127.0.0.1:12345 | Recolecta los logs de cada contenedor |
| Observabilidad | `loki` | grafana/loki | — | Base de datos de logs |
| Observabilidad | `grafana` | grafana/grafana | **3000** | Tableros con **usuario y contraseña** |
| Gestión | `portainer` | portainer-ce:lts | **9443** / 9000 | Consola visual de Docker |

```
Navegador ──:8080──▶ lb (Nginx) ──┬──▶ web1  (sitios/web1)
                                  ├──▶ web2  (sitios/web2)
                                  ├──▶ web3  (sitios/web3)
                                  └─/api/──▶ api ──▶ db (MariaDB · vol db_data)
stdout de todos ──▶ alloy ──▶ loki ──▶ grafana :3000      portainer :9443 ── docker.sock
```

Redes separadas por capas: `red_publica` (lb, web, api), `red_datos` (api, db, loki, grafana, alloy) y `red_gestion` (portainer). **Los nodos web no pueden ver la base de datos.**

---

### 2. Requisitos

- Docker Desktop (Windows/macOS) o Docker Engine + plugin Compose (Linux / VM en la nube).
- ~3 GB de RAM libres y ~2 GB de disco para imágenes.
- Comprueba: `docker --version` y `docker compose version` (Compose v2).

---

### 3. Estructura del proyecto

```
minidc-ejercicio1/
├── docker-compose.yml          ← la "receta" de todo el data center
├── .env.example                ← plantilla de secretos (cópiala como .env)
├── nginx/
│   ├── lb.conf                 ← ✏️ ZONAS 1 y 2: algoritmo, nodos y pesos
│   └── nodo.conf.template      ← plantilla común de los 3 nodos web
├── sitios/
│   ├── comun/                  ← CSS, JS y config.js compartidos (✏️ ZONAS B y C)
│   ├── web1/index.html         ← ✏️ ZONA A: identidad del Nodo Alfa
│   ├── web2/index.html         ← ✏️ ZONA A: identidad del Nodo Beta
│   └── web3/index.html         ← ✏️ ZONA A: identidad del Nodo Gamma
├── api/  (Dockerfile + app.py) ← imagen propia: puente a MariaDB
├── mariadb/init/               ← esquema y usuarios (solo la 1.ª vez)
├── observabilidad/             ← configuración de Loki y Alloy
├── grafana/                    ← fuentes de datos y tablero ya aprovisionados
└── pruebas/                    ← carga.sh (Linux/macOS) y carga.ps1 (Windows)
```

---

### 4. Arranque paso a paso

```bash
# 1) Secretos: copia la plantilla y CAMBIA las contraseñas
cp .env.example .env            # Windows: copy .env.example .env

# 2) Levanta todo (la 1.ª vez descarga imágenes y construye la API)
docker compose up -d --build

# 3) Verifica: todos deben decir "running" y los que tienen healthcheck "healthy"
docker compose ps
```

Abre en el navegador:

| URL | Qué verás |
|---|---|
| http://localhost:8080 | La app balanceada. Pulsa **F5** varias veces: cambia de nodo y de color. |
| http://localhost:3000 | Grafana → entra con `GRAFANA_ADMIN_USER` / `GRAFANA_ADMIN_PASSWORD` de tu `.env`. |
| https://localhost:9443 | Portainer → crea el usuario admin (mín. 12 caracteres) **en menos de 5 min**. Acepta el certificado autofirmado. |

> **VM en la nube:** cambia `localhost` por la IP pública y abre en el firewall / grupo de seguridad **solo** los puertos 8080, 3000 y 9443 (nunca el de MariaDB).

> **Sin Docker todavía:** abre `sitios/web1/index.html` con doble clic. La página entra en **modo simulación** y puedes practicar los algoritmos de balanceo.

---

### 5. Lo que tienes que hacer (y evidenciar)

1. **Balanceo:** en la sección *Laboratorio* lanza 30 peticiones con round robin. Debe salir ≈ 10/10/10.
   Compara con la terminal: `bash pruebas/carga.sh 30` o `.\pruebas\carga.ps1 -Total 30`.
2. **Persistencia:** guarda 3 pruebas con *💾 Guardar en MariaDB*. Ejecuta `docker compose down` y `docker compose up -d`. ¿Siguen ahí? Ahora `docker compose down -v`. ¿Y ahora? Explica por qué.
3. **Portainer:** localiza los 10 contenedores, las 3 redes y los 4 volúmenes. Abre los logs de `lb` desde la interfaz.
4. **Grafana:** abre el tablero *Mini Data Center · Balanceo y bitácoras*. Lanza una prueba y observa cómo crecen las barras por nodo.
5. **Retos (sección 05 de la página):** pesos, `ip_hash`/`least_conn`, failover, 4.º nodo, `--scale`, seguridad.

#### Evidencias para la bitácora semanal (documento + video por equipo)

| Criterio de la rúbrica | Evidencia sugerida |
|---|---|
| Contenido técnico (30 %) | Explica `upstream`, el mapeo `8080:80`, volumen vs. bind mount, por qué `init/` corre una sola vez, y la triada CIA del ejercicio. |
| Claridad expositiva (30 %) | Recorre el diagrama de la página en el video: de tu navegador hasta MariaDB y Grafana. |
| Creatividad y estructura (20 %) | Personaliza los 3 nodos (ZONA A) con una metáfora propia del equipo. |
| Funcionamiento (20 %) | Capturas de `docker compose ps` (healthy), del laboratorio, del tablero de Grafana y del reto de failover sin fallos. |

---

### 6. Comandos que vas a usar mucho

```bash
docker compose ps                                   # estado de los servicios
docker compose logs -f lb                           # bitácora JSON del balanceador
curl -s http://localhost:8080/whoami                # ¿qué nodo me respondió?
docker compose exec lb nginx -t                     # valida lb.conf
docker compose exec lb nginx -s reload              # aplica cambios sin cortar el servicio
docker compose stop web2 && docker compose start web2   # simula una falla
docker compose exec db mariadb -uroot -p dc_app     # entra a la base de datos
docker stats --no-stream                            # CPU/RAM por contenedor
docker volume inspect minidc_db_data                # dónde vive el volumen
docker compose down          # apaga (conserva datos)   |   down -v  → borra volúmenes
```

---

### 7. Solución de problemas

| Síntoma | Causa probable / solución |
|---|---|
| `required variable ... is missing` | No creaste `.env`. Haz `cp .env.example .env`. |
| `port is already allocated` / `bind: An attempt was made to access a socket in a way forbidden` | Otro programa (MySQL, XAMPP, otra app) usa ese puerto, o Windows lo reservó. Revisa con `netstat -ano \| findstr :3307` y `netsh interface ipv4 show excludedportrange protocol=tcp`. Cambia `LB_PUERTO`, `GRAFANA_PUERTO` o `DB_PUERTO` en `.env`. |
| La API dice “sin conexión” a MariaDB | La BD tarda ~20 s la primera vez. Revisa `docker compose logs db`. |
| Cambié `.env` o `init/` y no pasa nada | Los scripts de `init/` y la contraseña de Grafana solo se aplican al **crear** el volumen: `docker compose down -v` (borra datos). |
| `02_usuarios.sh: $'\r': command not found` | Git convirtió el archivo a CRLF en Windows. Guárdalo con fin de línea **LF** (VS Code, esquina inferior derecha). |
| Portainer: “timed out for security reasons” | No creaste el admin en 5 min: `docker compose restart portainer`. |
| Grafana sin datos en paneles de logs | Espera ~30 s y lanza una prueba. Revisa `docker compose logs alloy`. |
| `host not found in upstream` | Usas una imagen de Nginx < 1.27.3 (no soporta `resolve`). Deja `nginx:1.28-alpine`. |
| `invalid parameter "resolve"` | Igual que el anterior. |
| La página dice “Simulación” estando en Docker | Entraste por un puerto que no es el del balanceador. Usa `:8080`. |

---

### 8. Nota sobre el reto 6 (`--scale`)

Al usar `NODO_ID: auto`, todas las réplicas firman `X-Nodo: auto`; la página las distingue por el nombre del contenedor. En Grafana agrupa por `upstream` en lugar de `nodo`:

```
sum by (upstream) (count_over_time({servicio="lb"} | json | __error__="" [10s]))
```
