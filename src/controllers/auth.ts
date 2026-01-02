import { Response } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { RefreshToken } from '../../models/RefreshToken';
import { User } from '../../models/User';
import { sequelize } from '../db';
import { Op } from 'sequelize';
import { CustomRequest } from '../types/api';

// Helper function to generate tokens
const generateTokens = (payload: any) => {
  const accessToken = jwt.sign(payload, process.env.JWT_SECRET as string, {
    expiresIn: '1d',
  });
  
  const refreshToken = jwt.sign(payload, process.env.REFRESH_JWT_SECRET as string, {
    expiresIn: '7d',
  });
  
  return { accessToken, refreshToken };
};

export const generateNewToken = async (req: CustomRequest, res: Response) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(403).json({ message: 'Refresh token missing' });

  try {
    // Find the refresh token in database
    const storedToken = await RefreshToken.findOne({
      where: {
        token: refreshToken,
        is_revoked: false,
        expires_at: {
          [Op.gt]: new Date() // Token must not be expired
        }
      },
      include: [{
        model: User,
        as: 'user',
        attributes: ['user_id', 'email', 'company_id']
      }]
    });

    if (!storedToken) {
      return res.status(403).json({ message: 'Invalid or expired refresh token' });
    }

    // Verify the token
    const payload: any = jwt.verify(refreshToken, process.env.REFRESH_JWT_SECRET as string);
    
    // Generate new tokens
    const { accessToken: newAccessToken, refreshToken: newRefreshToken } = generateTokens({
      userId: payload.userId,
      email: payload.email,
      companyId: payload.companyId
    });

    // Start a transaction
    const transaction = await sequelize.transaction();

    try {
      // Update the existing refresh token instead of creating a new one
      await storedToken.update({
        token: newRefreshToken,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        is_revoked: false
      }, { transaction });

      await transaction.commit();

      return res.json({ 
        message: 'Tokens refreshed successfully',
        accessToken: newAccessToken,
        refreshToken: newRefreshToken
      });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Refresh token expired, please log in again' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(403).json({ message: 'Invalid refresh token' });
    }
    req.log.error({ error, stack: error.stack }, 'Error refreshing tokens');
    return res.status(500).json({ message: 'Something went wrong' });
  }
};

export const revokeRefreshToken = async (req: CustomRequest, res: Response) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(404).json({ message: 'No refresh token found' });
  }
  
  try {
    const token = await RefreshToken.findOne({
      where: { token: refreshToken }
    });

    if (!token) {
      return res.status(404).json({ message: 'Token not found' });
    }

    token.is_revoked = true;
    await token.save();

    return res.json({ message: 'Logged out successfully' });
  } catch (error: any) {
    req.log.error({ error, stack: error.stack }, 'Error revoking token');
    return res.status(500).json({ message: 'Something went wrong' });
  }
};

// Export the helper function to be used in user login
export { generateTokens };