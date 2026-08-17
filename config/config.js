require('dotenv').config();

const envConfig = {
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  dialect: process.env.DB_DIALECT || 'postgres',
};

module.exports = {
  development: envConfig,
  test: envConfig,
  production: envConfig,
};
