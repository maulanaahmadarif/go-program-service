import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { RefreshToken } from '../../models/RefreshToken';
import { User } from '../../models/User';
import { sequelize } from '../db';
import { Op } from 'sequelize';

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

// Helper function to get cookie domain from APP_URL
const getCookieDomain = () => {
  if (process.env.NODE_ENV !== 'production') {
    return 'localhost';
  }
  return undefined; // Let the browser handle the domain for cross-site cookies
};

export const generateNewToken = async (req: Request, res: Response) => {
  const refreshToken = req.cookies.refreshToken;
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

      // Set new cookies with cross-site settings
      res.cookie('accessToken', newAccessToken, {
        httpOnly: true,
        secure: true, // Always use secure in production
        sameSite: 'none', // Required for cross-site cookies
        domain: getCookieDomain(),
        maxAge: 24 * 60 * 60 * 1000 // 1 day
      });

      res.cookie('refreshToken', newRefreshToken, {
        httpOnly: true,
        secure: true, // Always use secure in production
        sameSite: 'none', // Required for cross-site cookies
        domain: getCookieDomain(),
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      return res.json({ message: 'Tokens refreshed successfully' });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      res.clearCookie('accessToken');
      res.clearCookie('refreshToken');
      return res.status(401).json({ message: 'Refresh token expired, please log in again' });
    }
    if (error.name === 'JsonWebTokenError') {
      res.clearCookie('accessToken');
      res.clearCookie('refreshToken');
      return res.status(403).json({ message: 'Invalid refresh token' });
    }
    console.error('Error refreshing tokens:', error);
    return res.status(500).json({ message: 'Something went wrong' });
  }
};

export const revokeRefreshToken = async (req: Request, res: Response) => {
  const refreshToken = req.cookies.refreshToken;
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

    // Clear cookies with cross-domain support
    res.cookie('accessToken', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      domain: getCookieDomain(),
      maxAge: 0
    });

    res.cookie('refreshToken', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      domain: getCookieDomain(),
      maxAge: 0
    });

    return res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Error revoking token:', error);
    return res.status(500).json({ message: 'Something went wrong' });
  }
};

// Export the helper function to be used in user login
export { generateTokens };