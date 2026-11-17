module.exports = (error, req, res, next) => {
  if (res.headersSent) return next(error);

  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: 'Invalid JSON request body' });
  }
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ success: false, message: 'Request body is too large' });
  }
  if (error.status === 400) {
    return res.status(400).json({ success: false, message: 'Invalid request' });
  }

  // Do not log request bodies, credentials, or raw database errors.
  console.error('An internal API error occurred');
  res.status(500).json({ success: false, message: 'Internal server error' });
};
