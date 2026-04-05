import jwt, { JwtPayload } from "jsonwebtoken";
import { config } from "../config/index.js";
import { ApiError } from "../utils/ApiError.js";
import { Request, Response, NextFunction } from "express";
import { AuthUser } from "../types/express.js";

export const authenticateJWT = (
  req: Request,
  _: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers["authorization"];

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next(new ApiError(401, "Authorization token missing"));
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload;
    req.user = decoded as AuthUser;
    next();
  } catch (error) {
    return next(new ApiError(401, "Invalid or expired token"));
  }
};

export const authorize = (...roles: string[]) => {
  return (req: Request, _: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new ApiError(403, "Forbidden: Insufficient privileges"));
    }
    next();
  };
};
