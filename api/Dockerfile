# Dockerfile = la "receta" para construir una imagen propia.
# Imagen = clase · Contenedor = objeto (instancia en ejecución).
FROM python:3.12-alpine

# Dependencia única: el conector de MariaDB/MySQL
RUN pip install --no-cache-dir pymysql==1.1.1

WORKDIR /app
COPY app.py .

# Principio de mínimo privilegio: no correr como root
RUN adduser -D -H apiuser
USER apiuser

EXPOSE 5000
CMD ["python", "-u", "app.py"]
