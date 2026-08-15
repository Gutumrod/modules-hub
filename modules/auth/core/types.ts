import type { AuthError } from './error.js';

/**
 * Universal, normalized Auth Context structure passed to application business logic.
 * Completely decouples downstream services from underlying database records or JWT schemas.
 */
export type AuthContext = {
  /** Unique user identifier */
  userId: string;
  /** List of assigned user roles (e.g. ['admin', 'editor']) */
  roles?: string[];
  /** Primary tenant ID for multi-tenant isolation */
  tenantId?: string;
  /** List of fine-grained permissions (e.g. ['posts:write', 'billing:read']) */
  permissions?: string[];
  /** Optional user email address */
  email?: string;
  /** Custom application metadata key-value pairs */
  metadata?: Record<string, unknown>;
};

/**
 * Generic Identity Provider interface.
 * Implemented by concrete adapters or custom host resolvers.
 */
export interface IdentityProvider<TCredential = unknown, TRawIdentity = unknown> {
  /**
   * Resolves a raw identity from supplied credentials (e.g. JWT token, session ID, API key, user/pass struct).
   * Returns TRawIdentity if valid, or null if unauthenticated / not found.
   * Throws AuthError with code 'INVALID_SESSION' if credential is malformed or expired.
   */
  resolve(credential?: TCredential): Promise<TRawIdentity | null>;
}

/** Function signature for mapping a raw identity into a normalized AuthContext */
export type IdentityNormalizer<TRawIdentity = unknown> = (
  raw: TRawIdentity
) => AuthContext | Promise<AuthContext>;

/** Options when resolving an identity for a specific operation */
export type ResolveUserOptions<TCredential = unknown, TRawIdentity = unknown> = {
  /** Explicit credential to resolve (e.g. bearer token, session token, credential object) */
  credential?: TCredential;
  /** Optional custom normalizer override for this call */
  normalize?: IdentityNormalizer<TRawIdentity>;
  /** Optional custom role resolver override */
  roleResolver?: (raw: TRawIdentity) => string[] | Promise<string[]>;
  /** Optional custom tenant resolver override */
  tenantResolver?: (raw: TRawIdentity) => string | undefined | Promise<string | undefined>;
  /** Optional custom permission resolver override */
  permissionResolver?: (raw: TRawIdentity, roles?: string[]) => string[] | Promise<string[]>;
};

/** Options for Role Guard evaluation */
export type RoleGuardOptions = {
  /** Evaluation mode: 'ANY' requires at least one matching role; 'ALL' requires all roles (Default: 'ANY') */
  mode?: 'ANY' | 'ALL';
};

/** Options for Permission Guard evaluation */
export type PermissionGuardOptions = {
  /** Evaluation mode: 'ANY' requires at least one permission; 'ALL' requires all permissions (Default: 'ANY') */
  mode?: 'ANY' | 'ALL';
};

/** Module configuration contract injected by Host */
export type AuthConfig<TCredential = unknown, TRawIdentity = unknown> = {
  /** The IdentityProvider instance responsible for validating credentials */
  provider: IdentityProvider<TCredential, TRawIdentity>;
  /** Default normalizer converting raw identity to normalized AuthContext */
  normalize?: IdentityNormalizer<TRawIdentity>;
  /** Default custom role resolver callback */
  roleResolver?: (raw: TRawIdentity) => string[] | Promise<string[]>;
  /** Default custom tenant resolver callback */
  tenantResolver?: (raw: TRawIdentity) => string | undefined | Promise<string | undefined>;
  /** Default custom permission resolver callback */
  permissionResolver?: (raw: TRawIdentity, roles?: string[]) => string[] | Promise<string[]>;
  /** Optional callback invoked on authentication or authorization failure */
  onAuthFailure?: (error: AuthError) => void;
};

/**
 * Structural interface for Supabase Auth client.
 * Decouples module from direct @supabase/supabase-js runtime dependency.
 */
export interface SupabaseAuthClient {
  auth: {
    getUser(jwt?: string): Promise<{
      data: { user: SupabaseUser | null };
      error: { message: string; status?: number; code?: string } | null;
    }>;
  };
}

/** Normalized user shape from Supabase Auth responses */
export type SupabaseUser = {
  id: string;
  email?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
  role?: string;
};

/** Options for Credential Store Adapter */
export type CredentialStoreAdapterOptions<TCredential = unknown, TRawIdentity = unknown> = {
  /** Host-injected verification function against any data store */
  verify: (credential: TCredential) => Promise<TRawIdentity | null>;
};

/** Options for JWT Adapter */
export type JwtAdapterOptions<TPayload = Record<string, unknown>> = {
  /** Host-injected verification callback using host's preferred JWT library (jose, jsonwebtoken, etc.) */
  verifyToken: (token: string) => Promise<TPayload | null>;
};
