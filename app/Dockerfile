FROM python:3.12-alpine
RUN pip install --no-cache-dir flask==3.1.1 gunicorn==23.0.0 pymysql==1.1.1
WORKDIR /app
COPY app.py .
RUN adduser -D -H appuser
USER appuser
EXPOSE 5000
CMD ["gunicorn", "-b", "0.0.0.0:5000", "-w", "2", "app:app"]
