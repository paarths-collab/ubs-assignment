export type ErrorCode =
  | "INVALID_FILTER"
  | "INVALID_DATE_RANGE"
  | "INVALID_SELECTION"
  | "PATTERN_NOT_FOUND"
  | "NO_EVENTS_MATCH"
  | "AI_UNAVAILABLE"
  | "AI_INVALID_RESPONSE"
  | "INTERNAL_ERROR";

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  INVALID_FILTER: 400,
  INVALID_DATE_RANGE: 400,
  INVALID_SELECTION: 400,
  PATTERN_NOT_FOUND: 404,
  NO_EVENTS_MATCH: 404,
  AI_UNAVAILABLE: 503,
  AI_INVALID_RESPONSE: 502,
  INTERNAL_ERROR: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = STATUS_BY_CODE[code];
  }
}
