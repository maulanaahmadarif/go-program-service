import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';

export const generateNewToken = (req: Request, res: Response) => {
  const refreshToken = req.body.refreshToken;
  if (!refreshToken) return res.status(403).json({ message: 'Refresh token missing' });

  try {
    const payload: any = jwt.verify(refreshToken, process.env.REFRESH_JWT_SECRET as string);
    const newAccessToken = jwt.sign({ userId: payload.userId, email: payload.email, companyId: payload.companyId }, process.env.JWT_SECRET as string, {
      expiresIn: '1d',  // Adjust expiration as needed
    });
    return res.json({ message: 'Login successful', token: newAccessToken });
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Refresh token expired, please log in again' });
    }
    return res.status(403).json({ message: 'Invalid refresh token' });
  }
} 