import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { config } from '@paymentflow/shared';
export const generateAccessToken = (payload) => {
    return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
};
export const generateRefreshToken = (payload) => {
    return jwt.sign(payload, config.jwtRefreshSecret, { expiresIn: config.jwtRefreshExpiresIn });
};
export const verifyAccessToken = (token) => {
    try {
        return jwt.verify(token, config.jwtSecret);
    }
    catch {
        return null;
    }
};
export const verifyRefreshToken = (token) => {
    try {
        return jwt.verify(token, config.jwtRefreshSecret);
    }
    catch {
        return null;
    }
};
export const hashPassword = async (password) => {
    return bcrypt.hash(password, 12);
};
export const comparePassword = async (password, hash) => {
    return bcrypt.compare(password, hash);
};
export const hashToken = (token) => {
    return crypto.createHash('sha256').update(token).digest('hex');
};
//# sourceMappingURL=index.js.map