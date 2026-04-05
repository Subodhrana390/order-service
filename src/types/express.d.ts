import "express";

interface AuthUser {
  id: string;
  role: string;
}

declare module "express" {
  interface Request {
    user?: AuthUser;
    shopId?: string;
  }
}
