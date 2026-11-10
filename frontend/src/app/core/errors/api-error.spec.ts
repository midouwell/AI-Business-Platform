import { HttpErrorResponse } from '@angular/common/http';
import { getApiErrorMessage } from './api-error';

describe('getApiErrorMessage', () => {
  it('shows Nest validation messages', () => {
    const error = new HttpErrorResponse({
      status: 400,
      error: { message: ['email must be valid', 'password is required'] },
    });

    expect(getApiErrorMessage(error)).toBe('email must be valid password is required');
  });

  it('provides a useful network failure message', () => {
    const error = new HttpErrorResponse({ status: 0 });
    expect(getApiErrorMessage(error)).toContain('backend is running');
  });
});
