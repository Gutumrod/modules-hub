import {
  createTenantContext,
  requireTenantContext,
  type TenantContext,
  TenantContextError,
} from '../index.js';

/**
 * 1. Host Application Route / Middleware Context
 */
async function handleHostRequest(incomingHeaders: Record<string, string>) {
  try {
    // Host resolves raw tenant ID from trusted header or auth token
    const rawTenantId = incomingHeaders['x-tenant-id'];

    // Host creates immutable TenantContext
    const tenantContext = createTenantContext({
      tenantId: rawTenantId,
      actorId: 'usr_123456',
      requestId: 'req_987654',
      environment: 'production',
      metadata: {
        source: 'api-gateway',
      },
    });

    // 3. Pass context explicitly to domain service
    const result = await processTenantOrder(tenantContext, { itemId: 'item_99' });
    console.log('Order Processed Result:', result);
  } catch (error) {
    if (error instanceof TenantContextError) {
      console.error(`[Tenant Context Error] ${error.code}: ${error.message}`);
    } else {
      console.error('Unexpected error:', error);
    }
  }
}

/**
 * 2. Domain Service accepting explicit TenantContext
 */
async function processTenantOrder(
  ctx: TenantContext,
  orderData: { itemId: string }
) {
  // Validate context at service boundary
  const validatedCtx = requireTenantContext(ctx);

  console.log(`Processing order for Tenant: ${validatedCtx.tenantId}, Actor: ${validatedCtx.actorId}`);
  console.log(`Item: ${orderData.itemId}`);

  // Business logic would use validatedCtx.tenantId for DB queries
  return {
    success: true,
    tenantId: validatedCtx.tenantId,
    orderId: 'ord_555',
  };
}

// Example Execution
console.log('--- Case 1: Valid Request ---');
handleHostRequest({ 'x-tenant-id': 'tenant_acme_corp' });

console.log('\n--- Case 2: Missing Tenant ID ---');
handleHostRequest({});
