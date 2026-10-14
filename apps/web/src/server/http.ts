/**
 * Small HTTP helpers: JSON responses, typed errors and one error boundary for every route.
 */
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

/** Parses a JSON body against a schema; malformed JSON and invalid shapes both become a 400. */
export async function readBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
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
export function route<R extends Request>(handler: (req: R) => Promise<Response> | Response) {
  return async (req: R): Promise<Response> => {
    try {
      return await handler(req);
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
      console.error(err);
      return errorResponse(500, "Something went wrong on our side. Try again.");
    }
  };
}
