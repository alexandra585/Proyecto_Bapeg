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
  prioridad       ENUM('normal','alta','urgente') NOT NULL DEFAULT 'normal',
  seguimiento_en  DATE         NULL,
  notas           TEXT         NULL,
  ip_origen       VARCHAR(45)  NULL,
  creado_en       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_estado (estado),
  INDEX idx_creado (creado_en),
  INDEX idx_seguimiento (seguimiento_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Catálogo de la tienda (se administra desde el panel → módulo Productos).
--    La primera vez se cargan los productos de ejemplo de server/catalogo.js.
CREATE TABLE IF NOT EXISTS categorias (
  id          VARCHAR(30)   PRIMARY KEY,
  nombre      VARCHAR(60)   NOT NULL,
  icono       VARCHAR(40)   NOT NULL DEFAULT 'fa-box',
  orden       INT           NOT NULL DEFAULT 0,
  creado_en   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS productos (
  id             VARCHAR(60)   PRIMARY KEY,
  sku            VARCHAR(20)   NOT NULL UNIQUE,
  nombre         VARCHAR(120)  NOT NULL,
  categoria      VARCHAR(30)   NOT NULL,
  tipo           VARCHAR(60)   NULL,
  detalle        VARCHAR(500)  NULL,
  precio         DECIMAL(10,2) NOT NULL,
  precio_oferta  DECIMAL(10,2) NULL,
  stock          INT UNSIGNED  NOT NULL DEFAULT 0,
  stock_minimo   INT UNSIGNED  NOT NULL DEFAULT 5,
  destacado      TINYINT(1)    NOT NULL DEFAULT 0,
  activo         TINYINT(1)    NOT NULL DEFAULT 1,
  imagen_ruta    VARCHAR(200)  NULL,
  imagen_tipo    VARCHAR(40)   NULL,
  imagen_datos   MEDIUMBLOB    NULL,
  creado_en      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_productos_categoria (categoria)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Kardex: cada entrada o salida de stock (ingreso, ajuste, venta, devolución).
CREATE TABLE IF NOT EXISTS inventario_movimientos (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  producto_id      VARCHAR(60)   NOT NULL,
  tipo             ENUM('inicial','ingreso','ajuste','venta','devolucion') NOT NULL,
  cantidad         INT           NOT NULL,
  stock_resultante INT UNSIGNED  NOT NULL,
  motivo           VARCHAR(200)  NULL,
  pedido_id        INT UNSIGNED  NULL,
  autor            VARCHAR(60)   NOT NULL DEFAULT 'sistema',
  creado_en        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_mov_producto (producto_id, creado_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Pedidos de la tienda.
--    Ciclo de vida: pendiente_pago → pagado → en_preparacion → despachado → en_reparto → entregado
--    (recojo en almacén: en_preparacion → listo_recojo → entregado). También: pago_rechazado y cancelado.
CREATE TABLE IF NOT EXISTS pedidos (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  codigo             VARCHAR(20)   NOT NULL UNIQUE,
  nombre             VARCHAR(120)  NOT NULL,
  correo             VARCHAR(150)  NOT NULL,
  telefono           VARCHAR(30)   NOT NULL,
  comprobante        ENUM('boleta','factura') NOT NULL DEFAULT 'boleta',
  documento          VARCHAR(11)   NOT NULL,
  razon_social       VARCHAR(150)  NULL,
  tipo_entrega       ENUM('envio','recojo') NOT NULL,
  departamento       VARCHAR(40)   NULL,
  distrito           VARCHAR(80)   NULL,
  direccion          VARCHAR(200)  NULL,
  referencia         VARCHAR(200)  NULL,
  subtotal           DECIMAL(10,2) NOT NULL,
  costo_envio        DECIMAL(10,2) NOT NULL DEFAULT 0,
  total              DECIMAL(10,2) NOT NULL,
  estado             ENUM('pendiente_pago','pago_rechazado','pagado','en_preparacion','listo_recojo',
                          'despachado','en_reparto','entregado','cancelado') NOT NULL DEFAULT 'pendiente_pago',
  metodo_pago        VARCHAR(40)   NULL,
  pagado_en          DATETIME      NULL,
  courier            VARCHAR(60)   NULL,
  numero_guia        VARCHAR(60)   NULL,
  notas_internas     TEXT          NULL,
  creado_en          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_pedidos_estado (estado),
  INDEX idx_pedidos_fecha (creado_en),
  INDEX idx_pedidos_correo (correo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Productos de cada pedido (se guarda el precio del momento de la compra).
CREATE TABLE IF NOT EXISTS pedido_items (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  pedido_id        INT UNSIGNED  NOT NULL,
  producto_id      VARCHAR(60)   NOT NULL,
  nombre           VARCHAR(120)  NOT NULL,
  categoria        VARCHAR(30)   NOT NULL,
  precio_unitario  DECIMAL(10,2) NOT NULL,
  cantidad         INT UNSIGNED  NOT NULL,
  subtotal         DECIMAL(10,2) NOT NULL,
  INDEX idx_items_pedido (pedido_id),
  CONSTRAINT fk_items_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Intentos de pago (Mercado Pago o modo demostración). Nunca se guardan datos de tarjeta,
--    solo el resultado y los 4 últimos dígitos que devuelve la pasarela.
CREATE TABLE IF NOT EXISTS pedido_pagos (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  pedido_id        INT UNSIGNED  NOT NULL,
  proveedor        ENUM('mercadopago','demo') NOT NULL,
  referencia       VARCHAR(40)   NULL,
  estado           ENUM('aprobado','rechazado','pendiente') NOT NULL,
  detalle          VARCHAR(80)   NULL,
  metodo           VARCHAR(40)   NULL,
  ultimos4         CHAR(4)       NULL,
  monto            DECIMAL(10,2) NOT NULL,
  creado_en        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_pagos_pedido (pedido_id),
  INDEX idx_pagos_fecha (creado_en),
  CONSTRAINT fk_pagos_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Historial de estados: alimenta la línea de tiempo del seguimiento y la auditoría del panel.
CREATE TABLE IF NOT EXISTS pedido_historial (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  pedido_id        INT UNSIGNED  NOT NULL,
  estado           VARCHAR(30)   NOT NULL,
  comentario       VARCHAR(300)  NULL,
  visible_cliente  TINYINT(1)    NOT NULL DEFAULT 1,
  autor            VARCHAR(60)   NOT NULL DEFAULT 'sistema',
  creado_en        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_historial_pedido (pedido_id),
  CONSTRAINT fk_historial_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. La tabla de sesiones ("sesiones") la crea automáticamente
--    express-mysql-session al iniciar el servidor.
