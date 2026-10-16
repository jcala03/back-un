function notFound(request, response) {
  response.status(404).json({ error: 'Resource not found.' });
}

function errorHandler(error, request, response, next) {
  if (response.headersSent) {
    return next(error);
  }

  if (error.type === 'entity.parse.failed') {
    return response.status(400).json({ error: 'Request body must contain valid JSON.' });
  }
  if (error.type === 'entity.too.large') {
    return response.status(413).json({ error: 'Request body is too large.' });
  }

  console.error(`Request failed: ${error.message}`);
  const status = Number.isInteger(error.status) && error.status >= 400
    ? error.status
    : 500;
  const message = status >= 500 && process.env.NODE_ENV === 'production'
    ? 'Internal server error.'
    : (status >= 500 ? 'Internal server error.' : error.message);
  return response.status(status).json({ error: message });
}

module.exports = { notFound, errorHandler };
