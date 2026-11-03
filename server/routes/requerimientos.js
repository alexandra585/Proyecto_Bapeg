/*
  requerimientos.js – API pública del formulario de contacto
  POST /api/requerimientos  → valida los datos y los guarda en MySQL.
  Acepta multipart/form-data (con archivo adjunto opcional "archivo").
*/
const express = require('express');
const multer = require('multer');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { pool } = require('../db');
const { enviarConfirmacion } = require('../correo');

const router = express.Router();

/* Valores permitidos (los mismos que muestra contacto.html) */
const SERVICIOS = ['Montaje industrial', 'Suministro de materiales', 'Auditoría termográfica', 'Mantenimiento / SLA'];
const PLAZOS = ['Inmediato', 'Menos de 15 días', 'Parada programada'];
const EXTENSIONES = ['.pdf', '.dwg', '.dxf', '.xlsx', '.xls', '.png', '.jpg', '.jpeg', '.zip'];
const MAX_ARCHIVO = 25 * 1024 * 1024; // 25 MB

/* Archivo en memoria: luego se guarda en la BD como LONGBLOB */
const subida = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ARCHIVO, files: 1 },
  fileFilter(req, archivo, cb) {
    const ext = path.extname(archivo.originalname).toLowerCase();
    if (EXTENSIONES.includes(ext)) return cb(null, true);
    cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'archivo'));
  }
});

/* Máximo 10 envíos cada 15 minutos por IP (evita spam) */
const limite = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, mensaje: 'Demasiados envíos. Intente nuevamente en unos minutos.' }
});

const texto = v => (typeof v === 'string' ? v.trim() : '');

function validar(c) {
  const errores = {};
  if (texto(c.nombre).length < 3) errores.nombre = 'Ingrese nombres y apellido.';
  if (texto(c.empresa).length < 2) errores.empresa = 'Ingrese la empresa o razón social.';
  if (c.ruc && !/^\d{11}$/.test(texto(c.ruc))) errores.ruc = 'El RUC debe tener 11 dígitos.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(texto(c.correo))) errores.correo = 'Correo no válido.';
  if (!/^[+\d][\d\s-]{6,19}$/.test(texto(c.telefono))) errores.telefono = 'Teléfono no válido.';
  if (!SERVICIOS.includes(texto(c.servicio))) errores.servicio = 'Seleccione un servicio.';
  if (!PLAZOS.includes(texto(c.plazo))) errores.plazo = 'Seleccione un plazo.';
  if (texto(c.detalle).length < 10) errores.detalle = 'Describa el proyecto (mín. 10 caracteres).';
  if (c.consentimiento !== 'acepto') errores.consentimiento = 'Debe aceptar la política de datos.';
  return errores;
}

router.post('/', limite, (req, res, next) => {
  subida.single('archivo')(req, res, err => {
    if (err instanceof multer.MulterError) {
      const mensaje = err.code === 'LIMIT_FILE_SIZE'
        ? 'El archivo supera los 25 MB.'
        : 'Formato de archivo no permitido (PDF, DWG, DXF, XLSX, XLS, PNG, JPG o ZIP).';
      return res.status(400).json({ ok: false, mensaje });
    }
    if (err) return next(err);
    next();
  });
}, async (req, res, next) => {
  try {
    const c = req.body;

    // Honeypot: si un bot llenó el campo oculto, fingimos éxito y no guardamos nada.
    if (texto(c._gotcha)) return res.status(201).json({ ok: true });

    // Compatibilidad con el nombre de campo anterior de Formspree
    c.correo = c.correo || c._replyto;

    const errores = validar(c);
    if (Object.keys(errores).length) {
      return res.status(400).json({ ok: false, mensaje: 'Revise los campos marcados.', errores });
    }

    const a = req.file;
    const nombreArchivo = a ? Buffer.from(a.originalname, 'latin1').toString('utf8') : null;
    const [resultado] = await pool.query(
      `INSERT INTO requerimientos
        (nombre, empresa, ruc, correo, telefono, servicio, plazo, detalle,
         archivo_nombre, archivo_tipo, archivo_tamano, archivo_datos, ip_origen)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        texto(c.nombre), texto(c.empresa), texto(c.ruc) || null, texto(c.correo).toLowerCase(),
        texto(c.telefono), texto(c.servicio), texto(c.plazo), texto(c.detalle),
        nombreArchivo,
        a ? a.mimetype : null,
        a ? a.size : null,
        a ? a.buffer : null,
        req.ip
      ]
    );

    const id = resultado.insertId;
    res.status(201).json({ ok: true, id, mensaje: 'Requerimiento registrado.' });

    // Correo de confirmación al cliente (en segundo plano: no retrasa la respuesta)
    enviarConfirmacion({
      codigo: 'RFQ-' + String(id).padStart(4, '0'),
      nombre: texto(c.nombre),
      empresa: texto(c.empresa),
      correo: texto(c.correo).toLowerCase(),
      telefono: texto(c.telefono),
      servicio: texto(c.servicio),
      plazo: texto(c.plazo),
      detalle: texto(c.detalle),
      archivo: nombreArchivo
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
module.exports.SERVICIOS = SERVICIOS;
