import { Response } from 'express';
import { sequelize } from '../db';
import { CustomRequest } from '../types/api';

/**
 * Liveness Probe
 * Checks if the application is alive and running
 * This is a lightweight check that just verifies the process is responding
 */
export const livenessProbe = async (req: CustomRequest, res: Response) => {
  try {
    req.log.info('Health check endpoint hit');
    // Simple check - if we can respond, the app is alive
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  } catch (error) {
    req.log.error({ error }, 'Health check failed');
    res.status(503).json({
      status: 'error',
      message: 'Service unavailable',
    });
  }
};

/**
 * Readiness Probe
 * Checks if the application is ready to accept traffic
 * Includes database connectivity check
 */
export const readinessProbe = async (req: CustomRequest, res: Response) => {
  try {
    // Check database connection
    await sequelize.authenticate();

    req.log.info('Database connection successful');
    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString(),
      checks: {
        database: 'connected',
      },
    });
  } catch (error: any) {
    req.log.error({ error: error.message }, 'Readiness probe failed - database disconnected');
    res.status(503).json({
      status: 'not ready',
      timestamp: new Date().toISOString(),
      checks: {
        database: 'disconnected',
      },
      error: error.message,
    });
  }
};
