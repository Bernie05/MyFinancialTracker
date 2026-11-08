/**
 * Small HTTP helpers: JSON responses, typed errors and one error boundary for every route.
 */
import type { Server } from "bun";
import { ZodError, type ZodType } from "zod";
import type { ApiErrorBody } from "../shared/contracts";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export const json = (data: unknown, status = 200) => Response.json(data, { status });

function errorResponse(status: number, message: string, fields?: Record<string, string>) {
  const body: ApiErrorBody = { error: { message, ...(fields && { fields }) } };
  return json(body, status);
}

/** Largest body most routes accept (audit SEC-7). The biggest real one is under 2 KB. */
export const MAX_REQUEST_BODY = 64 * 1024;
/** The Excel import's rows (up to 5000 per sheet) are the one larger body. Bun's own limit is set to this. */
export const MAX_IMPORT_BODY = 4 * 1024 * 1024;

/**
 * Parses a JSON body against a schema; malformed JSON and invalid shapes both become a 400.
 * Bodies over `maxBytes` get a 413 (Bun's server-wide limit is the larger import one).
 */
export async function readBody<T>(req: Request, schema: ZodType<T>, maxBytes = MAX_REQUEST_BODY): Promise<T> {
  if (Number(req.headers.get("content-length") ?? 0) > maxBytes) throw new HttpError(413, "That request is too large.");
  let raw: unknown;
  try {
    const bytes = await req.arrayBuffer();
    if (bytes.byteLength > maxBytes) throw new HttpError(413, "That request is too large.");
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(400, "The request body isn't valid JSON.");
  }
  return schema.parse(raw);
}

/** Parses URL search params against a schema. */
export function readQuery<T>(req: Request, schema: ZodType<T>): T {
  return schema.parse(Object.fromEntries(new URL(req.url).searchParams));
}

/**
 * Wraps a handler so every failure leaves as the same JSON error shape:
 * validation → 400 with per-field messages, HttpError → its status, anything else → 500.
 */
export function route<R extends Request>(handler: (req: R, server: Server<undefined>) => Promise<Response> | Response) {
  return async (req: R, server: Server<undefined>): Promise<Response> => {
    try {
      return await handler(req, server);
    } catch (err) {
      if (err instanceof ZodError) {
        const fields: Record<string, string> = {};
        for (const issue of err.issues) {
          const key = issue.path.join(".") || "_";
          fields[key] ??= issue.message;
        }
        return errorResponse(400, "Some fields need fixing.", fields);
      }
      if (err instanceof HttpError) return errorResponse(err.status, err.message, err.fields);
      // Route and a short reason only: Drizzle errors carry the bound parameters (hashes, emails) after the
      // first line, so log the driver's own message (the cause) or just the first line.
      const reason = err instanceof Error ? (err.cause instanceof Error ? err.cause.message : err.message.split("\n")[0]) : "unknown error";
      console.error(`500 ${req.method} ${new URL(req.url).pathname}: ${reason}`);
      return errorResponse(500, "Something went wrong on our side. Try again.");
    }
  };
}
