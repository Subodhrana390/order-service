import jwt from "jsonwebtoken";
import { config } from "../config/index.js";
import { ApiError } from "../utils/ApiError.js";
export const protect = (req, _, next) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
        return next(new ApiError(401, "No token provided"));
    }
    const token = header.split(" ")[1];
    try {
        const decoded = jwt.verify(token, config.jwt.secret);
        req.user = decoded;
        next();
    }
    catch (error) {
        return next(new ApiError(401, "Invalid or expired token"));
    }
};
export const authorizeRoles = (...allowedRoles) => (req, res, next) => {
    if (!req.user) {
        return next(new ApiError(401, "Unauthorized"));
    }
    if (!allowedRoles.includes(req.user.role)) {
        return next(new ApiError(403, `Access denied. Allowed roles: ${allowedRoles.join(", ")}`));
    }
    next();
};
