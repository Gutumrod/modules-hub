/**
 * Normalized Auth Context structure passed to business logic.
 * Decouples downstream code from raw Supabase User / JWT schemas.
 */
export type AuthContext = {
  /** Unique user identifier (UUID) */
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

/** Options when resolving current user session */
export type GetCurrentUserOptions = {
  /** Explicit JWT bearer token (overrides client default session) */
  jwt?: string;
  /** Optional custom role resolver override */
  roleResolver?: (user: SupabaseUser) => string[] | Promise<string[]>;
  /** Optional custom tenant resolver override */
  tenantResolver?: (user: SupabaseUser) => string | undefined | Promise<string | undefined>;
  /** Optional custom permission resolver override */
  permissionResolver?: (user: SupabaseUser, roles?: string[]) => string[] | Promise<string[]>;
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

/**
 * Minimal structural interface for Supabase Auth client.
 * Decouples module from specific @supabase/supabase-js library versions.
 */
export interface SupabaseAuthClient {
  auth: {
    getUser(jwt?: string): Promise<{
      data: { user: SupabaseUser | null };
      error: { message: string; status?: number; code?: string } | null;
    }>;
  };
}

/** Normalized user object extracted from Supabase response */
export type SupabaseUser = {
  id: string;
  email?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
  role?: string;
};

/** Module configuration contract injected by Host */
export type SupabaseAuthConfig = {
  /** Supabase client instance or compatible adapter injected by Host */
  supabaseClient: SupabaseAuthClient;
  /** Default custom role resolver callback */
  roleResolver?: (user: SupabaseUser) => string[] | Promise<string[]>;
  /** Default custom tenant resolver callback */
  tenantResolver?: (user: SupabaseUser) => string | undefined | Promise<string | undefined>;
  /** Default custom permission resolver callback */
  permissionResolver?: (user: SupabaseUser, roles?: string[]) => string[] | Promise<string[]>;
  /** Optional callback invoked on authentication or authorization failure */
  onAuthFailure?: (error: any) => void;
};
