import { HttpBackend, HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { catchError, finalize, map, Observable, shareReplay, tap, throwError } from 'rxjs';
import { AuthUser, SessionResponse } from '../models/api.models';

const SESSION_KEY = 'ai-business-platform-session';
const API_BASE = '/api';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http: HttpClient;
  private readonly session = signal<SessionResponse | null>(this.readStoredSession());
  private refreshRequest$: Observable<string> | null = null;

  readonly user = computed(() => this.session()?.user ?? null);
  readonly accessToken = computed(() => this.session()?.accessToken ?? null);
  readonly isAuthenticated = computed(() => this.accessToken() !== null);

  constructor(handler: HttpBackend) {
    this.http = new HttpClient(handler);
  }

  login(email: string, password: string): Observable<SessionResponse> {
    return this.startSession(
      this.http.post<SessionResponse>(`${API_BASE}/auth/login`, {
        email,
        password,
      }),
    );
  }

  register(payload: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }): Observable<SessionResponse> {
    return this.startSession(this.http.post<SessionResponse>(`${API_BASE}/auth/register`, payload));
  }

  refreshAccessToken(): Observable<string> {
    if (this.refreshRequest$) {
      return this.refreshRequest$;
    }

    const refreshToken = this.session()?.refreshToken;
    if (!refreshToken) {
      return throwError(() => new Error('No refresh token is available.'));
    }

    this.refreshRequest$ = this.http
      .post<SessionResponse>(`${API_BASE}/auth/refresh`, { refreshToken })
      .pipe(
        tap((session) => this.saveSession(session)),
        map((session) => session.accessToken),
        catchError((error: unknown) => {
          this.logout();
          return throwError(() => error);
        }),
        finalize(() => {
          this.refreshRequest$ = null;
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );

    return this.refreshRequest$;
  }

  logout(): void {
    this.session.set(null);
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(SESSION_KEY);
    }
  }

  private startSession(request: Observable<SessionResponse>): Observable<SessionResponse> {
    return request.pipe(tap((session) => this.saveSession(session)));
  }

  private saveSession(session: SessionResponse): void {
    this.session.set(session);
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    }
  }

  private readStoredSession(): SessionResponse | null {
    if (typeof sessionStorage === 'undefined') {
      return null;
    }

    try {
      const stored = sessionStorage.getItem(SESSION_KEY);
      if (!stored) {
        return null;
      }

      const session: unknown = JSON.parse(stored);
      if (!this.isSession(session)) {
        sessionStorage.removeItem(SESSION_KEY);
        return null;
      }

      return session;
    } catch {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
  }

  private isSession(value: unknown): value is SessionResponse {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    const candidate = value as Partial<SessionResponse>;
    const user = candidate.user as Partial<AuthUser> | undefined;

    return (
      typeof candidate.accessToken === 'string' &&
      candidate.accessToken.length > 0 &&
      typeof candidate.refreshToken === 'string' &&
      candidate.refreshToken.length > 0 &&
      typeof user?.id === 'string' &&
      typeof user.email === 'string' &&
      (user.role === 'USER' || user.role === 'ADMIN') &&
      (user.firstName === null || typeof user.firstName === 'string') &&
      (user.lastName === null || typeof user.lastName === 'string')
    );
  }
}
