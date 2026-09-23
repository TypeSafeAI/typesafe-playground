/** Read plain data properties without invoking accessors. Not a plugin sandbox. */
export function dataRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const out: Record<string, unknown> = Object.create(null);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") return null;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) return null;
    out[key] = descriptor.value;
  }
  return out;
}

/** Copy dense plain arrays without invoking custom iterators or index getters. */
export function dataArray(value: unknown): unknown[] | null {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return null;
  if (Reflect.ownKeys(value).length !== value.length + 1) return null;
  const out: unknown[] = [];
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !("value" in descriptor)) return null;
    out.push(descriptor.value);
  }
  return out;
}

/** A success requires a real boolean and an empty, well-formed error list. */
export function validationFailure(value: unknown): string | null {
  const validation = dataRecord(value);
  if (!validation || typeof validation.ok !== "boolean")
    return "Validation failed: malformed validation result.";
  const errors = dataArray(validation.errors);
  if (!errors || !errors.every((error): error is string => typeof error === "string"))
    return "Validation failed: malformed validation errors.";
  if (!validation.ok || errors.length > 0)
    return `Validation failed: ${errors.join("; ") || "validator did not succeed"}`;
  return null;
}
