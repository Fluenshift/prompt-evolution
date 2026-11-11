// The Responses allowance includes reasoning tokens and the structured result.
// A Writing Sample evaluation needs a small, bounded JSON result.
export const EVALUATION_MAX_OUTPUT_TOKENS = 6_000;

export const EVALUATION_REQUEST_TIMEOUT_MILLISECONDS = 90_000;

export const EVALUATION_HTTP_IDLE_TIMEOUT_SECONDS =
  Math.ceil(EVALUATION_REQUEST_TIMEOUT_MILLISECONDS / 1000) + 30;
