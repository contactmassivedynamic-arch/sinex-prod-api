module.exports = (...rolesAutorises) => (req, res, next) => {
  const role = req.user?.nom_role || req.user?.role || '';
  if (!rolesAutorises.includes(role)) {
    return res.status(403).json({ message: 'Accès refusé — permissions insuffisantes' });
  }
  next();
};
