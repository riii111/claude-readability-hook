import { expect } from 'bun:test';
import type { z } from 'zod';

// JSON helpers
export function parseJson<T = unknown>(input: { body: string | Buffer } | string): T {
  if (typeof input === 'string') return JSON.parse(input);
  return JSON.parse(String(input.body)) as T;
}

export function expectZodOk<T>(schema: z.ZodType<T>, body: unknown): asserts body is T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    // Provide readable diff on failure
    // biome-ignore lint/suspicious/noConsole: helpful debug when schema fails
    console.debug('Zod parse errors:', parsed.error.issues);
  }
  expect(parsed.success).toBe(true);
}

// Subset matcher wrapper
export function expectSubset<T extends object>(actual: T, subset: Partial<T>): void {
  expect(actual).toEqual(expect.objectContaining(subset));
}

// Prometheus helpers
export interface PromSample {
  name: string;
  labels: Record<string, string>;
  value: number;
}

export function parsePromLine(line: string): PromSample | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const [left, valueStr] = trimmed.split(/\s+/);
  const match = left.match(/^([^\{]+)(?:\{([^}]*)\})?$/);
  if (!match) return null;
  const name = match[1];
  const labelsStr = match[2] ?? '';
  const labels: Record<string, string> = {};
  if (labelsStr) {
    for (const pair of labelsStr.split(',').filter(Boolean)) {
      const [k, v] = pair.split('=');
      if (k && v) labels[k] = v.replace(/^"|"$/g, '');
    }
  }
  const value = Number(valueStr);
  if (!Number.isFinite(value)) return null;
  return { name, labels, value };
}

export function parsePromText(text: string): PromSample[] {
  const samples: PromSample[] = [];
  for (const line of text.split('\n')) {
    const s = parsePromLine(line);
    if (s) samples.push(s);
  }
  return samples;
}

export function getMetric(
  samples: PromSample[],
  name: string,
  labels?: Record<string, string>
): PromSample[] {
  return samples.filter((s) => {
    if (s.name !== name) return false;
    if (!labels) return true;
    for (const [k, v] of Object.entries(labels)) {
      if (s.labels[k] !== v) return false;
    }
    return true;
  });
}

export function getMetricValue(
  samples: PromSample[],
  name: string,
  labels?: Record<string, string>
): number {
  const m = getMetric(samples, name, labels);
  if (m.length === 0) return 0;
  // When multiple series match, sum their values for a coarse check
  return m.reduce((acc, s) => acc + s.value, 0);
}

export function expectCounterIncreased(
  before: PromSample[],
  after: PromSample[],
  name: string,
  labels?: Record<string, string>
): void {
  const b = getMetricValue(before, name, labels);
  const a = getMetricValue(after, name, labels);
  expect(a).toBeGreaterThan(b);
}
