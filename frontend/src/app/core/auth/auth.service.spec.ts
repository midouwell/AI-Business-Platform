import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { SessionResponse } from '../models/api.models';

describe('AuthService', () => {
  let auth: AuthService;
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
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('stores the session returned by login', () => {
    auth.login(session.user.email, 'password').subscribe();
    http.expectOne('/api/auth/login').flush(session);

    expect(auth.user()).toEqual(session.user);
    expect(auth.accessToken()).toBe('access-token');
    expect(auth.isAuthenticated()).toBe(true);
    expect(JSON.parse(sessionStorage.getItem('ai-business-platform-session') ?? 'null')).toEqual(
      session,
    );
  });

  it('rotates the refresh token and shares concurrent refreshes', () => {
    auth.login(session.user.email, 'password').subscribe();
    http.expectOne('/api/auth/login').flush(session);

    const tokens: string[] = [];
    auth.refreshAccessToken().subscribe((token) => tokens.push(token));
    auth.refreshAccessToken().subscribe((token) => tokens.push(token));

    const request = http.expectOne('/api/auth/refresh');
    expect(request.request.body).toEqual({ refreshToken: 'refresh-token' });
    request.flush({ ...session, accessToken: 'rotated-access' });

    expect(tokens).toEqual(['rotated-access', 'rotated-access']);
    expect(auth.accessToken()).toBe('rotated-access');
  });
});
