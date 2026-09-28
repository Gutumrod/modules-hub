import { describe, expect, it } from 'vitest';
import { extractSupabaseMetadata } from '../../adapters/supabase-adapter.js';
import type { SupabaseUser } from '../../core/types.js';

describe('Supabase metadata extraction', () => {
  it('keeps app and user metadata namespaced when their keys collide', () => {
    const user: SupabaseUser = {
      id: 'user-123',
      app_metadata: { plan: 'trusted-plan' },
      user_metadata: { plan: 'user-selected-plan' }
    };

    expect(extractSupabaseMetadata(user)).toEqual({
      appMetadata: { plan: 'trusted-plan' },
      userMetadata: { plan: 'user-selected-plan' }
    });
  });
});
