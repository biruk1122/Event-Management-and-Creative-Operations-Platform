/**
 * How one list control is stored in the URL. `parse` reads the raw query value
 * and falls back when it is missing or not valid. `serialize` returns null when
 * the value is the fallback, so default state keeps the URL clean.
 */
export interface UrlCodec<T> {
  parse(raw: string | null, fallback: T): T;
  serialize(value: T, fallback: T): string | null;
}

export const stringCodec: UrlCodec<string> = {
  parse: (raw, fallback) => raw ?? fallback,
  serialize: (value, fallback) =>
    value === fallback || value === "" ? null : value,
};

/** A string that may be null, with no value meaning null. */
export const nullableStringCodec: UrlCodec<string | null> = {
  parse: (raw, fallback) => raw ?? fallback,
  serialize: (value) => (value === null || value === "" ? null : value),
};

export function enumCodec<const V extends string>(
  values: readonly V[],
): UrlCodec<V> {
  return {
    parse: (raw, fallback) =>
      raw !== null && (values as readonly string[]).includes(raw)
        ? (raw as V)
        : fallback,
    serialize: (value, fallback) => (value === fallback ? null : value),
  };
}

/** An enum that may be null: the null state is "no filter". */
export function nullableEnumCodec<const V extends string>(
  values: readonly V[],
): UrlCodec<V | null> {
  return {
    parse: (raw, fallback) =>
      raw !== null && (values as readonly string[]).includes(raw)
        ? (raw as V)
        : fallback,
    serialize: (value) => value,
  };
}

export const booleanCodec: UrlCodec<boolean> = {
  parse: (raw, fallback) => (raw === null ? fallback : raw === "1"),
  serialize: (value, fallback) =>
    value === fallback ? null : value ? "1" : "0",
};

/** A positive whole number, such as a page. */
export const positiveIntCodec: UrlCodec<number> = {
  parse: (raw, fallback) => {
    if (raw === null || !/^\d+$/.test(raw)) return fallback;
    const parsed = Number(raw);
    return parsed >= 1 ? parsed : fallback;
  },
  serialize: (value, fallback) => (value === fallback ? null : String(value)),
};
