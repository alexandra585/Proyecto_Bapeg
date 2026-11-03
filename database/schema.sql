-- ==========================================================
--  BAPEG Industrial – Base de datos del panel administrativo
--  Motor: MySQL 8 (compatible con MariaDB 10.6+)
--
--  Uso manual (opcional, el servidor también crea las tablas solo):
--    mysql -u root -p < database/schema.sql
-- ==========================================================

CREATE DATABASE IF NOT EXISTS bapeg_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE bapeg_db;

-- 1. Administradores que pueden entrar al panel.
--    La contraseña se guarda cifrada con bcrypt, nunca en texto plano.
CREATE TABLE IF NOT EXISTS administradores (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario        VARCHAR(50)  NOT NULL UNIQUE,
  nombre         VARCHAR(100) NOT NULL,
  password_hash  VARCHAR(255) NOT NULL,
  ultimo_acceso  DATETIME     NULL,
  creado_en      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Requerimientos técnicos enviados desde contacto.html.
--    El archivo adjunto se guarda dentro de la BD (LONGBLOB) para que
--    no se pierda cuando el servidor en la nube se reinicia.
CREATE TABLE IF NOT EXISTS requerimientos (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre          VARCHAR(120) NOT NULL,
  empresa         VARCHAR(150) NOT NULL,
  ruc             VARCHAR(11)  NULL,
  correo          VARCHAR(150) NOT NULL,
  telefono        VARCHAR(30)  NOT NULL,
  servicio        VARCHAR(60)  NOT NULL,
  plazo           VARCHAR(40)  NOT NULL,
  detalle         TEXT         NOT NULL,
  archivo_nombre  VARCHAR(255) NULL,
  archivo_tipo    VARCHAR(120) NULL,
  archivo_tamano  INT UNSIGNED NULL,
  archivo_datos   LONGBLOB     NULL,
  estado          ENUM('nuevo','en_revision','cotizado','cerrado') NOT NULL DEFAULT 'nuevo',
  notas           TEXT         NULL,
  ip_origen       VARCHAR(45)  NULL,
  creado_en       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_estado (estado),
  INDEX idx_creado (creado_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. La tabla de sesiones ("sesiones") la crea automáticamente
--    express-mysql-session al iniciar el servidor.
