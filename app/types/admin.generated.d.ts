/* eslint-disable eslint-comments/disable-enable-pair */
/* eslint-disable eslint-comments/no-unlimited-disable */
/* eslint-disable */
import type * as AdminTypes from './admin.types.d.ts';

export type RunBulkQueryMutationVariables = AdminTypes.Exact<{
  query: AdminTypes.Scalars['String']['input'];
}>;


export type RunBulkQueryMutation = { bulkOperationRunQuery?: AdminTypes.Maybe<{ bulkOperation?: AdminTypes.Maybe<Pick<AdminTypes.BulkOperation, 'id' | 'status' | 'createdAt'>>, userErrors: Array<Pick<AdminTypes.BulkOperationUserError, 'field' | 'message' | 'code'>> }> };

export type BulkOperationStatusQueryVariables = AdminTypes.Exact<{
  id: AdminTypes.Scalars['ID']['input'];
}>;


export type BulkOperationStatusQuery = { bulkOperation?: AdminTypes.Maybe<Pick<AdminTypes.BulkOperation, 'id' | 'status' | 'errorCode' | 'objectCount' | 'rootObjectCount' | 'url' | 'partialDataUrl' | 'createdAt' | 'completedAt'>> };

export type ShopOverviewQueryVariables = AdminTypes.Exact<{ [key: string]: never; }>;


export type ShopOverviewQuery = { shop: Pick<AdminTypes.Shop, 'name' | 'myshopifyDomain'>, productsCount?: AdminTypes.Maybe<Pick<AdminTypes.Count, 'count' | 'precision'>>, ingredientDefinition?: AdminTypes.Maybe<Pick<AdminTypes.MetaobjectDefinition, 'name' | 'metaobjectsCount'>> };

interface GeneratedQueryTypes {
  "#graphql\n  query bulkOperationStatus($id: ID!) {\n    bulkOperation(id: $id) {\n      id\n      status\n      errorCode\n      objectCount\n      rootObjectCount\n      url\n      partialDataUrl\n      createdAt\n      completedAt\n    }\n  }\n": {return: BulkOperationStatusQuery, variables: BulkOperationStatusQueryVariables},
  "#graphql\n  query shopOverview {\n    shop {\n      name\n      myshopifyDomain\n    }\n    productsCount {\n      count\n      precision\n    }\n    ingredientDefinition: metaobjectDefinitionByType(type: \"ingredient\") {\n      name\n      metaobjectsCount\n    }\n  }\n": {return: ShopOverviewQuery, variables: ShopOverviewQueryVariables},
}

interface GeneratedMutationTypes {
  "#graphql\n  mutation runBulkQuery($query: String!) {\n    bulkOperationRunQuery(query: $query) {\n      bulkOperation {\n        id\n        status\n        createdAt\n      }\n      userErrors {\n        field\n        message\n        code\n      }\n    }\n  }\n": {return: RunBulkQueryMutation, variables: RunBulkQueryMutationVariables},
}
declare module '@shopify/admin-api-client' {
  type InputMaybe<T> = AdminTypes.InputMaybe<T>;
  interface AdminQueries extends GeneratedQueryTypes {}
  interface AdminMutations extends GeneratedMutationTypes {}
}
