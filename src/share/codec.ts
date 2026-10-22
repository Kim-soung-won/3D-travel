// 공유 링크용 인코딩: 형식 v1 JSON → deflate-raw 압축(브라우저 내장 CompressionStream) → base64url.
// 링크는 URL의 # 뒤(fragment)에 담아, 호스팅 서버로 보내지지 않게 한다.
import type { Trip } from '../state/route';
import { fromShared, toShared, TripFormatError } from './format';

export const HASH_KEY = 'trip';

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) throw new TripFormatError('링크에 쓸 수 없는 글자가 있습니다');
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export async function encodeTrip(trip: Trip): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(toShared(trip)));
  return toBase64Url(await pipe(json, new CompressionStream('deflate-raw')));
}

export async function decodeTrip(code: string): Promise<Trip> {
  let json: string;
  try {
    json = new TextDecoder().decode(await pipe(fromBase64Url(code), new DecompressionStream('deflate-raw')));
  } catch (e) {
    if (e instanceof TripFormatError) throw e;
    throw new TripFormatError('링크가 잘렸거나 손상되었습니다');
  }
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new TripFormatError('링크 내용을 읽지 못했습니다');
  }
  return fromShared(data);
}

/** 현재 주소 기준 공유 링크 */
export function shareUrl(code: string, base = `${location.origin}${location.pathname}`): string {
  return `${base}#${HASH_KEY}=${code}`;
}

/** "#trip=..." 에서 코드만. 없으면 null */
export function codeFromHash(hash: string): string | null {
  const m = new RegExp(`^#?${HASH_KEY}=([A-Za-z0-9_-]+)`).exec(hash);
  return m ? m[1] : null;
}
