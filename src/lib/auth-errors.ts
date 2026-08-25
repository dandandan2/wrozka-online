/**
 * Maps Supabase auth error codes to short, generic user-facing messages so
 * provider-internal error text never reaches the UI unfiltered.
 */
export function toAuthErrorMessage(error: { code?: string; message: string }): string {
  switch (error.code) {
    case "otp_expired":
      return "That link or code has expired. Request a new one.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Too many attempts. Please wait a moment and try again.";
    case "invalid_credentials":
      return "That code is invalid. Check it and try again.";
    default:
      return "Something went wrong. Please try again.";
  }
}
