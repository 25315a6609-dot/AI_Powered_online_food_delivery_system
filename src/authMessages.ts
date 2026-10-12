export function normalizeAuthError(mode: "login" | "signup", rawMessage: string) {
  const message = rawMessage.toLowerCase();

  if (message.includes("already exists") || message.includes("account already")) {
    return "This account already exists. Please log in.";
  }

  if (message.includes("incorrect password")) {
    return "Incorrect password. Please try again.";
  }

  if (message.includes("valid email address")) {
    return "Enter a valid email address.";
  }

  if (message.includes("at least 8 characters")) {
    return "Password must be at least 8 characters.";
  }

  if (message.includes("128 characters or fewer")) {
    return "Password must be 128 characters or fewer.";
  }

  if (message.includes("authentication service is unavailable")) {
    return "Unable to reach the login service. Please try again later.";
  }

  if (
    message.includes("invalid email or password") ||
    message.includes("not found") ||
    message.includes("not yet created") ||
    message.includes("not available") ||
    message.includes("wrong password")
  ) {
    if (mode === "login") {
      return "This account is not yet created or is not available. Please sign up first.";
    }
    return "This account already exists. Please log in.";
  }

  if (
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("fetch") ||
    message.includes("load failed")
  ) {
    return "Unable to reach the server right now. Please try again in a moment.";
  }

  return "We couldn't complete that request. Please try again.";
}
