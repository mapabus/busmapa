export class Router {
  private routes: Map<string, (req: Request, env: any) => Promise<Response>> = new Map();

  register(path: string, handler: (req: Request, env: any) => Promise<Response>) {
    this.routes.set(path, handler);
  }

  async handle(pathname: string, request: Request, env: any): Promise<Response | null> {
    const handler = this.routes.get(pathname);
    if (handler) {
      return await handler(request, env);
    }

    // Pokušaj sa wildcard rutama
    for (const [path, handler] of this.routes. entries()) {
      if (path.includes('*')) {
        const pattern = new RegExp('^' + path.replace('*', '.*') + '$');
        if (pattern.test(pathname)) {
          return await handler(request, env);
        }
      }
    }

    return null;
  }
}
