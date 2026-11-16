import type { NextFunction, Request, Response } from "express";
import { logger } from "../logger";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: { code: "NOT_FOUND", message: `No route for ${req.method} ${req.path}`, requestId: req.requestId },
  });
}

/**
 * Single exit point for failures. Clients receive a stable shape with a
 * request ID they can quote; stack traces and provider internals never
 * leave the server.
 */
export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction): void {
  const isKnown = error instanceof ApiError;
  const apiError = isKnown
    ? error
    : new ApiError(500, "INTERNAL_ERROR", "An unexpected error occurred while handling the request.");

  if (isKnown) {
    // Deliberate outcomes (validation failures, provider unavailable) are
    // operational signal, not defects — no stack trace needed.
    logger.warn({ requestId: req.requestId, code: apiError.code, status: apiError.status }, "request rejected");
  } else {
    logger.error({ requestId: req.requestId, err: error }, "unhandled request failure");
  }

  res.status(apiError.status).json({
    error: {
      code: apiError.code,
      message: apiError.message,
      requestId: req.requestId,
      ...(apiError.details === undefined ? {} : { details: apiError.details }),
    },
  });
}
