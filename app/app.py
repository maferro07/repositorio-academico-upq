"""
Repositorio Académico UPQ — aplicación Flask.
Cada réplica (web1, web2, web3) ejecuta este mismo código; solo cambia NODO_ID.

Conservado del Mini Data Center del profesor:
  - credenciales por variables de entorno (nunca en el código)
  - consultas parametrizadas (anti SQL-injection)
  - cabecera X-Nodo, /whoami y /api/salud (los usan el balanceador y Grafana)

Nuevo: registro/login, subir, buscar, descargar y eliminar documentos.
Sesión = cookie firmada con SECRET_KEY (la misma en las 3 réplicas, así el
login sigue válido aunque el balanceador te mande a otro nodo).
Los archivos viven en el volumen compartido documentos_data.
"""
import datetime
import hmac
import os
import re
import secrets
import socket
import uuid
from functools import wraps

import pymysql
from flask import (Flask, abort, flash, g, jsonify, redirect, render_template,
                   request, send_from_directory, session, url_for)
from werkzeug.exceptions import HTTPException, RequestEntityTooLarge
from werkzeug.security import check_password_hash, generate_password_hash

NODO = {"nodo": os.environ.get("NODO_ID", "web?"),
        "nombre": os.environ.get("NODO_NOMBRE", ""),
        "color": os.environ.get("NODO_COLOR", "#444444")}

DIR_DOCS = os.environ.get("DOCS_DIR", "/data/documentos")
MAX_MB = int(os.environ.get("MAX_UPLOAD_MB", "25"))

# extensión permitida -> tipo MIME con el que se entrega al descargar
TIPOS = {
    "pdf": "application/pdf", "txt": "text/plain", "md": "text/markdown",
    "doc": "application/msword",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "ppt": "application/vnd.ms-powerpoint",
    "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "xls": "application/vnd.ms-excel",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "zip": "application/zip", "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
}
CORREO_UPQ = re.compile(r"^[a-z0-9._%+-]+@upq\.edu\.mx$")

app = Flask(__name__)
app.secret_key = os.environ["SECRET_KEY"]
app.config.update(
    MAX_CONTENT_LENGTH=MAX_MB * 1024 * 1024,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    PERMANENT_SESSION_LIFETIME=datetime.timedelta(hours=8),
)


# ───────────────────────────── base de datos ─────────────────────────────
def conectar():
    return pymysql.connect(
        host=os.environ.get("DB_HOST", "db"), port=int(os.environ.get("DB_PORT", "3306")),
        user=os.environ.get("DB_USER", "app_user"),
        password=os.environ.get("DB_PASSWORD", ""), database=os.environ.get("DB_NAME", "dc_app"),
        charset="utf8mb4", cursorclass=pymysql.cursors.DictCursor,
        connect_timeout=3, autocommit=True)


def consulta(sql, params=(), una=False):
    """SQL parametrizado. Nunca concatenes texto del usuario dentro del SQL."""
    con = conectar()
    try:
        with con.cursor() as cur:
            cur.execute(sql, params)
            if sql.lstrip().upper().startswith("SELECT"):
                return cur.fetchone() if una else cur.fetchall()
            return cur.lastrowid
    finally:
        con.close()


def cliente():
    return request.headers.get("X-Real-IP") or request.remote_addr


# ───────────────────────── sesión, CSRF y plantillas ─────────────────────────
@app.before_request
def cargar_usuario():
    g.usuario = None
    if request.endpoint in ("static", "whoami", "salud"):
        return
    uid = session.get("uid")
    if uid:
        g.usuario = consulta("SELECT id, nombre, correo, rol FROM usuarios WHERE id=%s",
                             (uid,), una=True)


@app.before_request
def verificar_csrf():
    if request.method == "POST":
        enviado = request.form.get("csrf", "").encode()
        esperado = session.get("csrf", "").encode()
        if not esperado or not hmac.compare_digest(enviado, esperado):
            abort(400, "Token de seguridad inválido. Recarga la página e intenta de nuevo.")


@app.context_processor
def contexto():
    if "csrf" not in session:
        session["csrf"] = secrets.token_hex(16)
    return {"csrf": session["csrf"], "nodo": NODO, "usuario": g.get("usuario"),
            "max_mb": MAX_MB, "extensiones": sorted(TIPOS)}


@app.after_request
def firmar(resp):                      # el lb registra X-Nodo → Grafana cuenta por nodo
    resp.headers["X-Nodo"] = NODO["nodo"]
    resp.headers["Cache-Control"] = "no-store"
    return resp


def login_requerido(f):
    @wraps(f)
    def envoltura(*args, **kwargs):
        if not g.usuario:
            return redirect(url_for("login"))
        return f(*args, **kwargs)
    return envoltura


@app.errorhandler(RequestEntityTooLarge)
def demasiado_grande(_):
    flash(f"El archivo supera el máximo de {MAX_MB} MB.", "error")
    return redirect(url_for("subir"))


@app.errorhandler(HTTPException)
def error_http(e):
    return render_template("error.html", codigo=e.code, mensaje=e.description), e.code


@app.errorhandler(pymysql.MySQLError)
def error_bd(_):
    return render_template("error.html", codigo=503,
                           mensaje="La base de datos no está disponible. Intenta en unos segundos."), 503


# ───────────────────────────── cuentas ─────────────────────────────
@app.route("/registro", methods=["GET", "POST"])
def registro():
    if g.usuario:
        return redirect(url_for("inicio"))
    if request.method == "POST":
        nombre = request.form.get("nombre", "").strip()
        correo = request.form.get("correo", "").strip().lower()
        clave = request.form.get("clave", "")
        errores = []
        if not 2 <= len(nombre) <= 100:
            errores.append("El nombre debe tener entre 2 y 100 caracteres.")
        if not CORREO_UPQ.match(correo) or len(correo) > 120:
            errores.append("Usa tu correo institucional (@upq.edu.mx).")
        if not 8 <= len(clave) <= 128:
            errores.append("La contraseña debe tener entre 8 y 128 caracteres.")
        if clave != request.form.get("clave2", ""):
            errores.append("Las contraseñas no coinciden.")
        if not errores:
            primero = consulta("SELECT COUNT(*) AS n FROM usuarios", una=True)["n"] == 0
            try:
                consulta("INSERT INTO usuarios (nombre, correo, password_hash, rol) VALUES (%s, %s, %s, %s)",
                         (nombre, correo, generate_password_hash(clave, method="pbkdf2:sha256"),
                          "admin" if primero else "estudiante"))
            except pymysql.err.IntegrityError:
                errores.append("Ese correo ya está registrado.")
            else:
                flash("Cuenta creada. Ya puedes iniciar sesión.", "ok")
                return redirect(url_for("login"))
        for e in errores:
            flash(e, "error")
    return render_template("registro.html")


@app.route("/login", methods=["GET", "POST"])
def login():
    if g.usuario:
        return redirect(url_for("inicio"))
    if request.method == "POST":
        correo = request.form.get("correo", "").strip().lower()
        fila = consulta("SELECT id, password_hash FROM usuarios WHERE correo=%s", (correo,), una=True)
        if fila and check_password_hash(fila["password_hash"], request.form.get("clave", "")):
            session.clear()
            session["uid"] = fila["id"]
            session.permanent = True
            return redirect(url_for("inicio"))
        flash("Correo o contraseña incorrectos.", "error")
    return render_template("login.html")


@app.post("/salir")
def salir():
    session.clear()
    return redirect(url_for("login"))


# ───────────────────────────── documentos ─────────────────────────────
SQL_BUSCAR = """
SELECT d.id, d.titulo, d.descripcion, d.nombre_original, d.tamano, d.subido, d.usuario_id,
       m.nombre AS materia, u.nombre AS autor,
       (SELECT COUNT(*) FROM descargas x WHERE x.documento_id = d.id) AS descargas
FROM documentos d
JOIN materias m ON m.id = d.materia_id
JOIN usuarios u ON u.id = d.usuario_id
WHERE (%s = '' OR d.titulo LIKE %s OR d.descripcion LIKE %s OR d.nombre_original LIKE %s)
  AND (%s = 0 OR d.materia_id = %s)
ORDER BY d.subido DESC, d.id DESC
LIMIT 100
"""


@app.get("/")
@login_requerido
def inicio():
    q = request.args.get("q", "").strip()[:100]
    materia = request.args.get("materia", default=0, type=int)
    try:                               # alimenta el panel «Visitas por nodo» de Grafana
        consulta("INSERT INTO visitas (nodo, cliente, agente) VALUES (%s, %s, %s)",
                 (NODO["nodo"], cliente(), (request.headers.get("User-Agent") or "")[:200]))
    except pymysql.MySQLError:
        pass
    esc = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    like = f"%{esc}%"
    docs = consulta(SQL_BUSCAR, (q, like, like, like, materia, materia))
    materias = consulta("SELECT id, nombre FROM materias ORDER BY nombre")
    return render_template("inicio.html", docs=docs, materias=materias, q=q, materia=materia)


@app.route("/subir", methods=["GET", "POST"])
@login_requerido
def subir():
    materias = consulta("SELECT id, nombre FROM materias ORDER BY nombre")
    if request.method == "POST":
        titulo = request.form.get("titulo", "").strip()
        descripcion = request.form.get("descripcion", "").strip()
        materia_id = request.form.get("materia", default=0, type=int)
        f = request.files.get("archivo")
        nombre_orig = os.path.basename((f.filename or "").replace("\\", "/")).strip()[:200] if f else ""
        ext = nombre_orig.rsplit(".", 1)[-1].lower() if "." in nombre_orig else ""
        errores = []
        if not 3 <= len(titulo) <= 150:
            errores.append("El título debe tener entre 3 y 150 caracteres.")
        if len(descripcion) > 2000:
            errores.append("La descripción es demasiado larga (máximo 2000 caracteres).")
        if not any(m["id"] == materia_id for m in materias):
            errores.append("Elige una materia.")
        if ext not in TIPOS:
            errores.append("Tipo de archivo no permitido. Formatos: " + ", ".join(sorted(TIPOS)) + ".")
        if not errores:
            archivo = f"{uuid.uuid4().hex}.{ext}"           # nombre aleatorio en disco
            ruta = os.path.join(DIR_DOCS, archivo)
            f.save(ruta)
            tamano = os.path.getsize(ruta)
            if tamano == 0:
                os.remove(ruta)
                errores.append("El archivo está vacío.")
            else:
                try:
                    consulta("INSERT INTO documentos (titulo, descripcion, materia_id, usuario_id, "
                             "nombre_original, archivo, tipo_mime, tamano) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
                             (titulo, descripcion or None, materia_id, g.usuario["id"],
                              nombre_orig, archivo, TIPOS[ext], tamano))
                except Exception:
                    os.remove(ruta)                          # no dejar archivos huérfanos
                    raise
                flash("Documento publicado.", "ok")
                return redirect(url_for("inicio"))
        for e in errores:
            flash(e, "error")
    return render_template("subir.html", materias=materias)

@app.route("/admin/materias", methods=["GET", "POST"])
@login_requerido
def administrar_materias():
    # Solo los administradores pueden acceder
    if g.usuario["rol"] != "admin":
        abort(403, "No tienes permiso para administrar materias.")

    if request.method == "POST":
        nombre = request.form.get("nombre", "").strip()

        if not 1 <= len(nombre) <= 100:
            flash("El nombre debe tener entre 1 y 100 caracteres.", "error")
        else:
            existente = consulta(
                "SELECT id FROM materias WHERE nombre = %s",
                (nombre,),
                una=True
            )

            if existente:
                flash("Esta materia ya existe.", "error")
            else:
                consulta(
                    "INSERT INTO materias (nombre) VALUES (%s)",
                    (nombre,)
                )
                flash("Materia agregada correctamente.", "ok")
                return redirect(url_for("administrar_materias"))

    materias = consulta(
        "SELECT id, nombre FROM materias ORDER BY nombre"
    )

    return render_template("materias.html", materias=materias)
@app.get("/descargar/<int:doc_id>")
@login_requerido
def descargar(doc_id):
    doc = consulta("SELECT archivo, nombre_original, tipo_mime FROM documentos WHERE id=%s",
                   (doc_id,), una=True)
    if not doc:
        abort(404, "Documento no encontrado.")
    consulta("INSERT INTO descargas (documento_id, usuario_id) VALUES (%s, %s)",
             (doc_id, g.usuario["id"]))
    return send_from_directory(DIR_DOCS, doc["archivo"], as_attachment=True,
                               download_name=doc["nombre_original"], mimetype=doc["tipo_mime"])


@app.post("/documentos/<int:doc_id>/eliminar")
@login_requerido
def eliminar(doc_id):
    doc = consulta("SELECT usuario_id, archivo FROM documentos WHERE id=%s", (doc_id,), una=True)
    if not doc:
        abort(404, "Documento no encontrado.")
    if doc["usuario_id"] != g.usuario["id"] and g.usuario["rol"] != "admin":
        abort(403, "Solo el autor o un administrador puede eliminar este documento.")
    consulta("DELETE FROM documentos WHERE id=%s", (doc_id,))
    try:
        os.remove(os.path.join(DIR_DOCS, doc["archivo"]))
    except FileNotFoundError:
        pass
    flash("Documento eliminado.", "ok")
    return redirect(url_for("inicio"))


# ───────────── heredado del profesor: lo usan el lb, carga.sh y los healthchecks ─────────────
@app.get("/whoami")
def whoami():
    host = socket.gethostname()
    return jsonify(**NODO, host=host, ip=socket.gethostbyname(host),
                   hora=datetime.datetime.now().astimezone().isoformat())


@app.get("/api/salud")
def salud():
    try:
        consulta("SELECT 1 AS ok", una=True)
        return jsonify(api=True, db=True, nodo=NODO["nodo"])
    except Exception as e:
        return jsonify(api=True, db=False, error=type(e).__name__)
