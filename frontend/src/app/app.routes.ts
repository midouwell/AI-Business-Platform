import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/login.component').then((component) => component.LoginComponent),
  },
  {
    path: 'register',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/register.component').then((component) => component.RegisterComponent),
  },
  {
    path: 'app',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/workspace/workspace.component').then(
        (component) => component.WorkspaceComponent,
      ),
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./features/home/home.component').then((component) => component.HomeComponent),
      },
      {
        path: 'chat/:conversationId',
        loadComponent: () =>
          import('./features/chat/chat.component').then((component) => component.ChatComponent),
      },
      {
        path: 'knowledge-bases',
        loadComponent: () =>
          import('./features/knowledge-base/knowledge-base.component').then(
            (component) => component.KnowledgeBaseComponent,
          ),
      },
      {
        path: 'account',
        loadComponent: () =>
          import('./features/account/account.component').then(
            (component) => component.AccountComponent,
          ),
      },
    ],
  },
  { path: '', pathMatch: 'full', redirectTo: 'app' },
  { path: '**', redirectTo: 'app' },
];
