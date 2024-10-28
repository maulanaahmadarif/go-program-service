import express from 'express';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import cors from 'cors';
import path from 'path';

import { sequelize } from './db';
import router from './routes';

// Load environment variables
dotenv.config();

// Initialize Express
const app = express();

// Middleware
app.use(bodyParser.json());
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));

app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/api', router)
app.set('trust proxy', true)

// Sync all models with the database (creates tables if they don't exist)
// sequelize.sync({ force: true })  // You can add an explicit type for syncDb parameter if needed
//   .then(() => console.log('Tables created successfully!'))
//   .catch((error: Error) => console.error('Error creating tables:', error));

const startServer = async () => {
  try {
    await sequelize.authenticate();

    console.log("Database connected.");
  } catch (err: any) {
    console.error("connection errors:", err.message);
  }

  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;  // Ensure process.env.PORT is an integer
  app.listen(PORT, () => console.log(`listening on port ${PORT}`));
}

startServer()

