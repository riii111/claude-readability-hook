import { describe, expect, it } from 'bun:test';
import { z } from 'zod';
import { JSON_FIXTURES } from '../helpers/fixtures';

const ExtractorResponseSchema = z.object({
  title: z.string(),
  text: z.string(),
  score: z.number().min(0),
  engine: z.enum(['trafilatura', 'readability']),
  success: z.boolean(),
});

const RendererResponseSchema = z
  .object({
    html: z.string(),
    renderTime: z.number().positive(),
    success: z.boolean(),
  })
  .or(
    z.object({
      success: z.literal(false),
      error: z.string(),
    })
  );

describe('Service Contract Tests', () => {
  describe('extractor service contract', () => {
    it('validates_successful_trafilatura_response', () => {
      const response = JSON_FIXTURES.extractorSuccess;

      const result = ExtractorResponseSchema.safeParse(response);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.title).toBe('Test Article');
        expect(result.data.engine).toBe('trafilatura');
        expect(result.data.score).toBeGreaterThan(0);
      }
    });

    it('validates_low_score_response', () => {
      const response = JSON_FIXTURES.extractorLowScore;

      const result = ExtractorResponseSchema.safeParse(response);
      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.score).toBeLessThan(50);
        expect(result.data.success).toBe(true);
      }
    });

    it('rejects_invalid_engine_type', () => {
      const invalidResponse = {
        title: 'Test',
        text: 'Content',
        score: 50,
        engine: 'unknown-engine',
        success: true,
      };

      const result = ExtractorResponseSchema.safeParse(invalidResponse);
      expect(result.success).toBe(false);
    });

    it('rejects_negative_score', () => {
      const invalidResponse = {
        title: 'Test',
        text: 'Content',
        score: -5,
        engine: 'trafilatura',
        success: true,
      };

      const result = ExtractorResponseSchema.safeParse(invalidResponse);
      expect(result.success).toBe(false);
    });

    it('requires_all_mandatory_fields', () => {
      const incompleteResponse = {
        title: 'Test',
        score: 50,
        engine: 'trafilatura',
      };

      const result = ExtractorResponseSchema.safeParse(incompleteResponse);
      expect(result.success).toBe(false);
    });
  });

  describe('renderer service contract', () => {
    it('validates_successful_render_response', () => {
      const response = JSON_FIXTURES.rendererSuccess;

      const result = RendererResponseSchema.safeParse(response);
      expect(result.success).toBe(true);

      if (result.success && 'renderTime' in result.data) {
        expect(result.data.html).toContain('<!DOCTYPE html>');
        expect(result.data.renderTime).toBeGreaterThan(0);
        expect(result.data.success).toBe(true);
      }
    });

    it('validates_render_failure_response', () => {
      const failureResponse = {
        success: false,
        error: 'Render timeout exceeded',
      };

      const result = RendererResponseSchema.safeParse(failureResponse);
      expect(result.success).toBe(true);

      if (result.success && !result.data.success) {
        expect(result.data.error).toBeTruthy();
      }
    });

    it('rejects_malformed_success_response', () => {
      const malformedResponse = {
        html: 'content',
        success: true,
      };

      const result = RendererResponseSchema.safeParse(malformedResponse);
      expect(result.success).toBe(false);
    });

    it('rejects_failure_response_without_error', () => {
      const incompleteFailure = {
        success: false,
      };

      const result = RendererResponseSchema.safeParse(incompleteFailure);
      expect(result.success).toBe(false);
    });
  });

  describe('gateway response format', () => {
    const GatewayResponseSchema = z.object({
      title: z.string(),
      text: z.string(),
      score: z.number().min(0),
      engine: z.enum(['trafilatura', 'readability', 'stackoverflow-api', 'reddit-json']),
      success: z.boolean(),
      cached: z.boolean(),
      renderTime: z.number().positive().optional(),
    });

    it('validates_gateway_response_format', () => {
      const gatewayResponse = {
        title: 'Article Title',
        text: 'Article content here',
        score: 75.5,
        engine: 'trafilatura' as const,
        success: true,
        cached: false,
      };

      const result = GatewayResponseSchema.safeParse(gatewayResponse);
      expect(result.success).toBe(true);
    });

    it('validates_gateway_response_with_render_time', () => {
      const gatewayResponse = {
        title: 'SPA Article',
        text: 'Rendered content',
        score: 80.0,
        engine: 'trafilatura' as const,
        success: true,
        cached: false,
        renderTime: 1500,
      };

      const result = GatewayResponseSchema.safeParse(gatewayResponse);
      expect(result.success).toBe(true);
    });

    it('validates_cached_response_format', () => {
      const cachedResponse = {
        title: 'Cached Article',
        text: 'Cached content',
        score: 90.0,
        engine: 'readability' as const,
        success: true,
        cached: true,
      };

      const result = GatewayResponseSchema.safeParse(cachedResponse);
      expect(result.success).toBe(true);
    });

    it('supports_domain_specific_engines', () => {
      const domainEngines = ['stackoverflow-api', 'reddit-json'] as const;

      for (const engine of domainEngines) {
        const response = {
          title: 'Domain Content',
          text: 'Extracted content',
          score: 85.0,
          engine,
          success: true,
          cached: false,
        };

        const result = GatewayResponseSchema.safeParse(response);
        expect(result.success).toBe(true);
      }
    });
  });
});
