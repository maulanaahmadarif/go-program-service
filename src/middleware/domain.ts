import { Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { User } from '../../models/User';

interface AuthenticatedRequest extends Request {
  user?: string | JwtPayload;
}

const checkDomain = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const user = req.user as JwtPayload;
    if (!user || !user.email) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    // Check if email ends with @fokustarget.com
    if (!user.email.endsWith('@fokustarget.com')) {
      return res.status(401).json({ message: 'Operation not allowed' });
    }

    next();
  } catch (error) {
    console.error('Error in domain check middleware:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export default checkDomain; 