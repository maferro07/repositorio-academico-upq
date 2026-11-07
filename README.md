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
# Repositorio Académico UPQ
## Mini Centro de Datos con Docker Compose

**Asignatura:** Centro de Datos  
**Carrera:** Ingeniería en Datos e Inteligencia Artificial  
**Institución:** Universidad Politécnica de Querétaro

---

## 1. Descripción del proyecto

El Repositorio Académico UPQ es una aplicación web diseñada para facilitar el almacenamiento, organización y consulta de documentos académicos.

El proyecto se desarrolla sobre una arquitectura de mini centro de datos utilizando Docker Compose, que permite administrar diferentes servicios mediante contenedores.

La aplicación utiliza tres servidores Flask, un balanceador de carga Nginx, una base de datos MariaDB y herramientas de monitoreo.

## 2. Objetivo

Implementar un mini centro de datos funcional mediante Docker Compose, integrando una aplicación web que permita administrar documentos académicos y demostrar conceptos de balanceo de carga, persistencia de datos, administración de contenedores y observabilidad.

## 3. Tecnologías utilizadas

| Tecnología | Función |
|---|---|
| Docker | Ejecutar aplicaciones mediante contenedores. |
| Docker Compose | Administrar los servicios del proyecto. |
| Python y Flask | Desarrollar la aplicación web. |
| MariaDB | Almacenar la información académica. |
| Nginx | Distribuir solicitudes entre servidores. |
| Grafana | Visualizar registros del sistema. |
| Loki | Almacenar bitácoras. |
| Alloy | Recopilar y enviar registros. |
| Portainer | Administrar contenedores visualmente. |

## 4. Arquitectura del mini centro de datos

El proyecto cuenta con nueve servicios configurados en Docker Compose:

- db
- web1
- web2
- web3
- lb
- loki
- alloy
- grafana
- portainer

### Diagrama de arquitectura

```text
                USUARIO
                   |
                   v
          NGINX - Puerto 8080
          Balanceador de carga
                   |
          +--------+--------+
          |        |        |
          v        v        v
        WEB1     WEB2     WEB3
        Flask    Flask    Flask
          |        |        |
          +--------+--------+
                   |
                   v
                MariaDB

       MONITOREO Y OBSERVABILIDAD

     Contenedores -> Alloy -> Loki
                                |
                                v
                             Grafana

       ADMINISTRACIÓN: PORTAINER
```

## 5. Funcionalidades de la aplicación

El Repositorio Académico UPQ permite:

- Registrar usuarios.
- Iniciar y cerrar sesión.
- Diferenciar usuarios administradores y estudiantes.
- Consultar documentos académicos.
- Buscar documentos por título o descripción.
- Filtrar documentos por materia.
- Subir documentos.
- Descargar archivos.
- Administrar materias mediante una cuenta de administrador.

## 6. Estructura del proyecto

```text
repositorio-upq/
|
|-- app/
|-- nginx/
|-- mariadb/
|-- grafana/
|-- observabilidad/
|-- pruebas/
|-- sitios/
|-- docker-compose.yml
|-- .env.example
|-- README.md
```

La carpeta `app/` contiene el desarrollo de la aplicación web.

El archivo `docker-compose.yml` define los servicios necesarios para ejecutar el mini centro de datos.

## 7. Requisitos

Para ejecutar el proyecto se necesita:

- Docker Engine.
- Docker Compose.
- Una computadora con recursos suficientes para ejecutar los contenedores.
- Un navegador web.

## 8. Ejecución del proyecto

### Paso 1. Configurar las variables de entorno

Crear el archivo `.env` utilizando la plantilla:

```bash
cp .env.example .env
```

Configurar las contraseñas y demás variables necesarias.

**Importante:** no compartir el archivo `.env`, ya que puede contener información sensible.

### Paso 2. Iniciar los contenedores

```bash
docker compose up -d --build
```

### Paso 3. Comprobar los servicios

```bash
docker compose ps
```

### Paso 4. Acceder a las herramientas

| Servicio | Dirección |
|---|---|
| Repositorio Académico | http://localhost:8080 |
| Grafana | http://localhost:3000 |
| Portainer | https://localhost:9443 |

## 9. Pruebas realizadas

### Balanceo de carga

Se comprobó que Nginx distribuye las solicitudes entre los tres servidores Flask.

Al actualizar la página, se observaron respuestas de:

- Nodo Alfa - web1.
- Nodo Beta - web2.
- Nodo Gamma - web3.

### Base de datos

Se verificó el funcionamiento de MariaDB mediante las operaciones de la aplicación, incluyendo la administración de materias y el registro de documentos.

### Subida y descarga de documentos

Se publicó un archivo PDF en el repositorio y posteriormente se descargó y abrió correctamente.

### Monitoreo y bitácoras

Se comprobó que Grafana permite consultar los registros almacenados en Loki.

Consulta utilizada:

```logql
{servicio="lb"}
```

Esta consulta permitió visualizar registros del balanceador de carga Nginx.

### Acceso desde diferentes dispositivos

Se comprobó que la aplicación puede abrirse desde una computadora Ubuntu y desde un iPhone conectado a la misma red local.

## 10. Comandos útiles

Consultar el estado de los contenedores:

```bash
docker compose ps
```

Consultar los registros del balanceador:

```bash
docker compose logs lb
```

Consultar el consumo de recursos:

```bash
docker stats --no-stream
```

Detener los servicios sin eliminar los volúmenes:

```bash
docker compose down
```

Iniciar nuevamente los servicios:

```bash
docker compose up -d
```

## 11. Seguridad

El proyecto utiliza variables de entorno para administrar configuraciones sensibles.

Se recomienda:

- No compartir contraseñas.
- No publicar el archivo `.env`.
- Mantener protegidas las cuentas de administrador.
- No subir documentos con información personal durante las pruebas.
- Evitar exponer los servicios administrativos directamente a internet.

## 12. Conclusión

El desarrollo del Repositorio Académico UPQ permitió implementar un mini centro de datos funcional utilizando Docker Compose.

Mediante la integración de Flask, MariaDB, Nginx, Grafana, Loki, Alloy y Portainer, se construyó una arquitectura basada en contenedores que permite ejecutar una aplicación web, distribuir solicitudes entre servidores y consultar registros del sistema.

El proyecto demuestra la importancia de la integración de diferentes tecnologías para administrar aplicaciones y servicios dentro de una infraestructura de centro de datos.
