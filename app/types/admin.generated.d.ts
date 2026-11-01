/* eslint-disable eslint-comments/disable-enable-pair */
/* eslint-disable eslint-comments/no-unlimited-disable */
/* eslint-disable */
import type * as AdminTypes from './admin.types.d.ts';

export type RunBulkQueryMutationVariables = AdminTypes.Exact<{
  query: AdminTypes.Scalars['String']['input'];
}>;


export type RunBulkQueryMutation = { bulkOperationRunQuery?: AdminTypes.Maybe<{ bulkOperation?: AdminTypes.Maybe<Pick<AdminTypes.BulkOperation, 'id' | 'status' | 'createdAt'>>, userErrors: Array<Pick<AdminTypes.BulkOperationUserError, 'field' | 'message' | 'code'>> }> };

export type StageBulkVariablesMutationVariables = AdminTypes.Exact<{ [key: string]: never; }>;


export type StageBulkVariablesMutation = { stagedUploadsCreate?: AdminTypes.Maybe<{ stagedTargets?: AdminTypes.Maybe<Array<(
      Pick<AdminTypes.StagedMediaUploadTarget, 'url'>
      & { parameters: Array<Pick<AdminTypes.StagedUploadParameter, 'name' | 'value'>> }
    )>>, userErrors: Array<Pick<AdminTypes.UserError, 'field' | 'message'>> }> };

export type RunBulkMutationMutationVariables = AdminTypes.Exact<{
  mutation: AdminTypes.Scalars['String']['input'];
  stagedUploadPath: AdminTypes.Scalars['String']['input'];
}>;


export type RunBulkMutationMutation = { bulkOperationRunMutation?: AdminTypes.Maybe<{ bulkOperation?: AdminTypes.Maybe<Pick<AdminTypes.BulkOperation, 'id' | 'status' | 'createdAt'>>, userErrors: Array<Pick<AdminTypes.BulkMutationUserError, 'field' | 'message' | 'code'>> }> };

export type BulkOperationStatusQueryVariables = AdminTypes.Exact<{
  id: AdminTypes.Scalars['ID']['input'];
}>;


export type BulkOperationStatusQuery = { bulkOperation?: AdminTypes.Maybe<Pick<AdminTypes.BulkOperation, 'id' | 'status' | 'errorCode' | 'objectCount' | 'rootObjectCount' | 'url' | 'partialDataUrl' | 'createdAt' | 'completedAt'>> };

export type FixCurrentProductsQueryVariables = AdminTypes.Exact<{
  ids: Array<AdminTypes.Scalars['ID']['input']> | AdminTypes.Scalars['ID']['input'];
  keys?: AdminTypes.InputMaybe<Array<AdminTypes.Scalars['String']['input']> | AdminTypes.Scalars['String']['input']>;
}>;


export type FixCurrentProductsQuery = { nodes: Array<AdminTypes.Maybe<(
    Pick<AdminTypes.Product, 'id' | 'title' | 'handle'>
    & { metafields: { nodes: Array<Pick<AdminTypes.Metafield, 'namespace' | 'key' | 'value'>> } }
  )>> };

export type FixChoiceDefinitionsQueryVariables = AdminTypes.Exact<{ [key: string]: never; }>;


export type FixChoiceDefinitionsQuery = { metafieldDefinitions: { nodes: Array<(
      Pick<AdminTypes.MetafieldDefinition, 'namespace' | 'key'>
      & { validations: Array<Pick<AdminTypes.MetafieldDefinitionValidation, 'name' | 'value'>> }
    )> } };

export type B2bCatalogsQueryVariables = AdminTypes.Exact<{ [key: string]: never; }>;


export type B2bCatalogsQuery = { catalogs: { nodes: Array<(
      Pick<AdminTypes.AppCatalog, 'id' | 'status'>
      & { publication?: AdminTypes.Maybe<Pick<AdminTypes.Publication, 'id'>> }
    ) | (
      Pick<AdminTypes.CompanyLocationCatalog, 'id' | 'status'>
      & { publication?: AdminTypes.Maybe<Pick<AdminTypes.Publication, 'id'>> }
    ) | (
      Pick<AdminTypes.MarketCatalog, 'id' | 'status'>
      & { publication?: AdminTypes.Maybe<Pick<AdminTypes.Publication, 'id'>> }
    )> } };

export type ShopOverviewQueryVariables = AdminTypes.Exact<{ [key: string]: never; }>;


export type ShopOverviewQuery = { shop: Pick<AdminTypes.Shop, 'name' | 'myshopifyDomain'>, productsCount?: AdminTypes.Maybe<Pick<AdminTypes.Count, 'count' | 'precision'>>, ingredientDefinition?: AdminTypes.Maybe<Pick<AdminTypes.MetaobjectDefinition, 'name' | 'metaobjectsCount'>> };

interface GeneratedQueryTypes {
  "#graphql\n  query bulkOperationStatus($id: ID!) {\n    bulkOperation(id: $id) {\n      id\n      status\n      errorCode\n      objectCount\n      rootObjectCount\n      url\n      partialDataUrl\n      createdAt\n      completedAt\n    }\n  }\n": {return: BulkOperationStatusQuery, variables: BulkOperationStatusQueryVariables},
  "#graphql\n  query fixCurrentProducts($ids: [ID!]!, $keys: [String!]) {\n    nodes(ids: $ids) {\n      ... on Product {\n        id\n        title\n        handle\n        metafields(first: 20, keys: $keys) {\n          nodes {\n            namespace\n            key\n            value\n          }\n        }\n      }\n    }\n  }\n": {return: FixCurrentProductsQuery, variables: FixCurrentProductsQueryVariables},
  "#graphql\n  query fixChoiceDefinitions {\n    metafieldDefinitions(first: 50, ownerType: PRODUCT, namespace: \"custom\") {\n      nodes {\n        namespace\n        key\n        validations {\n          name\n          value\n        }\n      }\n    }\n  }\n": {return: FixChoiceDefinitionsQuery, variables: FixChoiceDefinitionsQueryVariables},
  "#graphql\n  query b2bCatalogs {\n    catalogs(first: 50, type: COMPANY_LOCATION) {\n      nodes {\n        id\n        status\n        publication {\n          id\n        }\n      }\n    }\n  }\n": {return: B2bCatalogsQuery, variables: B2bCatalogsQueryVariables},
  "#graphql\n  query shopOverview {\n    shop {\n      name\n      myshopifyDomain\n    }\n    productsCount {\n      count\n      precision\n    }\n    ingredientDefinition: metaobjectDefinitionByType(type: \"ingredient\") {\n      name\n      metaobjectsCount\n    }\n  }\n": {return: ShopOverviewQuery, variables: ShopOverviewQueryVariables},
}

interface GeneratedMutationTypes {
  "#graphql\n  mutation runBulkQuery($query: String!) {\n    bulkOperationRunQuery(query: $query) {\n      bulkOperation {\n        id\n        status\n        createdAt\n      }\n      userErrors {\n        field\n        message\n        code\n      }\n    }\n  }\n": {return: RunBulkQueryMutation, variables: RunBulkQueryMutationVariables},
  "#graphql\n  mutation stageBulkVariables {\n    stagedUploadsCreate(\n      input: {\n        resource: BULK_MUTATION_VARIABLES\n        filename: \"variables.jsonl\"\n        mimeType: \"text/jsonl\"\n        httpMethod: POST\n      }\n    ) {\n      stagedTargets {\n        url\n        parameters {\n          name\n          value\n        }\n      }\n      userErrors {\n        field\n        message\n      }\n    }\n  }\n": {return: StageBulkVariablesMutation, variables: StageBulkVariablesMutationVariables},
  "#graphql\n  mutation runBulkMutation($mutation: String!, $stagedUploadPath: String!) {\n    bulkOperationRunMutation(mutation: $mutation, stagedUploadPath: $stagedUploadPath) {\n      bulkOperation {\n        id\n        status\n        createdAt\n      }\n      userErrors {\n        field\n        message\n        code\n      }\n    }\n  }\n": {return: RunBulkMutationMutation, variables: RunBulkMutationMutationVariables},
}
declare module '@shopify/admin-api-client' {
  type InputMaybe<T> = AdminTypes.InputMaybe<T>;
  interface AdminQueries extends GeneratedQueryTypes {}
  interface AdminMutations extends GeneratedMutationTypes {}
}
