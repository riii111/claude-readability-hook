import { resolve4, resolve6 } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Result, ResultAsync, err, errAsync, ok, okAsync } from 'neverthrow';
import { config } from './config.js';

export function validateUrl(urlString: string): Result<URL, string> {
  return safeUrlParser(urlString).andThen((url) => {
    if (!['http:', 'https:'].includes(url.protocol)) {
      return err(`Invalid protocol: ${url.protocol}. Only HTTP and HTTPS are allowed`);
    }

    if (url.username || url.password) {
      return err('URLs with embedded credentials are not allowed');
    }

    const dangerousPorts = new Set(config.blockedPorts);
    const port = url.port ? Number.parseInt(url.port, 10) : url.protocol === 'https:' ? 443 : 80;
    if (dangerousPorts.has(port)) {
      return err(`Access to port ${port} is not allowed`);
    }

    return ok(url);
  });
}

export function validateUrlSecurity(url: URL): ResultAsync<URL, string> {
  // For IPv6 addresses, remove the brackets
  const hostname = url.hostname.replace(/^\[|\]$/g, '');

  // Early reject IPv6 zone indices like fe80::1%eth0
  if (hostname.includes('%')) {
    return errAsync(`IPv6 zone index is not allowed: ${hostname}`);
  }

  // Treat IPv4-mapped IPv6 literals explicitly as IPs
  if (/^::ffff:/i.test(hostname) || isIP(hostname)) {
    if (isPrivateIP(hostname)) {
      return errAsync(`Private IP access denied: ${hostname}`);
    }
    // Public IP address - no DNS resolution needed
    return okAsync(url);
  }

  if (isLocalHostname(hostname)) {
    return errAsync(`Localhost access denied: ${hostname}`);
  }

  return resolveAllAddresses(hostname)
    .andThen((addresses) => {
      for (const ip of addresses) {
        if (isPrivateIP(ip)) {
          return errAsync(`DNS resolves to private IP: ${hostname} -> ${ip}`);
        }
      }
      return okAsync(url);
    })
    .orElse(() => {
      const allowDnsFailure =
        process.env.NODE_ENV === 'test'
          ? process.env.ALLOW_DNS_FAILURE === 'true'
          : config.allowDnsFailure;

      return allowDnsFailure
        ? okAsync(url)
        : errAsync(`DNS resolution failed and allowDnsFailure is disabled: ${hostname}`);
    });
}

function resolveAllAddresses(hostname: string): ResultAsync<string[], string> {
  return ResultAsync.fromPromise(
    Promise.allSettled([resolve4(hostname), resolve6(hostname)]),
    () => 'DNS resolution failed'
  ).andThen((results) => {
    const addresses: string[] = [];

    for (const result of results) {
      if (result.status === 'fulfilled') {
        addresses.push(...result.value);
      }
    }

    if (addresses.length === 0) {
      return errAsync(`DNS resolution failed for hostname: ${hostname}`);
    }

    return okAsync(addresses);
  });
}

function isPrivateIP(ip: string): boolean {
  return PRIVATE_IP_RANGES.some((range) => range.test(ip));
}

function isLocalHostname(hostname: string): boolean {
  const localHostnames = new Set([
    'localhost',
    'localhost.localdomain',
    'localhost6',
    'localhost6.localdomain6',
  ]);
  return localHostnames.has(hostname.toLowerCase());
}

const safeUrlParser = Result.fromThrowable(
  (urlString: string) => new URL(urlString),
  (error) => `Invalid URL: ${error instanceof Error ? error.message : String(error)}`
);

const PRIVATE_IP_RANGES = Object.freeze([
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^127\./,
  /^169\.254\./,
  // 100.64.0.0/10 (CGNAT)
  /^100\.(6[4-9]|[7-9]\d|1[01]\d)\./,
  // 192.0.0.0/24 (IETF Protocol Assignments)
  /^192\.0\.0\./,
  // 198.18.0.0/15 (benchmarking)
  /^198\.(1[89])\./,
  // 224.0.0.0/4 (multicast) and above already covered below
  /^0\./,
  /^22[4-9]\./,
  /^23[0-9]\./,
  /^24[0-9]\./,
  /^25[0-5]\./,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
  /^fd00:/i,
  /^::ffff:10\./i,
  /^::ffff:172\.(1[6-9]|2[0-9]|3[01])\./i,
  /^::ffff:192\.168\./i,
  /^::ffff:127\./i,
  // IPv4-mapped IPv6 for additional reserved ranges
  /^::ffff:100\.(6[4-9]|[7-9]\d|1[01]\d)\./i,
  /^::ffff:192\.0\.0\./i,
  /^::ffff:198\.(1[89])\./i,
]);
