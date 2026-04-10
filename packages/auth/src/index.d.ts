export interface TokenPayload {
    userId: string;
    email: string;
    role: string;
}
export declare const generateAccessToken: (payload: TokenPayload) => string;
export declare const generateRefreshToken: (payload: TokenPayload) => string;
export declare const verifyAccessToken: (token: string) => TokenPayload | null;
export declare const verifyRefreshToken: (token: string) => TokenPayload | null;
export declare const hashPassword: (password: string) => Promise<string>;
export declare const comparePassword: (password: string, hash: string) => Promise<boolean>;
export declare const hashToken: (token: string) => string;
