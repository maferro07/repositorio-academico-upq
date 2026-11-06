-- Esquema del Repositorio Académico UPQ (se ejecuta SOLO al crear el volumen db_data).
-- Si lo modificas: docker compose down -v  (se pierden los datos).
CREATE DATABASE IF NOT EXISTS dc_app CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE dc_app;

-- ── Heredado del profesor: inventario de nodos y visitas por nodo ──
CREATE TABLE IF NOT EXISTS nodos (
  id        VARCHAR(32)  PRIMARY KEY,
  nombre    VARCHAR(64)  NOT NULL,
  color     CHAR(7)      NOT NULL,
  rack      VARCHAR(32)  NOT NULL,
  rol       VARCHAR(120) NOT NULL
) ENGINE=InnoDB;

INSERT INTO nodos (id, nombre, color, rack, rol) VALUES
  ('web1', 'Nodo Alfa',  '#1f6feb', 'Rack A · U12', 'Aplicación Flask'),
  ('web2', 'Nodo Beta',  '#d97706', 'Rack A · U14', 'Aplicación Flask'),
  ('web3', 'Nodo Gamma', '#16a34a', 'Rack B · U08', 'Aplicación Flask')
ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), rol = VALUES(rol);

CREATE TABLE IF NOT EXISTS visitas (
  id       BIGINT AUTO_INCREMENT PRIMARY KEY,
  nodo     VARCHAR(32)  NOT NULL,
  cliente  VARCHAR(45)  NULL,
  agente   VARCHAR(200) NULL,
  fecha    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_visitas_nodo (nodo),
  INDEX idx_visitas_fecha (fecha)
) ENGINE=InnoDB;

-- ── Nuevo: repositorio académico ──
CREATE TABLE IF NOT EXISTS usuarios (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  nombre         VARCHAR(100) NOT NULL,
  correo         VARCHAR(120) NOT NULL UNIQUE,
  password_hash  VARCHAR(255) NOT NULL,
  rol            ENUM('estudiante','admin') NOT NULL DEFAULT 'estudiante',
  creado         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS materias (
  id      INT AUTO_INCREMENT PRIMARY KEY,
  nombre  VARCHAR(100) NOT NULL UNIQUE
) ENGINE=InnoDB;

INSERT IGNORE INTO materias (nombre) VALUES
  ('Centro de Datos'), ('Bases de Datos'), ('Programación'),
  ('Matemáticas'), ('Redes'), ('Inteligencia Artificial');

CREATE TABLE IF NOT EXISTS documentos (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  titulo           VARCHAR(150) NOT NULL,
  descripcion      TEXT NULL,
  materia_id       INT NOT NULL,
  usuario_id       INT NOT NULL,
  nombre_original  VARCHAR(255) NOT NULL,
  archivo          VARCHAR(64)  NOT NULL UNIQUE,   -- nombre aleatorio en el volumen
  tipo_mime        VARCHAR(100) NOT NULL,
  tamano           BIGINT NOT NULL,
  subido           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (materia_id) REFERENCES materias(id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  FULLTEXT KEY ft_busqueda (titulo, descripcion),
  INDEX idx_doc_materia (materia_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS descargas (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  documento_id INT NOT NULL,
  usuario_id   INT NULL,
  fecha        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (documento_id) REFERENCES documentos(id) ON DELETE CASCADE,
  FOREIGN KEY (usuario_id)   REFERENCES usuarios(id)   ON DELETE SET NULL
) ENGINE=InnoDB;
