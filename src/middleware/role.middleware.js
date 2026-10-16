function requireRole(...roles) {
  return function roleMiddleware(request, response, next) {
    if (!request.user || !roles.includes(request.user.role)) {
      return response.status(403).json({ error: 'Insufficient permissions.' });
    }
    return next();
  };
}

module.exports = { requireRole };
