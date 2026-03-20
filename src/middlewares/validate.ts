import { NextFunction, Request, Response } from "express";
import { ZodError, ZodIssue, ZodSchema } from "zod";
import { ApiError } from "../utils/ApiError.js";

export const validate =
  (schema: ZodSchema) =>
    async (req: Request, _res: Response, next: NextFunction) => {
      try {
        await schema.parseAsync(req.body);
        next();
      } catch (error) {
        if (error instanceof ZodError) {
          const formattedErrors = error.issues.map((issue: ZodIssue) => ({
            field: issue.path.join("."),
            message: issue.message,
          }));;

          return next(new ApiError(400, "Validation failed", formattedErrors));
        }

        next(error);
      }
    };
