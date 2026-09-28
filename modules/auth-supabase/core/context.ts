import { AuthError } from './error.js';
import type { 
  AuthContext, 
  GetCurrentUserOptions, 
  SupabaseAuthClient
} from './types.js';

/**
 * Resolves current user session into a normalized AuthContext.
 */
export async function getCurrentUser(
  client: SupabaseAuthClient,
  options?: GetCurrentUserOptions
): Promise<AuthContext | null> {
  const { data, error } = await client.auth.getUser(options?.jwt);

  if (error) {
    // If Supabase returns an error, we check if it's a session error
    const isInvalidSession = 
      error.status === 401 || 
      error.code === 'jwt_expired' || 
      error.message.toLowerCase().includes('invalid') ||
      error.message.toLowerCase().includes('expired');

    if (isInvalidSession) {
      throw new AuthError({
        message: error.message,
        code: 'INVALID_SESSION',
        status: 401,
        cause: error
      });
    }
    
    // For other errors (network, etc.), we return null as it might be an unauthenticated state
    return null;
  }

  const user = data.user;
  if (!user) return null;

  // 1. Resolve Roles
  let roles: string[] = [];
  if (options?.roleResolver) {
    roles = normalizeApplicationRoles(await options.roleResolver(user));
  } else {
    roles = normalizeApplicationRoles(user.app_metadata?.roles);
  }

  // 2. Resolve Tenant
  let tenantId: string | undefined;
  if (options?.tenantResolver) {
    tenantId = await options.tenantResolver(user);
  } else {
    // Default tenant resolution
    tenantId = normalizeOptionalString(user.app_metadata?.tenant_id);
  }

  // 3. Resolve Permissions
  let permissions: string[] = [];
  if (options?.permissionResolver) {
    permissions = await options.permissionResolver(user, roles);
  } else {
    // Default permission resolution
    permissions = normalizeStringArray(user.app_metadata?.permissions);
  }

  const context: AuthContext = {
    userId: user.id,
    email: user.email,
    roles,
    tenantId,
    permissions,
    metadata: {
      appMetadata: { ...(user.app_metadata ?? {}) },
      userMetadata: { ...(user.user_metadata ?? {}) }
    }
  };

  return Object.freeze(context);
}

const reservedDatabaseRoles = new Set(['authenticated', 'anon', 'service_role']);

function normalizeApplicationRoles(value: unknown): string[] {
  return normalizeStringArray(value).filter((role) => !reservedDatabaseRoles.has(role.toLowerCase()));
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
  return typeof value === 'string' && value.trim() ? [value.trim()] : [];
}

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/**
 * Requires an authenticated user session.
 */
export async function requireUser(
  client: SupabaseAuthClient,
  options?: GetCurrentUserOptions
): Promise<AuthContext> {
  const context = await getCurrentUser(client, options);
  
  if (!context) {
    throw new AuthError({
      message: 'Authentication required',
      code: 'UNAUTHENTICATED',
      status: 401
    });
  }

  return context;
}
