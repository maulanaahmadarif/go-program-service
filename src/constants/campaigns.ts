/** Canonical campaign windows in Asia/Jakarta. `ends_at` is exclusive. */
export const CAMPAIGN_SEED: Array<{
  phase: number;
  name: string;
  starts_at: Date;
  ends_at: Date | null;
}> = [
  { phase: 1, name: 'Phase 1', starts_at: new Date('2000-01-01T00:00:00+07:00'), ends_at: new Date('2025-01-01T00:00:00+07:00') },
  { phase: 2, name: 'Phase 2', starts_at: new Date('2025-01-01T00:00:00+07:00'), ends_at: new Date('2025-05-28T00:00:00+07:00') },
  { phase: 3, name: 'Phase 3', starts_at: new Date('2025-05-28T00:00:00+07:00'), ends_at: new Date('2025-08-20T00:00:00+07:00') },
  { phase: 4, name: 'Phase 4', starts_at: new Date('2025-08-20T00:00:00+07:00'), ends_at: new Date('2025-10-27T00:00:00+07:00') },
  { phase: 5, name: 'Phase 5', starts_at: new Date('2025-10-27T00:00:00+07:00'), ends_at: new Date('2026-02-12T00:00:00+07:00') },
  { phase: 6, name: 'Phase 6', starts_at: new Date('2026-02-12T00:00:00+07:00'), ends_at: new Date('2026-05-15T00:00:00+07:00') },
  { phase: 7, name: 'Phase 7', starts_at: new Date('2026-05-15T00:00:00+07:00'), ends_at: null },
];
