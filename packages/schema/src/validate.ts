import type { TSchema, Static } from '@sinclair/typebox';
import { TypeCompiler, type TypeCheck } from '@sinclair/typebox/compiler';
import { FrameError } from './command.js';

const cache = new WeakMap<TSchema, TypeCheck<TSchema>>();

function compiled<T extends TSchema>(schema: T): TypeCheck<T> {
  let c = cache.get(schema);
  if (!c) {
    c = TypeCompiler.Compile(schema);
    cache.set(schema, c);
  }
  return c as TypeCheck<T>;
}

export interface SchemaIssue {
  path: string;
  message: string;
}

export function check<T extends TSchema>(schema: T, value: unknown): value is Static<T> {
  return compiled(schema).Check(value);
}

export function issues<T extends TSchema>(schema: T, value: unknown, limit = 50): SchemaIssue[] {
  const out: SchemaIssue[] = [];
  for (const e of compiled(schema).Errors(value)) {
    out.push({ path: e.path || '/', message: e.message });
    if (out.length >= limit) break;
  }
  return out;
}

/** Throws VALIDATION_FAILED with the list of schema issues. */
export function assertValid<T extends TSchema>(schema: T, value: unknown, what: string): asserts value is Static<T> {
  if (!check(schema, value)) {
    throw new FrameError('VALIDATION_FAILED', `${what} does not match its schema`, { issues: issues(schema, value) });
  }
}
