interface AuthRequest {
  action: string;
  token?: string;
}

interface User {
  id: string;
  email: string;
  status: 'pending' | 'active' | 'blocked';
  isAdmin: boolean;
}

export async function handleAuth(request: Request, env: any): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type':  'application/json' },
    });
  }

  try {
    const body = (await request.json()) as AuthRequest;
    const { action, token } = body;

    switch (action) {
      case 'verify':
        return verifyToken(token, env);

      case 'listUsers':
        return listUsers(token, env);

      case 'login':
        return handleLogin(body, env);

      default:
        return new Response(JSON.stringify({ error: 'Unknown action' }), {
          status: 400,
          headers:  { 'Content-Type': 'application/json' },
        });
    }
  } catch (error) {
    console.error('Auth error:', error);
    return new Response(JSON.stringify({ error: 'Auth failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function verifyToken(token: string | undefined, env: any): Promise<Response> {
  if (!token) {
    return new Response(
      JSON.stringify({ success: false, message: 'No token provided' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Validiraj token (koristi JWT ili custom logiku)
  const isValid = validateJWT(token, env);

  if (isValid) {
    // Provjerite da li je korisnik admin
    const isAdmin = await checkAdminStatus(token, env);

    return new Response(
      JSON.stringify({
        success: true,
        isAdmin:  isAdmin,
        message: 'Token is valid',
      }),
      { headers: { 'Content-Type':  'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ success: false, message: 'Invalid token' }),
    { status: 401, headers: { 'Content-Type': 'application/json' } }
  );
}

async function listUsers(token: string | undefined, env: any): Promise<Response> {
  if (!token) {
    return new Response(
      JSON.stringify({ success: false, message: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const isAdmin = await checkAdminStatus(token, env);

    if (! isAdmin) {
      return new Response(
        JSON.stringify({ success: false, message: 'Admin access required' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Čitaj korisnike iz R2
    let users: User[] = [];

    if (env.BUCKET) {
      const usersData = await env.BUCKET.get('users. json');
      if (usersData) {
        const text = await usersData.text();
        users = JSON.parse(text);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        users: users,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('List users error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Failed to list users' }),
      { status: 500, headers:  { 'Content-Type': 'application/json' } }
    );
  }
}

async function handleLogin(body: any, env: any): Promise<Response> {
  const { email, password } = body;

  if (!email || !password) {
    return new Response(
      JSON.stringify({ success: false, message: 'Email and password required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Implementiraj logiku za login
  // Generiši JWT token

  const token = generateJWT({ email }, env);

  return new Response(
    JSON.stringify({
      success: true,
      token:  token,
      message: 'Login successful',
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}

function validateJWT(token: string, env: any): boolean {
  // Implementiraj JWT validaciju
  try {
    // Dekoduj i validiraj token
    const parts = token.split('.');
    if (parts.length !== 3) return false;

    // Dodaj stvarnu validaciju sa secretom
    return true;
  } catch {
    return false;
  }
}

function generateJWT(payload: any, env: any): string {
  // Implementiraj JWT generisanje
  // Koristi tajni ključ iz environment varijabli
  return 'token_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

async function checkAdminStatus(token: string, env: any): Promise<boolean> {
  // Provjeri da li je korisnik admin
  // Ovaj primjer je semplifikovan
  return token. includes('admin');
}
