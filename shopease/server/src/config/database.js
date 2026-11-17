const mysql = require('mysql2/promise');
const config = require('./env');

const db = mysql.createPool(config.database);

module.exports = db;
