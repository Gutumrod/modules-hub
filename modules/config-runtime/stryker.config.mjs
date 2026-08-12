// ⚠️ EXPERIMENTAL — Mutation testing (Stryker) — NOT permanent
// 2026-08-09: พิสูจน์ว่าเทส "มีพลังจริง" (จับ bug ได้) โดยจงใจแก้ source ให้ผิด
// แล้วดูว่าเทสจับได้ไหม. ถ้าเทสผ่านทั้งที่โค้ดถูก mutate = เทสอ่อน → mutation score ต่ำ
//
// ถ้าไม่ดี (ช้า / false positive เยอะ) → ลบได้:
//   1. ลบไฟล์นี้ (stryker.config.mjs)
//   2. ลบ "mutate" script ออกจาก package.json
//   3. ลบ @stryker-mutator/* ออกจาก devDependencies
// แล้วกลับเป็นแค่ coverage gate ตามเดิม

export default {
  testRunner: 'vitest',
  coverageAnalysis: 'perTest',
  mutate: ['core/**/*.ts'],
  tsconfigFile: 'tsconfig.json',
  checkers: ['typescript'],
  thresholds: { high: 80, low: 60, break: 60 },
  concurrency: 4,
  vitest: {
    configFile: 'vitest.config.ts',
  },
};
