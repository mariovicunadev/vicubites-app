/**
 * Bulk query results arrive as JSONL: one object per line, with nested
 * connection items flattened into their own lines that point back to their
 * parent through `__parentId`. These helpers stream the file line by line and
 * rebuild the parent → children tree.
 */

export interface BulkRecord {
  id?: string;
  __parentId?: string;
  [field: string]: unknown;
}

export interface BulkNode {
  record: BulkRecord;
  /** Children grouped by resource type, read from the child's GID. */
  children: Record<string, BulkNode[]>;
}

/** `gid://shopify/ProductVariant/1` → `ProductVariant`. */
export function gidType(gid: string): string {
  const match = /^gid:\/\/shopify\/([^/]+)\//.exec(gid);
  if (!match) {
    throw new Error(`Not a Shopify GID: ${gid}`);
  }
  return match[1];
}

/** Splits a stream of text chunks into lines, without buffering the whole file. */
export async function* splitLines(
  chunks: AsyncIterable<string>,
): AsyncGenerator<string> {
  let buffer = "";
  for await (const chunk of chunks) {
    buffer += chunk;
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      yield buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
    }
  }
  if (buffer.length > 0) {
    yield buffer;
  }
}

/** Parses JSONL lines, skipping blank ones and reporting the line number on bad JSON. */
export async function* parseJsonl(
  lines: AsyncIterable<string>,
): AsyncGenerator<BulkRecord> {
  let lineNumber = 0;
  for await (const line of lines) {
    lineNumber += 1;
    const trimmed = line.trim();
    if (trimmed === "") continue;
    try {
      yield JSON.parse(trimmed) as BulkRecord;
    } catch {
      throw new Error(`Invalid JSONL at line ${lineNumber}`);
    }
  }
}

/**
 * Rebuilds the tree from flat records. Roots keep file order. A child that
 * arrives before its parent waits in `pending` until the parent shows up, so
 * the result doesn't depend on line order.
 */
export async function assembleTree(
  records: AsyncIterable<BulkRecord>,
): Promise<BulkNode[]> {
  const roots: BulkNode[] = [];
  const byId = new Map<string, BulkNode>();
  const pending = new Map<string, BulkNode[]>();

  const attach = (parent: BulkNode, child: BulkNode) => {
    const type = child.record.id ? gidType(child.record.id) : "Unknown";
    (parent.children[type] ??= []).push(child);
  };

  for await (const record of records) {
    const node: BulkNode = { record, children: {} };

    if (record.id) {
      byId.set(record.id, node);
      for (const waiting of pending.get(record.id) ?? []) {
        attach(node, waiting);
      }
      pending.delete(record.id);
    }

    const parentId = record.__parentId;
    if (!parentId) {
      roots.push(node);
      continue;
    }
    const parent = byId.get(parentId);
    if (parent) {
      attach(parent, node);
    } else {
      const waiting = pending.get(parentId) ?? [];
      waiting.push(node);
      pending.set(parentId, waiting);
    }
  }

  if (pending.size > 0) {
    throw new Error(
      `Bulk result has children without a parent: ${[...pending.keys()].join(", ")}`,
    );
  }
  return roots;
}
