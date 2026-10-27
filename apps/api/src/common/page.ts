export interface CursorMeta {
  next_cursor: string | null;
  has_more: boolean;
}

/** Return this from a list endpoint to get `{ data: [...], meta: { next_cursor, has_more } }`. */
export class Page<T, M extends object = CursorMeta> {
  constructor(
    readonly items: T[],
    readonly meta: M,
  ) {}
}

/** A single object plus `meta` (e.g. a created question with its near-duplicate hints). */
export class WithMeta<D, M extends object> {
  constructor(
    readonly data: D,
    readonly meta: M,
  ) {}
}
