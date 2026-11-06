#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  Usuarios con MÍNIMO PRIVILEGIO (se ejecuta solo la 1.ª vez).
#  Las contraseñas llegan como variables de entorno desde .env:
#  nunca se escriben en el código ni en el repositorio.
#
#    app_user   → la app Flask: SELECT, INSERT, UPDATE y DELETE; no altera tablas
#    grafana_ro → Grafana: SOLO LECTURA (un tablero no debe modificar datos)
# ═══════════════════════════════════════════════════════════════
set -e

mariadb --protocol=socket -uroot -p"${MARIADB_ROOT_PASSWORD}" <<-EOSQL
  CREATE USER IF NOT EXISTS 'app_user'@'%'   IDENTIFIED BY '${APP_DB_PASSWORD}';
  GRANT SELECT, INSERT, UPDATE, DELETE ON dc_app.* TO 'app_user'@'%';

  CREATE USER IF NOT EXISTS 'grafana_ro'@'%' IDENTIFIED BY '${GRAFANA_DB_PASSWORD}';
  GRANT SELECT ON dc_app.* TO 'grafana_ro'@'%';

  FLUSH PRIVILEGES;
EOSQL

echo "[02_usuarios] usuarios app_user y grafana_ro creados con permisos mínimos"
