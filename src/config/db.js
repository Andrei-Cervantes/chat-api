const { Pool } = require("pg");

// Create connection pool with env
const pool = new Pool({
  user: process.env.DB_USER || "chatappapidb",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "chat_app",
  password: process.env.DB_PASSWORD || "chatappapipassword",
  port: process.env.DB_PORT || 5433,
});

module.exports = { pool };
