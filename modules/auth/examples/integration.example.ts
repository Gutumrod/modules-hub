import {
  AuthError,
  createAuthHelpers,
  createCredentialStoreAdapter,
  createJwtAdapter,
  createSupabaseAdapter,
  type AuthContext,
  type SupabaseAuthClient
} from '../index.js';

type MyDbUser = {
  id: string;
  email: string;
  userRole: string;
  organizationId: string;
  scope: string[];
};

const mockUserDatabase = new Map<string, MyDbUser>([
  [
    'session_token_alice',
    {
      id: 'usr_alice',
      email: 'alice@example.com',
      userRole: 'admin',
      organizationId: 'org_acme',
      scope: ['users:read', 'users:write', 'billing:admin']
    }
  ]
]);

const credentialStoreAdapter = createCredentialStoreAdapter<string, MyDbUser>({
  verify: async (sessionToken) => mockUserDatabase.get(sessionToken) ?? null
});

const customDbAuth = createAuthHelpers({
  provider: credentialStoreAdapter,
  normalize: (dbUser: MyDbUser): AuthContext => ({
    userId: dbUser.id,
    email: dbUser.email,
    roles: [dbUser.userRole],
    tenantId: dbUser.organizationId,
    permissions: dbUser.scope
  }),
  onAuthFailure: (err) => {
    console.warn(`[Custom DB Auth Audit] ${err.code} (${err.status}): ${err.message}`);
  }
});

async function handleCustomDbRequest(sessionHeader: string | null, targetOrgId: string) {
  try {
    const sessionToken = sessionHeader?.replace('Session ', '') ?? '';
    const context = await customDbAuth.requireUser({ credential: sessionToken });

    await customDbAuth.requireRole('admin');
    await customDbAuth.requirePermission('billing:admin');
    await customDbAuth.requireTenantMembership(targetOrgId);

    return { status: 200, body: { success: true, user: context.userId } };
  } catch (error) {
    if (error instanceof AuthError) {
      return { status: error.status, body: { error: error.code, message: error.message } };
    }

    return { status: 500, body: { error: 'INTERNAL_SERVER_ERROR' } };
  }
}

const mockSupabaseClient: SupabaseAuthClient = {
  auth: {
    async getUser(jwt?: string) {
      if (!jwt || jwt === 'invalid') {
        return { data: { user: null }, error: { message: 'Invalid token', status: 401 } };
      }

      if (jwt === 'expired') {
        return {
          data: { user: null },
          error: { message: 'jwt expired', status: 401, code: 'jwt_expired' }
        };
      }

      return {
        data: {
          user: {
            id: 'usr_supabase_bob',
            email: 'bob@example.com',
            app_metadata: {
              roles: ['editor'],
              tenant_id: 'tenant_globex',
              permissions: ['articles:publish']
            }
          }
        },
        error: null
      };
    }
  }
};

const supabaseAuth = createAuthHelpers({
  provider: createSupabaseAdapter(mockSupabaseClient)
});

async function handleSupabaseRequest(authHeader: string | null, targetTenantId: string) {
  try {
    const jwt = authHeader?.replace('Bearer ', '');
    const context = await supabaseAuth.requireUser({ credential: jwt });

    await supabaseAuth.requirePermission('articles:publish');
    await supabaseAuth.requireTenantMembership(targetTenantId);

    return { status: 200, body: { success: true, user: context.userId } };
  } catch (error) {
    if (error instanceof AuthError) {
      return { status: error.status, body: { error: error.code, message: error.message } };
    }

    return { status: 500, body: { error: 'INTERNAL_SERVER_ERROR' } };
  }
}

const jwtAuth = createAuthHelpers({
  provider: createJwtAdapter({
    verifyToken: async (token) => token === 'valid_jwt'
      ? {
          sub: 'usr_jwt_chris',
          email: 'chris@example.com',
          roles: ['auditor'],
          tenant_id: 'tenant_acme',
          permissions: ['reports:read']
        }
      : null
  })
});

async function handleJwtRequest(authHeader: string | null, targetTenantId: string) {
  try {
    const token = authHeader?.replace('Bearer ', '') ?? '';
    const context = await jwtAuth.requireUser({ credential: token });

    await jwtAuth.requirePermission('reports:read');
    await jwtAuth.requireTenantMembership(targetTenantId);

    return { status: 200, body: { success: true, user: context.userId } };
  } catch (error) {
    if (error instanceof AuthError) {
      return { status: error.status, body: { error: error.code, message: error.message } };
    }

    return { status: 500, body: { error: 'INTERNAL_SERVER_ERROR' } };
  }
}

async function runExamples() {
  console.log('=== Running Custom DB Adapter Examples ===');
  console.log('Custom DB Success:', await handleCustomDbRequest('Session session_token_alice', 'org_acme'));
  console.log(
    'Custom DB Cross-Tenant Attempt:',
    await handleCustomDbRequest('Session session_token_alice', 'org_evil_corp')
  );

  console.log('\n=== Running Supabase Adapter Examples ===');
  console.log('Supabase Success:', await handleSupabaseRequest('Bearer valid_jwt', 'tenant_globex'));
  console.log('Supabase Expired Token:', await handleSupabaseRequest('Bearer expired', 'tenant_globex'));

  console.log('\n=== Running JWT Adapter Examples ===');
  console.log('JWT Success:', await handleJwtRequest('Bearer valid_jwt', 'tenant_acme'));
  console.log('JWT Invalid Token:', await handleJwtRequest('Bearer invalid_jwt', 'tenant_acme'));
}

void runExamples();
