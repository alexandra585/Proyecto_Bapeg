/*
  auth.js – Protege las rutas del panel.
  Solo deja pasar si existe una sesión de administrador activa.
*/
function requiereAdmin(req, res, next) {
  if (req.session && req.session.admin) return next();
  return res.status(401).json({ ok: false, mensaje: 'Sesión no iniciada o expirada.' });
}

module.exports = { requiereAdmin };
