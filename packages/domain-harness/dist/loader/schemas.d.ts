import * as z from 'zod';
export declare const harnessManifestSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<"0.1">;
    id: z.ZodString;
    limits: z.ZodObject<{
        maxSteps: z.ZodNumber;
    }, z.core.$strict>;
}, z.core.$strict>;
export interface RawRoute {
    target: string;
    when?: string | undefined;
}
export interface RawDirectEvent extends RawRoute {
    schema?: string | undefined;
}
export type RawEventSpec = RawDirectEvent | RawRoute[] | {
    schema?: string | undefined;
    routes: RawRoute[];
};
export interface RawInvoke {
    skill?: string | undefined;
    tool?: string | undefined;
    script?: string | undefined;
    expr?: string | undefined;
    workflow?: string | undefined;
    input?: string | undefined;
    timeoutMs?: number | undefined;
}
export interface RawState {
    final?: boolean | undefined;
    invoke?: RawInvoke | undefined;
    on?: Record<string, RawEventSpec> | undefined;
}
export interface RawWorkflowFile {
    initial: string;
    output?: string | undefined;
    states: Record<string, RawState>;
}
export declare const routeSpecSchema: z.ZodUnion<readonly [z.ZodObject<{
    target: z.ZodString;
    when: z.ZodOptional<z.ZodString>;
}, z.core.$strict>, z.ZodArray<z.ZodObject<{
    target: z.ZodString;
    when: z.ZodOptional<z.ZodString>;
}, z.core.$strict>>]>;
export declare const eventSpecSchema: z.ZodUnion<readonly [z.ZodObject<{
    target: z.ZodString;
    when: z.ZodOptional<z.ZodString>;
    schema: z.ZodOptional<z.ZodString>;
}, z.core.$strict>, z.ZodArray<z.ZodObject<{
    target: z.ZodString;
    when: z.ZodOptional<z.ZodString>;
}, z.core.$strict>>, z.ZodObject<{
    schema: z.ZodOptional<z.ZodString>;
    routes: z.ZodArray<z.ZodObject<{
        target: z.ZodString;
        when: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>;
}, z.core.$strict>]>;
export declare const workflowFileSchema: z.ZodObject<{
    initial: z.ZodString;
    output: z.ZodOptional<z.ZodString>;
    states: z.ZodRecord<z.ZodString, z.ZodObject<{
        final: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
        invoke: z.ZodOptional<z.ZodObject<{
            skill: z.ZodOptional<z.ZodString>;
            tool: z.ZodOptional<z.ZodString>;
            script: z.ZodOptional<z.ZodString>;
            expr: z.ZodOptional<z.ZodString>;
            workflow: z.ZodOptional<z.ZodString>;
            input: z.ZodOptional<z.ZodString>;
            timeoutMs: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strict>>;
        on: z.ZodDefault<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnion<readonly [z.ZodObject<{
            target: z.ZodString;
            when: z.ZodOptional<z.ZodString>;
            schema: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>, z.ZodArray<z.ZodObject<{
            target: z.ZodString;
            when: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>, z.ZodObject<{
            schema: z.ZodOptional<z.ZodString>;
            routes: z.ZodArray<z.ZodObject<{
                target: z.ZodString;
                when: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>>;
        }, z.core.$strict>]>>>>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export declare const skillSidecarSchema: z.ZodObject<{
    input: z.ZodOptional<z.ZodObject<{
        schema: z.ZodString;
    }, z.core.$strict>>;
    output: z.ZodObject<{
        schema: z.ZodString;
    }, z.core.$strict>;
    resources: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodString>>>;
    profile: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
//# sourceMappingURL=schemas.d.ts.map