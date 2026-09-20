import { z } from "zod";
const pathSchema = z
  .string()
  .max(2000)
  .refine(
    (v) =>
      v.startsWith("/") &&
      !v.startsWith("//") &&
      !v.includes("\\") &&
      !v.includes("#"),
    "Use an absolute path on the target origin.",
  );
const locator = z.object({
  role: z.string().min(1),
  name: z.string(),
  nth: z.number().int().min(0).default(0),
});
export const actionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("fill"),
    ...locator.shape,
    value: z.string().max(2000),
  }),
  z.object({ kind: z.literal("click"), ...locator.shape }),
  z.object({
    kind: z.literal("select"),
    ...locator.shape,
    value: z.string().max(2000),
  }),
  z.object({
    kind: z.literal("check"),
    ...locator.shape,
    checked: z.boolean(),
  }),
]);
export const configSchema = z
  .object({
    target: z
      .url()
      .refine((v) => {
        const u = new URL(v);
        return (
          ["http:", "https:"].includes(u.protocol) &&
          !u.username &&
          !u.password &&
          u.pathname === "/" &&
          !u.search &&
          !u.hash
        );
      }, "Target must be an HTTP(S) origin without credentials.")
      .transform((value) => new URL(value).origin),
    openapi: pathSchema.optional(),
    screens: z
      .array(
        z.object({
          id: z.string().regex(/^[a-zA-Z0-9_-]+$/),
          path: pathSchema,
          readyText: z.string().optional(),
          scenarios: z
            .array(
              z.object({
                id: z.string().regex(/^[a-zA-Z0-9_-]+$/),
                actions: z.array(actionSchema).min(1).max(30),
                expectText: z.string().optional(),
              }),
            )
            .max(20)
            .default([]),
        }),
      )
      .min(1)
      .max(30),
    viewport: z
      .object({
        width: z.number().int().min(320).max(2560),
        height: z.number().int().min(240).max(1800),
      })
      .default({ width: 1280, height: 900 }),
    settleMs: z.number().int().min(0).max(10000).default(300),
    visualTolerance: z.number().min(0).max(1).default(0.02),
    maxNodes: z.number().int().min(1).max(1000).default(300),
    maxCalls: z.number().int().min(1).max(5000).default(500),
    minConfidence: z.number().min(0).max(1).default(0.7),
  })
  .superRefine((v, ctx) => {
    if (
      new Set(v.screens.map((s) => s.id)).size !== v.screens.length ||
      new Set(v.screens.map((s) => s.path)).size !== v.screens.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Screen IDs and paths must be unique.",
      });
    for (const s of v.screens)
      if (new Set(s.scenarios.map((x) => x.id)).size !== s.scenarios.length)
        ctx.addIssue({
          code: "custom",
          message: "Scenario IDs must be unique within each screen.",
        });
  });
export type Config = z.infer<typeof configSchema>;
export type Action = z.infer<typeof actionSchema>;
export type Schema = {
  type?: string;
  properties?: Record<string, Schema>;
  items?: Schema;
  required?: string[];
  [key: string]: unknown;
};
export type Trace = {
  method: string;
  url: string;
  status: number;
  request: unknown;
  response: unknown;
};
export type Endpoint = {
  id: string;
  method: string;
  path: string;
  summary: string;
  parameters: { name: string; in: string; required: boolean; schema: Schema }[];
  requestSchema: Schema;
  responseSchema: Schema;
  authEvidence: "required" | "none" | "unknown";
  source: string[];
  category?: string;
  auth?: string;
  requestShape?: string;
  responseShape?: string;
};
export type Edge = { from: string; to: string; output: string; input: string };
export type Node = {
  id: string;
  tag: string;
  role: string;
  label: string;
  text: string;
  value: string;
  attrs: Record<string, string>;
  style: Record<string, string>;
  children: Node[];
  kind?: string;
  endpoint?: string;
  field?: string;
  component?: string;
  checked?: boolean;
  presentation?: {
    tag: string;
    attrs: Record<string, string>;
    style: Record<string, string>;
    text: string;
  };
};
export type Screen = {
  id: string;
  path: string;
  title: string;
  root: Node;
  network: Trace[];
};
export type Observation = {
  text: string;
  elements: { role: string; label: string; value: string; checked?: boolean }[];
  network: Trace[];
  errors: string[];
};
export type Capture = {
  screens: Screen[];
  baselines: Record<string, Observation>;
  gaps: string[];
};
export function flatten(node: Node): Node[] {
  return [node, ...node.children.flatMap(flatten)];
}
export function fields(schema: Schema, prefix = ""): string[] {
  if (schema.type === "array" && schema.items)
    return fields(schema.items, prefix ? `${prefix}[]` : "[]");
  if (schema.properties)
    return Object.entries(schema.properties).flatMap(([key, s]) =>
      fields(s, prefix ? `${prefix}.${key}` : key),
    );
  return prefix ? [prefix] : [];
}
