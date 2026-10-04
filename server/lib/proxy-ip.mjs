/* 방문자 헤더는 운영자가 지정한 프록시 소켓에서 온 경우에만 신뢰한다. */
import { isIP } from 'node:net';

export function normalizeIp(value) {
  if (typeof value !== 'string') return null;
  const ip = value.trim();
  if (!ip || ip.includes('%') || !isIP(ip)) return null;
  if (isIP(ip) === 4) return ip;
  // Node가 IPv4 연결을 IPv6 소켓으로 나타내도 같은 exact IP로 비교한다.
  const canonical = new URL('http://[' + ip + ']/').hostname.slice(1, -1);
  const mapped = /^::ffff:([a-f0-9]{1,4}):([a-f0-9]{1,4})$/.exec(canonical);
  if (mapped) {
    const high = parseInt(mapped[1], 16), low = parseInt(mapped[2], 16);
    return [high >>> 8, high & 255, low >>> 8, low & 255].join('.');
  }
  return canonical;
}

export function parseTrustedProxyIPs(value = '') {
  if (typeof value !== 'string') throw new Error('TRUSTED_PROXY_IPS must be a comma-separated list of IP addresses');
  if (!value.trim()) return [];
  const entries = value.split(',');
  const result = entries.map(normalizeIp);
  if (entries.length > 32 || result.some(ip => !ip)) throw new Error('TRUSTED_PROXY_IPS must contain at most 32 exact IP addresses');
  return [...new Set(result)];
}

export function clientIp(req, trustedProxyIPs = []) {
  const socketAddress = req.socket?.remoteAddress;
  const peer = normalizeIp(socketAddress);
  const forwarded = normalizeIp(req.headers?.['cf-connecting-ip']);
  if (peer && trustedProxyIPs.includes(peer) && forwarded) return forwarded;
  return peer || socketAddress || 'unknown';
}
