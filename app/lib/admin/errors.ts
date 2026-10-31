/**
 * One error shape for every Admin API call in the app.
 *
 * - `graphql`: the request failed at the GraphQL layer (invalid query,
 *   missing scope, throttling). Nothing was read or written.
 * - `user-errors`: a mutation ran but Shopify rejected the input
 *   (`userErrors` in the payload). The HTTP status is still 200.
 * - `empty-response`: the API answered without `data`.
 */
export type AdminApiErrorKind = "graphql" | "user-errors" | "empty-response";

export interface AdminApiErrorDetail {
  message: string;
  field?: readonly string[] | null;
  code?: string | null;
}

export class AdminApiError extends Error {
  readonly kind: AdminApiErrorKind;
  readonly operation: string;
  readonly details: readonly AdminApiErrorDetail[];

  constructor(
    kind: AdminApiErrorKind,
    operation: string,
    details: readonly AdminApiErrorDetail[],
    options?: { cause?: unknown },
  ) {
    const summary = details.map(formatDetail).join("; ") || kind;
    super(`${operation} failed: ${summary}`, options);
    this.name = "AdminApiError";
    this.kind = kind;
    this.operation = operation;
    this.details = details;
  }
}

function formatDetail({ message, field }: AdminApiErrorDetail): string {
  return field && field.length > 0 ? `${field.join(".")}: ${message}` : message;
}

/** Throws when a mutation payload carries `userErrors`. */
export function assertNoUserErrors(
  operation: string,
  userErrors: readonly AdminApiErrorDetail[] | null | undefined,
): void {
  if (userErrors && userErrors.length > 0) {
    throw new AdminApiError("user-errors", operation, userErrors);
  }
}

interface GraphQLErrorLike {
  message: string;
  extensions?: { code?: string } | null;
}

/**
 * Reads the GraphQL errors attached by `@shopify/shopify-api`
 * (`GraphqlQueryError.body.errors.graphQLErrors`) without depending on the
 * class itself, so the check also works across duplicated package copies.
 */
function readGraphQLErrors(error: unknown): GraphQLErrorLike[] | null {
  if (typeof error !== "object" || error === null || !("body" in error)) {
    return null;
  }
  const body = (error as { body?: { errors?: { graphQLErrors?: unknown } } })
    .body;
  const list = body?.errors?.graphQLErrors;
  return Array.isArray(list) ? (list as GraphQLErrorLike[]) : null;
}

/**
 * Normalizes anything thrown by `admin.graphql` into an `AdminApiError`.
 * A thrown `Response` is returned as is: the library uses it to redirect
 * the merchant through re-authentication, so it must reach React Router.
 */
export function toAdminApiError(
  operation: string,
  error: unknown,
): AdminApiError | Response {
  if (error instanceof AdminApiError || error instanceof Response) {
    return error;
  }
  const graphQLErrors = readGraphQLErrors(error);
  if (graphQLErrors) {
    return new AdminApiError(
      "graphql",
      operation,
      graphQLErrors.map(({ message, extensions }) => ({
        message,
        code: extensions?.code ?? null,
      })),
      { cause: error },
    );
  }
  const message = error instanceof Error ? error.message : String(error);
  return new AdminApiError("graphql", operation, [{ message }], {
    cause: error,
  });
}
