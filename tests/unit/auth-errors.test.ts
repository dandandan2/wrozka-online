import { describe, expect, it } from "vitest";
import { toAuthErrorMessage } from "@/lib/auth-errors";

describe("toAuthErrorMessage", () => {
  it.each([
    ["otp_expired", "That link or code has expired. Request a new one."],
    ["invalid_credentials", "That code is invalid. Check it and try again."],
    ["over_email_send_rate_limit", "Too many attempts. Please wait a moment and try again."],
    ["over_request_rate_limit", "Too many attempts. Please wait a moment and try again."],
    ["some_unrecognized_code", "Something went wrong. Please try again."],
    [undefined, "Something went wrong. Please try again."],
  ])("maps %s to the expected user-facing message", (code, expected) => {
    expect(toAuthErrorMessage({ code, message: "raw provider message" })).toBe(expected);
  });
});
