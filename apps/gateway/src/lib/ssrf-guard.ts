import { resolve4, resolve6 } from 'node:dns/promises';
import { type Result, err, ok } from 'neverthrow';
import { config } from './config.js';

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

export async function checkSSRF(url: URL): Promise<Result<URL, string>> {
  const hostname = url.hostname;

  // IP直接指定チェック
  if (isPrivateIP(hostname)) {
    return err(`Private IP access denied: ${hostname}`);
  }

  // ローカルホスト名のチェック
  if (isLocalHostname(hostname)) {
    return err(`Localhost access denied: ${hostname}`);
  }

  // DNS解決してプライベートIPチェック
  try {
    const addresses = await resolveAllAddresses(hostname);

    for (const ip of addresses) {
      if (isPrivateIP(ip)) {
        return err(`DNS resolves to private IP: ${hostname} -> ${ip}`);
      }
    }
  } catch (error) {
    // DNS解決エラーは許可（外部サービスがダウンしている可能性があるため）
    // ただし、実際のfetch時にエラーになる
  }

  return ok(url);
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

async function resolveAllAddresses(hostname: string): Promise<string[]> {
  const addresses: string[] = [];

  // IPv4アドレスの解決
  try {
    const ipv4Addresses = await resolve4(hostname);
    addresses.push(...ipv4Addresses);
  } catch {
    // IPv4解決失敗は無視
  }

  // IPv6アドレスの解決
  try {
    const ipv6Addresses = await resolve6(hostname);
    addresses.push(...ipv6Addresses);
  } catch {
    // IPv6解決失敗は無視
  }

  return addresses;
}

export function validateUrl(urlString: string): Result<URL, string> {
  try {
    const url = new URL(urlString);

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
  } catch (error) {
    return err(`Invalid URL: ${error instanceof Error ? error.message : String(error)}`);
  }
}
