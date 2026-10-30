import { log } from '../config/logging.js';
import type { Request, Response, NextFunction } from 'express';
interface HandledError extends Error {
  status?: number;
  statusCode?: number;
  code?: string;
  type?: string;
}
function isSourceOwnedError(error: unknown): boolean {
  const seen = new Set<object>();
  let current = error;
  while (
    typeof current === 'object' &&
    current !== null &&
    !seen.has(current) &&
    seen.size < 10
  ) {
    seen.add(current);
    if ('code' in current && current.code === 'P7001') return true;
    current = 'cause' in current ? current.cause : null;
  }
  return false;
}
const errorHandler = (
  err: HandledError,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  log(
    'error',
    `Error caught by centralized handler: ${err.message}`,
    err.stack
  );
  // Default to 500 Internal Server Error
  let statusCode = err.status || err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let code: string | undefined =
    typeof err.code === 'string' ? err.code : undefined;

  if (isSourceOwnedError(err)) {
    statusCode = 409;
    code = 'source_owned';
    message = 'source_owned';
  } else if (
    err.name === 'PayloadTooLargeError' ||
    err.type === 'entity.too.large' ||
    statusCode === 413
  ) {
    statusCode = 413;
    code = 'IMAGE_TOO_LARGE';
    message = 'Request payload too large. Please reduce the image size.';
  } else {
    // Handle specific error types if needed (e.g., database errors, validation errors)
    switch (err.name) {
      case 'UnauthorizedError':
        statusCode = 401;
        message = 'Unauthorized: Invalid or missing token.';
        break;
      case 'ForbiddenError':
        statusCode = 403;
        message =
          'Forbidden: You do not have permission to perform this action.';
        break;
      case 'ValidationError':
        statusCode = 400;
        message = err.message;
        break;
      default:
        if (err.code === '23505') {
          statusCode = 409;
          message =
            'Conflict: A resource with this unique identifier already exists.';
        }
        break;
    }
  }
  res.status(statusCode).json({
    error: message,
    code,
    details: process.env.NODE_ENV === 'development' ? err.stack : undefined, // Only send stack in development
  });
};
export default errorHandler;
