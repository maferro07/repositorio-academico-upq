-- ═══════════════════════════════════════════════════════════════
--  Esquema de datos de la app (se ejecuta SOLO la primera vez que
--  se crea el volumen db_data). Si lo modificas, necesitas borrar
--  el volumen:  docker compose down -v   (¡se pierden los datos!)
-- ═══════════════════════════════════════════════════════════════
CREATE DATABASE IF NOT EXISTS dc_app CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE dc_app;

-- Inventario de nodos (como la hoja de racks de un data center)
CREATE TABLE IF NOT EXISTS nodos (
  id        VARCHAR(32)  PRIMARY KEY,
  nombre    VARCHAR(64)  NOT NULL,
  color     CHAR(7)      NOT NULL,
  rack      VARCHAR(32)  NOT NULL,
  rol       VARCHAR(120) NOT NULL
) ENGINE=InnoDB;

INSERT INTO nodos (id, nombre, color, rack, rol) VALUES
  ('web1', 'Nodo Alfa',  '#1f6feb', 'Rack A · U12', 'Servidor web estático'),
  ('web2', 'Nodo Beta',  '#d97706', 'Rack A · U14', 'Servidor web estático'),
  ('web3', 'Nodo Gamma', '#16a34a', 'Rack B · U08', 'Servidor web estático')
ON DUPLICATE KEY UPDATE nombre = VALUES(nombre);

-- Cada vez que alguien abre la página se registra qué nodo la sirvió
CREATE TABLE IF NOT EXISTS visitas (
  id       BIGINT AUTO_INCREMENT PRIMARY KEY,
  nodo     VARCHAR(32)  NOT NULL,
  cliente  VARCHAR(45)  NULL,
  agente   VARCHAR(200) NULL,
  fecha    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_visitas_nodo (nodo),
  INDEX idx_visitas_fecha (fecha)
) ENGINE=InnoDB;

-- Resultado de cada prueba de carga lanzada desde la página
CREATE TABLE IF NOT EXISTS pruebas (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  fecha         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  algoritmo     VARCHAR(32)  NOT NULL,
  total         INT          NOT NULL,
  exitos        INT          NOT NULL,
  fallos        INT          NOT NULL,
  t_prom_ms     DECIMAL(8,2) NOT NULL,
  distribucion  JSON         NOT NULL,      -- {"web1":10,"web2":10,"web3":10}
  cliente       VARCHAR(45)  NULL
) ENGINE=InnoDB;
