const mysql = require('mysql2/promise');
const config = require('./env');

// BantayLog stores barangay times as Philippine local time (UTC+8, no daylight saving).
// timezone: how the Node driver converts DATETIME values to and from JS Date objects.
const db = mysql.createPool({ ...config.database, timezone: '+08:00' });

// CURRENT_TIMESTAMP and NOW() follow the MySQL *session* time zone, so every new pooled
// connection is pinned to +08:00 regardless of the laptop's Windows time-zone setting.
// Commands on one connection run in order, so this runs before any query that uses it.
db.on('connection', connection => {
  connection.query("SET time_zone = '+08:00'", error => {
    if (error) console.error('Could not set the database session time zone');
  });
});

module.exports = db;
