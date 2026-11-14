// Request validation. Every body is parsed with zod before it reaches the store.
import { z } from 'zod';
import { STAGES, OUTCOME_KEYS, NEXT_STEP_CHANNELS, COMPANY_KINDS } from '../../shared/stages.js';

const trimmed = (max) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => (s === '' ? null : s));

export const uuidParam = z.string().uuid({ message: 'Invalid call id' });

export const startCallSchema = z.object({
  prospect_name: z.string().trim().min(1, 'Prospect name is required').max(120),
  prospect_role: trimmed(120).nullish(),
  company: z.string().trim().min(1, 'Company is required').max(160),
  company_kind: z.enum(COMPANY_KINDS).nullish(),
  call_type: z.enum(['first', 'follow_up']).default('first'),
  caller_name: trimmed(80).nullish(),
});

export const stageParam = z.coerce.number().int().min(1).max(8);

// A tap must be one of the taps defined for that stage.
export function stageResultSchema(stageN) {
  const tapKeys = STAGES.find((s) => s.n === stageN).taps.map((t) => t.key);
  return z
    .object({
      tap: tapKeys.length ? z.enum(tapKeys).nullish() : z.null().optional(),
      words: trimmed(2000).nullish(),
    })
    .refine((v) => v.tap || v.words, { message: 'Send a tap, words, or both' });
}

const closeFields = {
  outcome: z.enum(OUTCOME_KEYS),
  next_step_channel: z.enum(NEXT_STEP_CHANNELS).nullish(),
  next_step_when: trimmed(120).nullish(),
};

export const checkSchema = z.object(closeFields);

export const closeCallSchema = z.object({
  ...closeFields,
  summary: trimmed(200).nullish(),
  ai_check: z
    .object({
      suggested_outcome: z.enum(OUTCOME_KEYS),
      agrees: z.boolean(),
      reason: z.string().max(400),
      summary: z.string().max(200).optional(),
      need_in_their_words: z.string().max(400).nullable().optional(),
      source: z.enum(['llm', 'rules']),
      model: z.string().max(80).optional(),
    })
    .nullish(),
});

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  outcome: z.enum(OUTCOME_KEYS).optional(),
  stage: z.coerce.number().int().min(1).max(8).optional(),
});
