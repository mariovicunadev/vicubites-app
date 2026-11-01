import { describe, expect, it } from "vitest";

import { activePublicationIds } from "./b2b.server";

describe("activePublicationIds", () => {
  it("keeps active catalogs that have a publication, without duplicates", () => {
    const catalogs = [
      { status: "ACTIVE", publication: { id: "gid://shopify/Publication/1" } },
      { status: "ARCHIVED", publication: { id: "gid://shopify/Publication/2" } },
      { status: "DRAFT", publication: { id: "gid://shopify/Publication/3" } },
      { status: "ACTIVE", publication: null },
      { status: "ACTIVE", publication: { id: "gid://shopify/Publication/1" } },
    ];

    expect(activePublicationIds(catalogs)).toEqual(["gid://shopify/Publication/1"]);
  });

  it("returns nothing for a store without B2B catalogs", () => {
    expect(activePublicationIds([])).toEqual([]);
  });
});
