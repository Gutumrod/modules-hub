import { AuthError } from './error.js';
import type {
  AuthContext,
  IdentityProvider,
  ResolveUserOptions
} from './types.js';

type RawRecord = Record<string, unknown>;

const standardMetadataKeys = new Set([
  'userId',
  'id',
  'sub',
  'uid',
  'email',
  'roles',
  'role',
  'tenantId',
  'tenant_id',
  'permissions',
  'metadata',
  'app_metadata',
  'user_metadata'
]);

export async function getCurrentUser<TCredential = unknown, TRawIdentity = unknown>(
  provider: IdentityProvider<TCredential, TRawIdentity>,
  options?: ResolveUserOptions<TCredential, TRawIdentity>
): Promise<AuthContext | null> {
  let rawIdentity: TRawIdentity | null;

  try {
    rawIdentity = await provider.resolve(options?.credential);
  } catch (error) {
    if (error instanceof AuthError) {
      throw error;
    }

    throw new AuthError({
      message: 'Identity provider failed to resolve credential',
      code: 'INVALID_SESSION',
      status: 401,
      cause: error
    });
  }

  if (rawIdentity == null) {
    return null;
  }

  if (options?.normalize) {
    return freezeContext(await options.normalize(rawIdentity));
  }

  return normalizeRawIdentity(rawIdentity, options);
}

export async function requireUser<TCredential = unknown, TRawIdentity = unknown>(
  provider: IdentityProvider<TCredential, TRawIdentity>,
  options?: ResolveUserOptions<TCredential, TRawIdentity>
): Promise<AuthContext> {
  const context = await getCurrentUser(provider, options);

  if (!context) {
    throw new AuthError({
      message: 'Authenticated user required',
      code: 'UNAUTHENTICATED',
      status: 401
    });
  }

  return context;
}

export async function normalizeRawIdentity<TRawIdentity = unknown>(
  raw: TRawIdentity,
  options?: Pick<
    ResolveUserOptions<unknown, TRawIdentity>,
    'roleResolver' | 'tenantResolver' | 'permissionResolver'
  >
): Promise<AuthContext> {
  if (!options?.roleResolver && !options?.tenantResolver && !options?.permissionResolver) {
    return normalizeRawIdentitySync(raw);
  }

  const record = asRecord(raw);
  const appMetadata = asRecord(record.app_metadata);
  const userMetadata = asRecord(record.user_metadata);
  const explicitMetadata = asRecord(record.metadata);

  const userId = firstString(record.userId, record.id, record.sub, record.uid);
  if (!userId) {
    throw new AuthError({
      message: 'Unable to resolve user identifier from identity payload',
      code: 'UNAUTHENTICATED',
      status: 401
    });
  }

  const email = firstString(record.email);
  const roles =
    options?.roleResolver
      ? normalizeStringArray(await options.roleResolver(raw))
      : firstStringArray(record.roles, record.role, appMetadata.roles, userMetadata.roles);
  const tenantId =
    options?.tenantResolver
      ? normalizeOptionalString(await options.tenantResolver(raw))
      : firstString(record.tenantId, record.tenant_id, appMetadata.tenant_id, userMetadata.tenant_id);
  const permissions =
    options?.permissionResolver
      ? normalizeStringArray(await options.permissionResolver(raw, roles))
      : firstStringArray(record.permissions, appMetadata.permissions, userMetadata.permissions);

  const context: AuthContext = {
    userId,
    ...(roles.length > 0 ? { roles } : {}),
    ...(tenantId ? { tenantId } : {}),
    ...(permissions.length > 0 ? { permissions } : {}),
    ...(email ? { email } : {})
  };

  const metadata = buildMetadata(record, explicitMetadata);
  if (Object.keys(metadata).length > 0) {
    context.metadata = metadata;
  }

  return freezeContext(context);
}

export function normalizeRawIdentitySync<TRawIdentity = unknown>(raw: TRawIdentity): AuthContext {
  const record = asRecord(raw);
  const appMetadata = asRecord(record.app_metadata);
  const userMetadata = asRecord(record.user_metadata);
  const explicitMetadata = asRecord(record.metadata);

  const userId = firstString(record.userId, record.id, record.sub, record.uid);
  if (!userId) {
    throw new AuthError({
      message: 'Unable to resolve user identifier from identity payload',
      code: 'UNAUTHENTICATED',
      status: 401
    });
  }

  const email = firstString(record.email);
  const roles = firstStringArray(record.roles, record.role, appMetadata.roles, userMetadata.roles);
  const tenantId = firstString(record.tenantId, record.tenant_id, appMetadata.tenant_id, userMetadata.tenant_id);
  const permissions = firstStringArray(record.permissions, appMetadata.permissions, userMetadata.permissions);

  const context: AuthContext = {
    userId,
    ...(roles.length > 0 ? { roles } : {}),
    ...(tenantId ? { tenantId } : {}),
    ...(permissions.length > 0 ? { permissions } : {}),
    ...(email ? { email } : {})
  };

  const metadata = buildMetadata(record, explicitMetadata);
  if (Object.keys(metadata).length > 0) {
    context.metadata = metadata;
  }

  return freezeContext(context);
}

export function freezeContext(context: AuthContext): AuthContext {
  return Object.freeze({
    ...context,
    ...(context.roles ? { roles: Object.freeze([...context.roles]) as string[] } : {}),
    ...(context.permissions
      ? { permissions: Object.freeze([...context.permissions]) as string[] }
      : {}),
    ...(context.metadata
      ? { metadata: Object.freeze({ ...context.metadata }) as Record<string, unknown> }
      : {})
  });
}

function asRecord(value: unknown): RawRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as RawRecord
    : {};
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const normalized = normalizeOptionalString(value);
    if (normalized) {
      return normalized;
    }
  }

  return undefined;
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }

  return undefined;
}

function firstStringArray(...values: unknown[]): string[] {
  for (const value of values) {
    const normalized = normalizeStringArray(value);
    if (normalized.length > 0) {
      return normalized;
    }
  }

  return [];
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map(normalizeOptionalString)
      .filter((item): item is string => Boolean(item));
  }

  const normalized = normalizeOptionalString(value);
  return normalized ? [normalized] : [];
}

function buildMetadata(record: RawRecord, explicitMetadata: RawRecord): Record<string, unknown> {
  const metadata: Record<string, unknown> = { ...explicitMetadata };

  for (const [key, value] of Object.entries(record)) {
    if (!standardMetadataKeys.has(key)) {
      metadata[key] = value;
    }
  }

  return metadata;
}
