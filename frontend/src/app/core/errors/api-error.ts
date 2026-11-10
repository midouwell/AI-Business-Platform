import { HttpErrorResponse } from '@angular/common/http';

export function getApiErrorMessage(error: unknown): string {
  if (!(error instanceof HttpErrorResponse)) {
    return 'Something went wrong. Please try again.';
  }

  const body: unknown = error.error;
  if (typeof body === 'object' && body !== null && 'message' in body) {
    const message = (body as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
    if (Array.isArray(message) && message.every((item) => typeof item === 'string')) {
      return message.join(' ');
    }
  }

  if (error.status === 0) {
    return 'Unable to reach the API. Check that the backend is running and try again.';
  }
  if (error.status === 401) {
    return 'Your session has expired. Please sign in again.';
  }
  if (error.status === 403) {
    return 'You do not have permission to perform this action.';
  }
  if (error.status >= 500) {
    return 'The server could not complete your request. Please try again shortly.';
  }

  return 'The request could not be completed. Check your input and try again.';
}
