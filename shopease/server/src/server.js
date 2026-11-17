const express = require('express');
const cors = require('cors');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');

function createApp({ config, db, sessionStore } = {}) {
  config ||= require('./config/env');
  db ||= require('./config/database');
  const { middleware, store } = require('./config/session').createSession(config, db, sessionStore);
  const app = express();
  app.locals.sessionStore = store;
  app.use(cors({ origin: config.clientOrigin, credentials: true }));
  app.use(express.json());

  app.get('/api/health', async (req, res) => {
    try {
      await db.query('SELECT 1');
      res.json({ success: true, message: 'API and database connected' });
    } catch {
      console.error('Health check database connection failed');
      res.status(500).json({ success: false, message: 'Database connection failed' });
    }
  });

  // Sessions apply only to authentication until later protected resources are added.
  app.use('/api/auth', middleware, require('./routes/auth')(db, config));

  // Legacy product routes are intentionally not mounted in BantayLog.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}

if (require.main === module) {
  const config = require('./config/env');
  const app = createApp();
  app.listen(config.port, () => {
    console.log(`Server running on http://localhost:${config.port}`);
  });
}

module.exports = { createApp };
