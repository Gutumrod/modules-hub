// ⚠️ EXPERIMENTAL — Anti-cheat coverage gate (NOT permanent)
// 2026-08-09: เพิ่มมาเพื่อกัน QA agent โกง "เทสผ่านแต่ไม่ได้เทสจริง"
// (เขียนเทสอ่อน / skip / mock หลอก → coverage ต่ำ → fail อัตโนมัติ)
//
// ถ้า gate นี้พิสูจน์แล้วว่าไม่ดี (false positive เยอะ / ทำให้ pipeline ช้าเกิน)
// → ลบได้เลย:
//   1. ลบไฟล์นี้ (vitest.config.ts)
//   2. ลบ "test:coverage" ออกจาก package.json
//   3. ลบ @vitest/coverage-v8 ออกจาก devDependencies
//   4. ลบ comments นี้ใน MODULE.md
// แล้ว `npm test` กลับเป็นแค่ `vitest run` ตามเดิม

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      enabled: true,
      include: ['core/**/*.ts'],
      // Threshold: ครอบคลุม core จริง ≥ 90% ไม่งั้น fail (กันเทสอ่อน)
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
    },
  },
});
