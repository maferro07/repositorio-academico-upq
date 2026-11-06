#!/usr/bin/env bash
# Prueba de carga mínima: N peticiones a /whoami y conteo por nodo.
# Uso:  bash pruebas/carga.sh [N] [URL]
N=${1:-30}
URL=${2:-http://localhost:8080/whoami}
echo "Enviando $N peticiones a $URL ..."
for i in $(seq 1 "$N"); do
  curl -s "$URL" | grep -o '"nodo":"[^"]*"' | cut -d'"' -f4 || echo "FALLO"
done | sort | uniq -c | awk '{printf "  %-8s %4d  ", $2, $1; for(i=0;i<$1;i++) printf "█"; print ""}'
