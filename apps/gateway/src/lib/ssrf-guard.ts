import { resolve4, resolve6 } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Result, ResultAsync, err, errAsync, ok, okAsync } from 'neverthrow';
import { config } from './config.js';

const PRIVATE_IP_RANGES = [
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^127\./,
  /^169\.254\./,
  /^0\./, // 0.0.0.0/8 - "This host on this network"
  /^2(2[4-9]|[3-9][0-9])\./i, // 224.0.0.0/4 - Multicast
  /^2(4[0-9]|5[0-5])\./i, // 240.0.0.0/4 - Reserved for future use
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
  /^fd00:/i,
  /^::ffff:10\./i,
  /^::ffff:172\.(1[6-9]|2[0-9]|3[01])\./i,
  /^::ffff:192\.168\./i,
  /^::ffff:127\./i,
];

export function validateUrlSecurity(url: URL): ResultAsync<URL, string> {
  const hostname = url.hostname;

  if (isIP(hostname)) {
    if (isPrivateIP(hostname)) {
      return errAsync(`Private IP access denied: ${hostname}`);
    }
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
      return config.allowDnsFailure
        ? okAsync(url)
        : errAsync(`DNS resolution failed and allowDnsFailure is disabled: ${hostname}`);
    });
}

function isPrivateIP(ip: string): boolean {
  return PRIVATE_IP_RANGES.some((range) => range.test(ip));
}

function isLocalHostname(hostname: string): boolean {
  const localHostnames = [
    'localhost',
    'localhost.localdomain',
    'localhost6',
    'localhost6.localdomain6',
  ];
  return localHostnames.includes(hostname.toLowerCase());
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

const safeUrlParser = Result.fromThrowable(
  (urlString: string) => new URL(urlString),
  (error) => `Invalid URL: ${error instanceof Error ? error.message : String(error)}`
);

export function validateUrl(urlString: string): Result<URL, string> {
  return safeUrlParser(urlString).andThen((url) => {
    if (!['http:', 'https:'].includes(url.protocol)) {
      return err(`Invalid protocol: ${url.protocol}. Only HTTP and HTTPS are allowed`);
    }

    const dangerousPorts = new Set(config.blockedPorts);
    const port = url.port ? Number.parseInt(url.port, 10) : url.protocol === 'https:' ? 443 : 80;
    if (dangerousPorts.has(port)) {
      return err(`Access to port ${port} is not allowed`);
    }

    return ok(url);
  });
}
