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
