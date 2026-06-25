const { Pool } = require("pg");

// Create connection pool with env
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME || "chat_app",
  password: process.env.DB_PASSWORD || "postgres",
  port: process.env.DB_PORT || 5432,
});

module.exports = pool;
