import { NextFunction, Response } from 'express';

import { User } from '../../models/User';
import { CustomRequest } from '../types/api';

const requireInternal = async (req: CustomRequest, res: Response, next: NextFunction) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const user = await User.findByPk(userId, {
      attributes: ['user_id', 'level', 'is_active'],
    });

    if (!user) {
      return res.status(401).json({ message: 'User account not found' });
    }

    if (user.level !== 'INTERNAL' || !user.is_active) {
      return res.status(403).json({ message: 'Internal access required' });
    }

    return next();
  } catch (error: any) {
    req.log.error({ error, stack: error.stack }, 'Failed to authorize internal user');
    return res.status(500).json({ message: 'Unable to verify access' });
  }
};

export default requireInternal;
