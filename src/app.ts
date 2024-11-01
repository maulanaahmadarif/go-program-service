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
app.use(bodyParser.urlencoded({ extended: true }));

// Allowed origins array
const allowedOrigins = [
  'http://localhost:3000',
  'https://go-program-app.web.app',
  'https://gopro-lenovoid.com',
];

// CORS options
const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true); // Allow the request
    } else {
      callback(new Error('Not allowed by CORS')); // Deny the request
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'], // Add allowed methods as needed
  credentials: true, // If you need cookies to be included in CORS requests
};

// Apply CORS middleware
app.use(cors(corsOptions));

app.use(express.static(path.join(process.cwd(), 'public')));
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

