import datetime
import os
import socket

import pymysql
from flask import Flask, jsonify

app = Flask(__name__)

NODO = {"nodo": os.environ.get("NODO_ID", "web?"),
        "nombre": os.environ.get("NODO_NOMBRE", ""),
        "color": os.environ.get("NODO_COLOR", "#444444")}


def conectar():
    return pymysql.connect(
        host=os.environ.get("DB_HOST", "db"), user=os.environ.get("DB_USER", "app_user"),
        password=os.environ.get("DB_PASSWORD", ""), database=os.environ.get("DB_NAME", "dc_app"),
        charset="utf8mb4", connect_timeout=3, autocommit=True)


@app.after_request
def firmar(resp):                      # el lb registra esta cabecera (la usa Grafana)
    resp.headers["X-Nodo"] = NODO["nodo"]
    resp.headers["Cache-Control"] = "no-store"
    return resp


@app.get("/")
def inicio():
    return f"<h1>Repositorio Académico UPQ</h1><p>Atendido por {NODO['nombre']} ({NODO['nodo']})</p>"


@app.get("/whoami")
def whoami():
    host = socket.gethostname()
    return jsonify(**NODO, host=host, ip=socket.gethostbyname(host),
                   hora=datetime.datetime.now().astimezone().isoformat())


@app.get("/api/salud")
def salud():
    try:
        con = conectar()
        try:
            with con.cursor() as cur:
                cur.execute("SELECT 1")
        finally:
            con.close()
        return jsonify(api=True, db=True, nodo=NODO["nodo"])
    except Exception as e:
        return jsonify(api=True, db=False, error=type(e).__name__)
