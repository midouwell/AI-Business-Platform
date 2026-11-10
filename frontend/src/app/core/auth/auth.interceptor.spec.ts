import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from './auth.service';
import { authInterceptor } from './auth.interceptor';
import { SessionResponse } from '../models/api.models';

describe('authInterceptor', () => {
  let auth: AuthService;
  let client: HttpClient;
  let http: HttpTestingController;

  const session: SessionResponse = {
    user: {
      id: 'user-id',
      email: 'person@example.com',
      role: 'USER',
      firstName: 'Sample',
      lastName: 'Person',
    },
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
  };

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    auth = TestBed.inject(AuthService);
    client = TestBed.inject(HttpClient);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('adds the bearer token and refreshes once after an unauthorized response', () => {
    auth.login(session.user.email, 'password').subscribe();
    http.expectOne('/api/auth/login').flush(session);

    let response: unknown;
    client.get('/api/conversations').subscribe((value) => (response = value));
    const unauthorized = http.expectOne('/api/conversations');
    expect(unauthorized.request.headers.get('Authorization')).toBe('Bearer access-token');
    unauthorized.flush({}, { status: 401, statusText: 'Unauthorized' });

    const refreshedSession = {
      ...session,
      accessToken: 'rotated-access-token',
      refreshToken: 'rotated-refresh-token',
    };
    const refresh = http.expectOne('/api/auth/refresh');
    expect(refresh.request.body).toEqual({ refreshToken: 'refresh-token' });
    refresh.flush(refreshedSession);

    const retry = http.expectOne('/api/conversations');
    expect(retry.request.headers.get('Authorization')).toBe('Bearer rotated-access-token');
    retry.flush([]);

    expect(response).toEqual([]);
    expect(auth.accessToken()).toBe('rotated-access-token');
  });
});
