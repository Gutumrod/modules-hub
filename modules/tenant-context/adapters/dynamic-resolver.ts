import { TenantInfo, TenantResolver } from '../core/types';

export class DynamicTenantResolver implements TenantResolver {
  private tenantStore = new Map<string, TenantInfo>();
  private domainMap = new Map<string, string>(); // hostname -> tenantId

  registerTenant(tenant: TenantInfo, customDomains: string[] = []): void {
    this.tenantStore.set(tenant.id, tenant);
    this.domainMap.set(`${tenant.slug}.example.com`, tenant.id);
    customDomains.forEach(domain => {
      this.domainMap.set(domain, tenant.id);
    });
  }

  async resolveFromHeader(headerValue?: string): Promise<TenantInfo | null> {
    if (!headerValue) return null;
    return this.tenantStore.get(headerValue) || null;
  }

  async resolveFromHostname(hostname: string): Promise<TenantInfo | null> {
    const tenantId = this.domainMap.get(hostname);
    if (!tenantId) return null;
    return this.tenantStore.get(tenantId) || null;
  }
}
