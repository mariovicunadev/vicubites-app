import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

import { AdminApiError, assertNoUserErrors } from "../admin/errors";
import { adminGraphql } from "../admin/graphql.server";
import { assembleTree, parseJsonl, splitLines, type BulkNode, type BulkRecord } from "./jsonl";

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

const STAGE_BULK_VARIABLES = `#graphql
  mutation stageBulkVariables {
    stagedUploadsCreate(
      input: {
        resource: BULK_MUTATION_VARIABLES
        filename: "variables.jsonl"
        mimeType: "text/jsonl"
        httpMethod: POST
      }
    ) {
      stagedTargets {
        url
        parameters {
          name
          value
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const RUN_BULK_MUTATION = `#graphql
  mutation runBulkMutation($mutation: String!, $stagedUploadPath: String!) {
    bulkOperationRunMutation(mutation: $mutation, stagedUploadPath: $stagedUploadPath) {
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

/**
 * Uploads the variables file for a bulk mutation and returns its staged
 * upload path. The file goes straight to Shopify's storage with the signed
 * form parameters; GraphQL only hands out the target.
 */
export async function stageBulkVariables(graphql: AdminGraphql, jsonl: string): Promise<string> {
  const { stagedUploadsCreate } = await adminGraphql(graphql, STAGE_BULK_VARIABLES);
  assertNoUserErrors("stageBulkVariables", stagedUploadsCreate?.userErrors);

  const target = stagedUploadsCreate?.stagedTargets?.[0];
  const path = target?.parameters.find((parameter) => parameter.name === "key")?.value;
  if (!target?.url || !path) {
    throw new AdminApiError("empty-response", "stageBulkVariables", []);
  }

  const form = new FormData();
  for (const { name, value } of target.parameters) form.append(name, value);
  form.append("file", new Blob([jsonl], { type: "text/jsonl" }), "variables.jsonl");
  const upload = await fetch(target.url, { method: "POST", body: form });
  if (!upload.ok) {
    throw new Error(`Bulk variables upload failed with HTTP ${upload.status}`);
  }
  return path;
}

/** Starts a bulk mutation: Shopify runs `mutation` once per line of the staged file. */
export async function startBulkMutation(
  graphql: AdminGraphql,
  mutation: string,
  stagedUploadPath: string,
) {
  const { bulkOperationRunMutation } = await adminGraphql(graphql, RUN_BULK_MUTATION, {
    variables: { mutation, stagedUploadPath },
  });
  assertNoUserErrors("runBulkMutation", bulkOperationRunMutation?.userErrors);

  const operation = bulkOperationRunMutation?.bulkOperation;
  if (!operation) {
    throw new AdminApiError("empty-response", "runBulkMutation", []);
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
  return assembleTree(streamBulkRecords(url));
}

/** Mutation results are flat: one record per input line, no `__parentId` tree. */
export async function downloadBulkRecords(url: string): Promise<BulkRecord[]> {
  const records: BulkRecord[] = [];
  for await (const record of streamBulkRecords(url)) records.push(record);
  return records;
}

async function* streamBulkRecords(url: string): AsyncGenerator<BulkRecord> {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Bulk result download failed with HTTP ${response.status}`);
  }
  const text = response.body.pipeThrough(new TextDecoderStream());
  yield* parseJsonl(splitLines(readChunks(text)));
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
