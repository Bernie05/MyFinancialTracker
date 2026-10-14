/**
 * The one place the client talks HTTP. Every response is validated against its shared
 * Zod contract, so a server change that breaks the shape fails loudly here, not deep in a component.
 */
import type { ZodType } from "zod";
import { apiErrorSchema } from "../../shared/contracts";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

export async function request<T>(path: string, schema: ZodType<T> | null, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check that it's running, then try again.");
  }

  if (!res.ok) {
    const body = apiErrorSchema.safeParse(await res.json().catch(() => null));
    throw body.success
      ? new ApiError(res.status, body.data.error.message, body.data.error.fields)
      : new ApiError(res.status, `The server answered ${res.status}.`);
  }

  if (schema === null || res.status === 204) return undefined as T;
  return schema.parse(await res.json());
}
