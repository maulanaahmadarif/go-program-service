import { Request, Response, NextFunction } from 'express';

const checkEmailDomain = (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ 
        message: 'Email is required' 
      });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const allowedDomains = ['@fokustarget.com', '@go-program.com', '@microsoft.com'];
    const isAllowedDomain = allowedDomains.some((domain) => normalizedEmail.endsWith(domain));
    
    if (!isAllowedDomain) {
      return res.status(401).json({ 
        message: 'Operation not allowed' 
      });
    }

    next();
  } catch (error) {
    console.error('Error in email domain check middleware:', error);
    return res.status(500).json({ 
      message: 'Internal server error' 
    });
  }
};

export default checkEmailDomain;
