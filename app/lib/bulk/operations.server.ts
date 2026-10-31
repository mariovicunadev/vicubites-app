import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

import { AdminApiError, assertNoUserErrors } from "../admin/errors";
import { adminGraphql } from "../admin/graphql.server";
import { assembleTree, parseJsonl, splitLines, type BulkNode } from "./jsonl";

type AdminGraphql = AdminApiContext["graphql"];

const RUN_BULK_QUERY = `#graphql
  mutation runBulkQuery($query: String!) {
    bulkOperationRunQuery(query: $query) {
      bulkOperation {
        id
        status
        createdAt
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

const BULK_OPERATION_STATUS_QUERY = `#graphql
  query bulkOperationStatus($id: ID!) {
    bulkOperation(id: $id) {
      id
      status
      errorCode
      objectCount
      rootObjectCount
      url
      partialDataUrl
      createdAt
      completedAt
    }
  }
`;

/** Starts a bulk query. Shopify runs it in the background and returns at once. */
export async function startBulkQuery(graphql: AdminGraphql, query: string) {
  const { bulkOperationRunQuery } = await adminGraphql(graphql, RUN_BULK_QUERY, {
    variables: { query },
  });
  assertNoUserErrors("runBulkQuery", bulkOperationRunQuery?.userErrors);

  const operation = bulkOperationRunQuery?.bulkOperation;
  if (!operation) {
    throw new AdminApiError("empty-response", "runBulkQuery", []);
  }
  return operation;
}

export async function getBulkOperation(graphql: AdminGraphql, id: string) {
  const { bulkOperation } = await adminGraphql(graphql, BULK_OPERATION_STATUS_QUERY, {
    variables: { id },
  });
  return bulkOperation ?? null;
}

/**
 * Downloads a result file and rebuilds its tree. The body is decoded and read
 * line by line as it arrives instead of being loaded as one string.
 */
export async function downloadBulkResult(url: string): Promise<BulkNode[]> {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Bulk result download failed with HTTP ${response.status}`);
  }
  const text = response.body.pipeThrough(new TextDecoderStream());
  return assembleTree(parseJsonl(splitLines(readChunks(text))));
}

/** Web streams aren't typed as async iterables in the DOM lib; read them explicitly. */
async function* readChunks(stream: ReadableStream<string>): AsyncGenerator<string> {
  const reader = stream.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}
