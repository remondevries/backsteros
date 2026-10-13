export function apiErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Something went wrong";
  const message = error.message.trim();
  if (
    message === "Failed to fetch" ||
    message === "NetworkError when attempting to fetch resource." ||
    message === "Load failed" ||
    error.name === "NetworkError"
  ) {
    return "Could not reach the API. Check that the backend is running.";
  }
  return message || "Something went wrong";
}
