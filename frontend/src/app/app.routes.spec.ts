import { routes } from './app.routes';

describe('application routes', () => {
  it('defines guarded authenticated and public account flows', () => {
    expect(routes.map((route) => route.path)).toEqual(['login', 'register', 'app', '', '**']);

    const workspaceRoute = routes.find((route) => route.path === 'app');
    expect(workspaceRoute?.canActivate).toBeDefined();
    expect(workspaceRoute?.children?.map((route) => route.path)).toEqual([
      '',
      'chat/:conversationId',
      'account',
    ]);
  });
});
