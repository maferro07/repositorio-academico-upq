"""
API mínima del Mini Data Center (Ejercicio 1).

La página web es estática: no puede hablar con MariaDB directamente.
Esta API es el "puente": recibe JSON por HTTP y lo guarda en la base.

Endpoints (todos detrás del balanceador, en /api/...):
  GET  /api/salud     -> estado de la API y de la conexión a MariaDB
  POST /api/visitas   -> registra qué nodo sirvió la página   {"nodo":"web1"}
  GET  /api/visitas   -> conteo de visitas por nodo
  POST /api/pruebas   -> guarda el resultado de una prueba de carga
  GET  /api/pruebas   -> últimas 15 pruebas

Buenas prácticas que se ilustran (triada CIA):
  - Confidencialidad: credenciales por variables de entorno, nunca en el código.
  - Integridad: consultas parametrizadas (anti SQL-injection) y validación de datos.
  - Disponibilidad: healthcheck en /api/salud y reintentos de conexión.
"""
import json
import os
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pymysql

DB = dict(
    host=os.environ.get("DB_HOST", "db"),
    user=os.environ.get("DB_USER", "app_user"),
    password=os.environ.get("DB_PASSWORD", ""),
    database=os.environ.get("DB_NAME", "dc_app"),
    charset="utf8mb4",
    cursorclass=pymysql.cursors.DictCursor,
    connect_timeout=3,
    autocommit=True,
)
PUERTO = int(os.environ.get("API_PUERTO", "5000"))
NODO_VALIDO = re.compile(r"^[A-Za-z0-9_.-]{1,32}$")
MAX_CUERPO = 64 * 1024


def conectar():
    return pymysql.connect(**DB)


def consulta(sql, params=(), una=False):
    """Ejecuta SQL parametrizado. Nunca concatenes texto del usuario en el SQL."""
    con = conectar()
    try:
        with con.cursor() as cur:
            cur.execute(sql, params)
            if sql.lstrip().upper().startswith("SELECT"):
                return cur.fetchone() if una else cur.fetchall()
            return cur.lastrowid
    finally:
        con.close()


def entero(valor, minimo=0, maximo=100000):
    v = int(valor)
    if not minimo <= v <= maximo:
        raise ValueError(f"valor fuera de rango: {v}")
    return v


class Manejador(BaseHTTPRequestHandler):
    server_version = "minidc-api/1.0"
    sys_version = ""

    # ---------- utilidades ----------
    def cliente(self):
        return self.headers.get("X-Real-IP") or self.client_address[0]

    def responder(self, codigo, datos):
        cuerpo = json.dumps(datos, default=str, ensure_ascii=False).encode()
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(cuerpo)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(cuerpo)

    def leer_json(self):
        largo = int(self.headers.get("Content-Length") or 0)
        if largo > MAX_CUERPO:
            raise ValueError("cuerpo demasiado grande")
        return json.loads(self.rfile.read(largo) or b"{}")

    def log_message(self, formato, *args):  # bitácora en JSON → Loki
        print(json.dumps({"servicio": "api", "cliente": self.cliente(),
                          "evento": formato % args}, ensure_ascii=False), flush=True)

    def ruta(self):
        return self.path.split("?", 1)[0].rstrip("/")

    # ---------- GET ----------
    def do_GET(self):
        r = self.ruta()
        try:
            if r == "/api/salud":
                try:
                    consulta("SELECT 1 AS ok", una=True)
                    self.responder(200, {"api": True, "db": True, "version": "1.0"})
                except Exception as e:  # la API vive aunque la BD no responda
                    self.responder(200, {"api": True, "db": False, "error": type(e).__name__})
            elif r == "/api/visitas":
                filas = consulta("SELECT nodo, COUNT(*) AS visitas, MAX(fecha) AS ultima "
                                 "FROM visitas GROUP BY nodo ORDER BY nodo")
                self.responder(200, {"visitas": filas})
            elif r == "/api/pruebas":
                filas = consulta("SELECT id, fecha, algoritmo, total, exitos, fallos, "
                                 "t_prom_ms, distribucion, cliente FROM pruebas "
                                 "ORDER BY id DESC LIMIT 15")
                for f in filas:
                    try:
                        f["distribucion"] = json.loads(f["distribucion"] or "{}")
                    except ValueError:
                        f["distribucion"] = {}
                self.responder(200, {"pruebas": filas})
            else:
                self.responder(404, {"error": "ruta no encontrada"})
        except pymysql.MySQLError as e:
            self.responder(503, {"error": "base de datos no disponible", "detalle": str(e.args[0])})

    # ---------- POST ----------
    def do_POST(self):
        r = self.ruta()
        try:
            datos = self.leer_json()
            if r == "/api/visitas":
                nodo = str(datos.get("nodo", ""))
                if not NODO_VALIDO.match(nodo):
                    raise ValueError("nodo inválido")
                agente = (self.headers.get("User-Agent") or "")[:200]
                nuevo = consulta("INSERT INTO visitas (nodo, cliente, agente) VALUES (%s, %s, %s)",
                                 (nodo, self.cliente(), agente))
                self.responder(201, {"id": nuevo})
            elif r == "/api/pruebas":
                algoritmo = str(datos.get("algoritmo", "desconocido"))[:32]
                dist = datos.get("distribucion", {})
                if not isinstance(dist, dict) or len(dist) > 32:
                    raise ValueError("distribucion inválida")
                dist = {str(k)[:32]: entero(v) for k, v in dist.items() if NODO_VALIDO.match(str(k))}
                nuevo = consulta(
                    "INSERT INTO pruebas (algoritmo, total, exitos, fallos, t_prom_ms, distribucion, cliente) "
                    "VALUES (%s, %s, %s, %s, %s, %s, %s)",
                    (algoritmo, entero(datos.get("total", 0), 1, 5000),
                     entero(datos.get("exitos", 0)), entero(datos.get("fallos", 0)),
                     round(float(datos.get("t_prom_ms", 0)), 2),
                     json.dumps(dist), self.cliente()))
                self.responder(201, {"id": nuevo})
            else:
                self.responder(404, {"error": "ruta no encontrada"})
        except (ValueError, TypeError) as e:
            self.responder(400, {"error": f"datos inválidos: {e}"})
        except pymysql.MySQLError as e:
            self.responder(503, {"error": "base de datos no disponible", "detalle": str(e.args[0])})


if __name__ == "__main__":
    print(json.dumps({"servicio": "api", "evento": f"escuchando en :{PUERTO}"}), flush=True)
    ThreadingHTTPServer(("0.0.0.0", PUERTO), Manejador).serve_forever()
