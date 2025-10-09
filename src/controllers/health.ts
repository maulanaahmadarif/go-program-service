import { Request, Response } from 'express';
import { sequelize } from '../db';

/**
 * Liveness Probe
 * Checks if the application is alive and running
 * This is a lightweight check that just verifies the process is responding
 */
export const livenessProbe = async (req: Request, res: Response) => {
  try {
    // Simple check - if we can respond, the app is alive
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  } catch (error) {
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
export const readinessProbe = async (req: Request, res: Response) => {
  try {
    // Check database connection
    await sequelize.authenticate();

    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString(),
      checks: {
        database: 'connected',
      },
    });
  } catch (error: any) {
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
