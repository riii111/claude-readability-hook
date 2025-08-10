import { beforeEach, describe, expect, it } from 'bun:test';
import { validateUrl, validateUrlSecurity } from '../../../src/lib/ssrf-guard';

describe('SSRF Guard', () => {
  describe('validateUrl', () => {
    it('accepts_valid_https_url', () => {
      const result = validateUrl('https://example.com/page');
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.href).toBe('https://example.com/page');
      }
    });

    it('accepts_valid_http_url', () => {
      const result = validateUrl('http://example.com');
      expect(result.isOk()).toBe(true);
    });

    it('rejects_invalid_url_format', () => {
      const result = validateUrl('not-a-url');
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toMatch(/Invalid URL/);
      }
    });

    it('rejects_non_http_protocols', () => {
      const protocols = ['ftp://example.com', 'file:///etc/passwd', 'javascript:alert(1)'];
      for (const url of protocols) {
        const result = validateUrl(url);
        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error).toMatch(/Invalid protocol/);
        }
      }
    });

    it('rejects_url_with_userinfo', () => {
      const result = validateUrl('https://user:pass@example.com');
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toMatch(/embedded credentials/);
      }
    });

    const portCases = [
      { port: ':80', url: 'http://example.com:80', expectOk: true },
      { port: ':443', url: 'https://example.com:443', expectOk: true },
      { port: ':8080', url: 'http://example.com:8080', expectOk: true },
      { port: ':3000', url: 'http://example.com:3000', expectOk: true },
      { port: ':22', url: 'http://example.com:22', expectOk: false }, // SSH - blocked by default
      { port: ':3306', url: 'http://example.com:3306', expectOk: false }, // MySQL - blocked by default
      { port: ':27017', url: 'http://example.com:27017', expectOk: false }, // MongoDB - blocked by default
      { port: ':65535', url: 'http://example.com:65535', expectOk: true },
    ];

    for (const { port, url, expectOk } of portCases) {
      it(`${expectOk ? 'accepts' : 'rejects'}_port${port}`, () => {
        const result = validateUrl(url);
        expect(result.isOk()).toBe(expectOk);
        if (!expectOk && result.isErr()) {
          expect(result.error).toMatch(/port.*not allowed/);
        }
      });
    }
  });

  describe('validateUrlSecurity', () => {
    beforeEach(() => {
      process.env.ALLOW_DNS_FAILURE = 'false';
      process.env.NODE_ENV = 'test';
    });

    it('rejects_private_ipv4_addresses', async () => {
      const privateIps = [
        'http://127.0.0.1',
        'http://192.168.1.1',
        'http://10.0.0.1',
        'http://172.16.0.1',
        'http://169.254.169.254',
      ];

      for (const ip of privateIps) {
        const url = new URL(ip);
        const result = await validateUrlSecurity(url);
        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error).toMatch(/private.*(IP|address)|localhost/i);
        }
      }
    });

    it('rejects_localhost', async () => {
      const url = new URL('http://localhost');
      const result = await validateUrlSecurity(url);
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toMatch(/private.*(IP|address)|localhost/i);
      }
    });

    it('rejects_ipv6_loopback', async () => {
      const url = new URL('http://[::1]');
      const result = await validateUrlSecurity(url);
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toMatch(/private.*(IP|address)|localhost/i);
      }
    });

    it('accepts_public_ip_addresses', async () => {
      const publicIps = ['http://8.8.8.8', 'http://1.1.1.1', 'http://93.184.216.34'];

      for (const ip of publicIps) {
        const url = new URL(ip);
        const result = await validateUrlSecurity(url);
        expect(result.isOk()).toBe(true);
      }
    });

    it('accepts_public_domains', async () => {
      // Avoid DNS flake in CI
      process.env.ALLOW_DNS_FAILURE = 'true';
      const url = new URL('https://example.com');
      const result = await validateUrlSecurity(url);
      expect(result.isOk()).toBe(true);
    });

    it('accepts_public_ipv6_address', async () => {
      const url = new URL('http://[2606:4700:4700::1111]');
      const result = await validateUrlSecurity(url);
      expect(result.isOk()).toBe(true);
    });

    it('handles_dns_resolution_failure_when_allowed', async () => {
      process.env.ALLOW_DNS_FAILURE = 'true';
      const url = new URL('https://non-existent-domain-12345.com');
      const result = await validateUrlSecurity(url);
      expect(result.isOk()).toBe(true);
    });

    it('rejects_dns_resolution_failure_when_not_allowed', async () => {
      process.env.ALLOW_DNS_FAILURE = 'false';
      const url = new URL('https://non-existent-domain-12345.com');
      const result = await validateUrlSecurity(url);
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toMatch(/DNS.*fail/i);
      }
    });

    const boundaryIpCases = [
      { ip: '9.255.255.255', isPrivate: false },
      { ip: '10.0.0.0', isPrivate: true },
      { ip: '10.255.255.255', isPrivate: true },
      { ip: '11.0.0.0', isPrivate: false },
      { ip: '172.15.255.255', isPrivate: false },
      { ip: '172.16.0.0', isPrivate: true },
      { ip: '172.31.255.255', isPrivate: true },
      { ip: '172.32.0.0', isPrivate: false },
      { ip: '192.167.255.255', isPrivate: false },
      { ip: '192.168.0.0', isPrivate: true },
      { ip: '192.168.255.255', isPrivate: true },
      { ip: '192.169.0.0', isPrivate: false },
    ];

    for (const { ip, isPrivate } of boundaryIpCases) {
      it(`${isPrivate ? 'rejects' : 'accepts'}_boundary_ip_${ip}`, async () => {
        const url = new URL(`http://${ip}`);
        const result = await validateUrlSecurity(url);
        expect(result.isOk()).toBe(!isPrivate);
        if (isPrivate && result.isErr()) {
          expect(result.error).toMatch(/private.*(IP|address)|localhost/i);
        }
      });
    }

    it('rejects_ipv6_zone_index', async () => {
      // Construct URL object without bracket syntax due to parser limitations
      const url = new URL('http://example.com');
      Object.defineProperty(url, 'hostname', { value: 'fe80::1%eth0' });
      const result = await validateUrlSecurity(url as unknown as URL);
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toMatch(/zone index/i);
      }
    });

    it('rejects_additional_reserved_ranges_ipv4', async () => {
      const reserved = ['http://100.64.0.1', 'http://192.0.0.1', 'http://198.19.0.1'];
      for (const ip of reserved) {
        const url = new URL(ip);
        const result = await validateUrlSecurity(url);
        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error).toMatch(/private|denied|reserved/i);
        }
      }
    });

    it('rejects_additional_reserved_ranges_ipv4_mapped_ipv6', async () => {
      const samples = ['::ffff:100.64.0.1', '::ffff:192.0.0.1', '::ffff:198.19.0.1'];
      for (const host of samples) {
        const url = new URL('http://example.com');
        Object.defineProperty(url, 'hostname', { value: host });
        const result = await validateUrlSecurity(url as unknown as URL);
        expect(result.isErr()).toBe(true);
      }
    });
  });

  describe('validateUrl (IDN)', () => {
    it('accepts_idn_punycode_domain', () => {
      const result = validateUrl('https://bücher.example/path');
      expect(result.isOk()).toBe(true);
    });

    it('rejects_https_blocked_port', () => {
      const result = validateUrl('https://example.com:22');
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toMatch(/port.*not allowed/i);
      }
    });
  });
});
