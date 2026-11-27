/** Supported field descriptors for zero-dependency composition prop schemas. */
export type StringFieldSchema = {
  kind: "string";
  label?: string;
  minLength?: number;
  maxLength?: number;
};

export type NumberFieldSchema = {
  kind: "number";
  label?: string;
  min?: number;
  max?: number;
  step?: number;
};

export type BooleanFieldSchema = {
  kind: "boolean";
  label?: string;
};

export type ColorFieldSchema = {
  kind: "color";
  label?: string;
};

export type EnumFieldSchema<T extends readonly string[] = readonly string[]> = {
  kind: "enum";
  options: T;
  label?: string;
};

export interface ArrayFieldSchema<Item extends PropFieldSchema = PropFieldSchema> {
  kind: "array";
  item: Item;
  label?: string;
}

export interface ObjectPropSchema<
  Shape extends Record<string, PropFieldSchema> = Record<string, PropFieldSchema>,
> {
  kind: "object";
  shape: Shape;
  label?: string;
}

export type PropFieldSchema =
  | StringFieldSchema
  | NumberFieldSchema
  | BooleanFieldSchema
  | ColorFieldSchema
  | EnumFieldSchema
  | ArrayFieldSchema
  | ObjectPropSchema;

/** Declarative, zero-dependency schema builders for composition `inputProps` and `<Studio>` controls. */
export const propSchema = {
  string: (opts: Omit<StringFieldSchema, "kind"> = {}): StringFieldSchema => ({ kind: "string", ...opts }),
  number: (opts: Omit<NumberFieldSchema, "kind"> = {}): NumberFieldSchema => ({ kind: "number", ...opts }),
  boolean: (opts: Omit<BooleanFieldSchema, "kind"> = {}): BooleanFieldSchema => ({ kind: "boolean", ...opts }),
  color: (opts: Omit<ColorFieldSchema, "kind"> = {}): ColorFieldSchema => ({ kind: "color", ...opts }),
  enum: <const T extends readonly string[]>(
    options: T,
    opts: { label?: string } = {}
  ): EnumFieldSchema<T> => ({ kind: "enum", options, ...opts }),
  array: <Item extends PropFieldSchema>(
    item: Item,
    opts: { label?: string } = {}
  ): ArrayFieldSchema<Item> => ({ kind: "array", item, ...opts }),
  object: <Shape extends Record<string, PropFieldSchema>>(
    shape: Shape,
    opts: { label?: string } = {}
  ): ObjectPropSchema<Shape> => ({ kind: "object", shape, ...opts }),
};

const validateField = (schema: PropFieldSchema, value: unknown, path: string, errors: string[]): void => {
  if (value === undefined) return;

  switch (schema.kind) {
    case "string": {
      if (typeof value !== "string") {
        errors.push(`${path}: expected string, got ${typeof value}.`);
        return;
      }
      if (schema.minLength !== undefined && value.length < schema.minLength) {
        errors.push(`${path}: minimum length is ${schema.minLength}.`);
      }
      if (schema.maxLength !== undefined && value.length > schema.maxLength) {
        errors.push(`${path}: maximum length is ${schema.maxLength}.`);
      }
      return;
    }
    case "color": {
      if (typeof value !== "string" || value.trim() === "") {
        errors.push(`${path}: expected CSS color string.`);
      }
      return;
    }
    case "number": {
      if (typeof value !== "number" || Number.isNaN(value)) {
        errors.push(`${path}: expected finite number.`);
        return;
      }
      if (schema.min !== undefined && value < schema.min) {
        errors.push(`${path}: must be >= ${schema.min} (got ${value}).`);
      }
      if (schema.max !== undefined && value > schema.max) {
        errors.push(`${path}: must be <= ${schema.max} (got ${value}).`);
      }
      return;
    }
    case "boolean": {
      if (typeof value !== "boolean") {
        errors.push(`${path}: expected boolean, got ${typeof value}.`);
      }
      return;
    }
    case "enum": {
      if (typeof value !== "string" || !schema.options.includes(value)) {
        errors.push(`${path}: expected one of [${schema.options.join(", ")}].`);
      }
      return;
    }
    case "array": {
      if (!Array.isArray(value)) {
        errors.push(`${path}: expected array.`);
        return;
      }
      value.forEach((item, idx) => validateField(schema.item, item, `${path}[${idx}]`, errors));
      return;
    }
    case "object": {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        errors.push(`${path}: expected object.`);
        return;
      }
      const record = value as Record<string, unknown>;
      for (const [key, childSchema] of Object.entries(schema.shape)) {
        validateField(childSchema, record[key], path ? `${path}.${key}` : key, errors);
      }
    }
  }
};

/** Validates `props` against an `ObjectPropSchema`, returning `{ valid, errors }`. */
export const validateProps = (
  schema: ObjectPropSchema,
  props: Record<string, unknown>
): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  validateField(schema, props, "", errors);
  return { valid: errors.length === 0, errors };
};
