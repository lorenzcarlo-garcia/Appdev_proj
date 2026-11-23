const express = require('express');
const cors = require('cors');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');

function createApp({ config, db, sessionStore, uploadDirectory } = {}) {
  config ||= require('./config/env');
  db ||= require('./config/database');
  const { middleware, store } = require('./config/session').createSession(config, db, sessionStore);
  const app = express();
  app.locals.sessionStore = store;
  app.use(cors({ origin: config.clientOrigins || [config.clientOrigin], credentials: true }));
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

  // Protected resources share the same session store.
  app.use('/api/auth', middleware, require('./routes/auth')(db, config));
  app.use('/api/categories', middleware, require('./middleware/auth').authentication(db),
    require('./middleware/csrf').csrfProtection(config.clientOrigins || config.clientOrigin), require('./routes/categories')(db));

  app.use('/api/residents', middleware, require('./middleware/auth').authentication(db),
    require('./middleware/csrf').csrfProtection(config.clientOrigins || config.clientOrigin), require('./routes/residents')(db));

  app.use('/api/reports/:reportId/attachments', middleware, require('./middleware/auth').authentication(db),
    require('./middleware/csrf').csrfProtection(config.clientOrigins || config.clientOrigin), require('./routes/reportAttachments')(db, uploadDirectory));

  app.use('/api/reports', middleware, require('./middleware/auth').authentication(db),
    require('./middleware/csrf').csrfProtection(config.clientOrigins || config.clientOrigin), require('./routes/reports')(db));

  app.use('/api/blotters', middleware, require('./middleware/auth').authentication(db),
    require('./middleware/csrf').csrfProtection(config.clientOrigins || config.clientOrigin), require('./routes/blotters')(db));

  app.use('/api/users', middleware, require('./middleware/auth').authentication(db),
    require('./middleware/csrf').csrfProtection(config.clientOrigins || config.clientOrigin), require('./routes/users')(db));

  app.use('/api/community-updates', middleware, require('./middleware/auth').authentication(db),
    require('./middleware/csrf').csrfProtection(config.clientOrigins || config.clientOrigin), require('./routes/communityUpdates')(db));

  app.use('/api/dashboard', middleware, require('./middleware/auth').authentication(db),
    require('./middleware/csrf').csrfProtection(config.clientOrigins || config.clientOrigin), require('./routes/dashboard')(db));

  app.use('/api/areas', middleware, require('./middleware/auth').authentication(db),
    require('./middleware/csrf').csrfProtection(config.clientOrigins || config.clientOrigin), require('./routes/areas')(db));

  app.use('/api/activity', middleware, require('./middleware/auth').authentication(db),
    require('./middleware/csrf').csrfProtection(config.clientOrigins || config.clientOrigin), require('./routes/activity')(db));

  app.use('/api/summaries', middleware, require('./middleware/auth').authentication(db),
    require('./middleware/csrf').csrfProtection(config.clientOrigins || config.clientOrigin), require('./routes/summaries')(db));

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
