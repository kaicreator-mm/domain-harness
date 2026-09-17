import * as z from 'zod';

const stateId = z.string().regex(/^[a-z][a-z0-9_]*$/);
const relativeRef = z.string().min(1);

export const harnessManifestSchema = z.object({
  schemaVersion: z.literal('0.1'),
  id: z.string().min(1),
  limits: z.object({
    maxSteps: z.number().int().positive(),
  }).strict(),
}).strict();

export interface RawRoute { target: string; when?: string | undefined }
export interface RawDirectEvent extends RawRoute { schema?: string | undefined }
export type RawEventSpec = RawDirectEvent | RawRoute[] | { schema?: string | undefined; routes: RawRoute[] };
export interface RawInvoke { skill?: string | undefined; tool?: string | undefined; script?: string | undefined; expr?: string | undefined; workflow?: string | undefined; input?: string | undefined; timeoutMs?: number | undefined }
export interface RawState { final?: boolean | undefined; invoke?: RawInvoke | undefined; on?: Record<string, RawEventSpec> | undefined }
export interface RawWorkflowFile { initial: string; output?: string | undefined; states: Record<string, RawState> }

const invokeSchema = z.object({
  skill: relativeRef.optional(),
  tool: relativeRef.optional(),
  script: relativeRef.optional(),
  expr: z.string().min(1).optional(),
  workflow: relativeRef.optional(),
  input: z.string().min(1).optional(),
  timeoutMs: z.number().int().positive().optional(),
}).strict().refine((value: RawInvoke) => {
  const count = [value.skill, value.tool, value.script, value.expr, value.workflow]
    .filter((item) => item !== undefined).length;
  return count === 1;
}, { message: 'invoke must declare exactly one of skill/tool/script/expr/workflow' });

const routeSchema = z.object({
  target: stateId,
  when: z.string().min(1).optional(),
}).strict();

const directEventSchema = z.object({
  target: stateId,
  when: z.string().min(1).optional(),
  schema: relativeRef.optional(),
}).strict();

const routedEventSchema = z.object({
  schema: relativeRef.optional(),
  routes: z.array(routeSchema).min(1),
}).strict();

export const routeSpecSchema = z.union([
  routeSchema,
  z.array(routeSchema).min(1),
]);

export const eventSpecSchema = z.union([
  directEventSchema,
  z.array(routeSchema).min(1),
  routedEventSchema,
]);

export const workflowFileSchema = z.object({
  initial: stateId,
  output: z.string().min(1).optional(),
  states: z.record(stateId, z.object({
    final: z.boolean().optional().default(false),
    invoke: invokeSchema.optional(),
    on: z.record(z.string().min(1), eventSpecSchema).optional().default({}),
  }).strict()),
}).strict();

export const skillSidecarSchema = z.object({
  input: z.object({ schema: relativeRef }).strict().optional(),
  output: z.object({ schema: relativeRef }).strict(),
  resources: z.array(relativeRef).optional().default([]),
  profile: z.string().min(1).optional(),
}).strict();
