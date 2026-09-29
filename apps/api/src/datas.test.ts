import { describe, expect, it } from 'vitest';
import { hojeNoFuso } from './datas.ts';

describe('hojeNoFuso (America/Sao_Paulo)', () => {
  it('à 01:00 UTC ainda é o dia anterior em São Paulo (UTC-3)', () => {
    expect(hojeNoFuso(new Date('2026-09-30T01:00:00Z'))).toBe('2026-09-29');
    expect(hojeNoFuso(new Date('2026-09-30T03:00:00Z'))).toBe('2026-09-30');
  });

  it('virada de ano', () => {
    expect(hojeNoFuso(new Date('2027-01-01T02:59:59Z'))).toBe('2026-12-31');
  });

  it('sem argumento devolve uma data só-dia', () => {
    expect(hojeNoFuso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
