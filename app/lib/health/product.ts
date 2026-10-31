import type { BulkNode } from "../bulk/jsonl";

/** The product fields the health rules read, flattened from a bulk export node. */
export interface ProductData {
  id: string;
  title: string;
  handle: string;
  status: string;
  /** Metafield values keyed by `namespace.key`. */
  metafields: Readonly<Record<string, string>>;
  variants: readonly { id: string; title: string; sku: string | null }[];
  media: readonly { id: string; alt: string | null }[];
}

const MEDIA_TYPES = ["MediaImage", "Video", "ExternalVideo", "Model3d"] as const;

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

export function productFromNode(node: BulkNode): ProductData {
  const { record, children } = node;
  const metafields: Record<string, string> = {};
  for (const { record: metafield } of children.Metafield ?? []) {
    metafields[`${text(metafield.namespace)}.${text(metafield.key)}`] = text(metafield.value);
  }

  return {
    id: text(record.id),
    title: text(record.title),
    handle: text(record.handle),
    status: text(record.status),
    metafields,
    variants: (children.ProductVariant ?? []).map(({ record: variant }) => ({
      id: text(variant.id),
      title: text(variant.title),
      sku: optionalText(variant.sku),
    })),
    media: MEDIA_TYPES.flatMap((type) => children[type] ?? []).map(({ record: media }) => ({
      id: text(media.id),
      alt: optionalText(media.alt),
    })),
  };
}

/**
 * A metafield counts as filled when it has a value; list metafields
 * (`list.*`, stored as JSON arrays) also need at least one item.
 */
export function hasMetafield(product: ProductData, key: string): boolean {
  const value = product.metafields[key]?.trim();
  if (!value) return false;
  if (value.startsWith("[")) {
    try {
      const list: unknown = JSON.parse(value);
      return Array.isArray(list) && list.length > 0;
    } catch {
      return false;
    }
  }
  return true;
}

/** `gid://shopify/Product/123` → `123`, for admin links. */
export function legacyId(gid: string): string {
  return gid.slice(gid.lastIndexOf("/") + 1);
}
