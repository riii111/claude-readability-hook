import { resolve4, resolve6 } from 'node:dns/promises';
import { Result, ResultAsync, err, errAsync, ok, okAsync } from 'neverthrow';

const PRIVATE_IP_RANGES = [
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^127\./,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
  /^fd00:/i,
  /^::ffff:10\./i,
  /^::ffff:172\.(1[6-9]|2[0-9]|3[01])\./i,
  /^::ffff:192\.168\./i,
  /^::ffff:127\./i,
];

export function checkSSRF(url: URL): ResultAsync<URL, string> {
  const hostname = url.hostname;

  if (isPrivateIP(hostname)) {
    return errAsync(`Private IP access denied: ${hostname}`);
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
      // DNS解決エラーは許可（外部サービスがダウンしている可能性があるため）
      return okAsync(url);
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
  const ipv4Result = ResultAsync.fromPromise(resolve4(hostname), () => 'IPv4 resolution failed');
  const ipv6Result = ResultAsync.fromPromise(resolve6(hostname), () => 'IPv6 resolution failed');

  return ipv4Result
    .andThen((ipv4Addresses) => {
      return ipv6Result
        .map((ipv6Addresses) => [...ipv4Addresses, ...ipv6Addresses])
        .orElse(() => okAsync(ipv4Addresses));
    })
    .orElse(() => {
      return ipv6Result.orElse(() => {
        return errAsync(`DNS resolution failed for hostname: ${hostname}`);
      });
    });
}

// Result.fromThrowableを使ってURL解析をラップ
const safeUrlParser = Result.fromThrowable(
  (urlString: string) => new URL(urlString),
  (error) => `Invalid URL: ${error instanceof Error ? error.message : String(error)}`
);

export function validateUrl(urlString: string): Result<URL, string> {
  return safeUrlParser(urlString).andThen((url) => {
    // プロトコルチェック
    if (!['http:', 'https:'].includes(url.protocol)) {
      return err(`Invalid protocol: ${url.protocol}. Only HTTP and HTTPS are allowed`);
    }

    // ポート番号チェック（よく使われる内部サービスポート）
    const dangerousPorts = [22, 3306, 5432, 6379, 9200, 27017];
    const port = url.port ? Number.parseInt(url.port, 10) : url.protocol === 'https:' ? 443 : 80;
    if (dangerousPorts.includes(port)) {
      return err(`Access to port ${port} is not allowed`);
    }

    return ok(url);
  });
}
