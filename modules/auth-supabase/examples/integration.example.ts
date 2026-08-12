import {
  createSupabaseAuthHelpers,
  AuthError,
  type SupabaseAuthClient,
  type AuthContext
} from '../index.js';

/**
 * 1. Host initializes Supabase Client
 * In a real app, this would be from @supabase/supabase-js
 */
const mockSupabaseClient: SupabaseAuthClient = {
  auth: {
    async getUser(jwt?: string) {
      if (!jwt || jwt === 'invalid') {
        return { data: { user: null }, error: { message: 'Invalid token', status: 401 } };
      }
      if (jwt === 'expired') {
        return { data: { user: null }, error: { message: 'jwt expired', status: 401, code: 'jwt_expired' } };
      }
      return {
        data: {
          user: {
            id: 'usr_12345',
            email: 'user@example.com',
            app_metadata: {
              roles: ['editor'],
              tenant_id: 'tenant_acme',
              permissions: ['documents:read', 'documents:write']
            },
            user_metadata: {}
          }
        },
        error: null
      };
    }
  }
};

/**
 * 2. Instantiate Auth Helpers module
 */
const auth = createSupabaseAuthHelpers({
  supabaseClient: mockSupabaseClient,
  onAuthFailure: (err) => {
    console.warn(`[Auth Audit Failure] Code: ${err.code} Status: ${err.status} Msg: ${err.message}`);
  }
});

/**
 * 3. Example Request Handler
 */
async function handleTenantDocumentRequest(authHeader: string | null, targetTenantId: string) {
  try {
    const jwt = authHeader?.replace('Bearer ', '');

    // Step A: Require Authenticated User
    const context: AuthContext = await auth.requireUser({ jwt });
    console.log(`Authenticated User: ${context.userId} (${context.email})`);

    // Step B: Require Specific Role or Permission
    auth.requirePermission('documents:write', { jwt });

    // Step C: Enforce Multi-Tenant Isolation
    auth.requireTenantMembership(targetTenantId, { jwt });

    console.log(`Access Granted to ${context.userId} for Tenant ${targetTenantId}`);
    return { status: 200, body: { success: true } };
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        status: error.status,
        body: { error: error.code, message: error.message }
      };
    }
    console.error('Unexpected error:', error);
    return { status: 500, body: { error: 'INTERNAL_SERVER_ERROR' } };
  }
}

/**
 * 4. Test Execution
 */
async function runExample() {
  console.log('--- Case 1: Valid Tenant Access ---');
  const res1 = await handleTenantDocumentRequest('Bearer valid_jwt_token', 'tenant_acme');
  console.log('Result 1:', JSON.stringify(res1, null, 2));

  console.log('\n--- Case 2: Cross-Tenant Breach Attempt ---');
  const res2 = await handleTenantDocumentRequest('Bearer valid_jwt_token', 'tenant_evil_corp');
  console.log('Result 2:', JSON.stringify(res2, null, 2));

  console.log('\n--- Case 3: Expired Token ---');
  const res3 = await handleTenantDocumentRequest('Bearer expired', 'tenant_acme');
  console.log('Result 3:', JSON.stringify(res3, null, 2));
}

runExample();
