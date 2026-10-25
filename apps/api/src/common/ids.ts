import { ApiException } from './api-exception';

/** Path id (decimal string) -> bigint. Anything else is simply "not found". */
export function parseId(raw: string): bigint {
  if (!/^\d{1,19}$/.test(raw)) throw new ApiException('NOT_FOUND');
  const id = BigInt(raw);
  if (id > 18446744073709551615n) throw new ApiException('NOT_FOUND');
  return id;
}
