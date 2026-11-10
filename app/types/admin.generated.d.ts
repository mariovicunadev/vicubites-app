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

export type BundlesOverviewQueryVariables = AdminTypes.Exact<{
  kitHandle: AdminTypes.Scalars['String']['input'];
  recipeQuery: AdminTypes.Scalars['String']['input'];
  treatsHandle: AdminTypes.Scalars['String']['input'];
}>;


export type BundlesOverviewQuery = { shopifyFunctions: { nodes: Array<Pick<AdminTypes.ShopifyFunction, 'id' | 'handle'>> }, cartTransforms: { nodes: Array<(
      Pick<AdminTypes.CartTransform, 'id' | 'functionId'>
      & { config?: AdminTypes.Maybe<Pick<AdminTypes.Metafield, 'jsonValue'>> }
    )> }, shop: (
    Pick<AdminTypes.Shop, 'id'>
    & { features: { bundles: Pick<AdminTypes.BundlesFeature, 'eligibleForBundles'> } }
  ), kit?: AdminTypes.Maybe<(
    Pick<AdminTypes.Product, 'legacyResourceId' | 'status'>
    & { variants: { nodes: Array<Pick<AdminTypes.ProductVariant, 'id' | 'requiresComponents'>> } }
  )>, recipes: { nodes: Array<(
      Pick<AdminTypes.Product, 'handle' | 'title'>
      & { variants: { nodes: Array<(
          Pick<AdminTypes.ProductVariant, 'id' | 'title' | 'price'>
          & { bagGrams?: AdminTypes.Maybe<Pick<AdminTypes.Metafield, 'value'>> }
        )> } }
    )> }, treats?: AdminTypes.Maybe<(
    Pick<AdminTypes.Product, 'status'>
    & { variants: { nodes: Array<Pick<AdminTypes.ProductVariant, 'id' | 'title' | 'price'>> } }
  )> };

export type StarterKitTransformCreateMutationVariables = AdminTypes.Exact<{
  functionHandle: AdminTypes.Scalars['String']['input'];
  metafields: Array<AdminTypes.MetafieldInput> | AdminTypes.MetafieldInput;
}>;


export type StarterKitTransformCreateMutation = { cartTransformCreate?: AdminTypes.Maybe<{ cartTransform?: AdminTypes.Maybe<Pick<AdminTypes.CartTransform, 'id'>>, userErrors: Array<Pick<AdminTypes.CartTransformCreateUserError, 'field' | 'message' | 'code'>> }> };

export type StarterKitConfigSetMutationVariables = AdminTypes.Exact<{
  metafields: Array<AdminTypes.MetafieldsSetInput> | AdminTypes.MetafieldsSetInput;
}>;


export type StarterKitConfigSetMutation = { metafieldsSet?: AdminTypes.Maybe<{ metafields?: AdminTypes.Maybe<Array<Pick<AdminTypes.Metafield, 'id'>>>, userErrors: Array<Pick<AdminTypes.MetafieldsSetUserError, 'field' | 'message' | 'code'>> }> };

export type CheckoutRulesOverviewQueryVariables = AdminTypes.Exact<{ [key: string]: never; }>;


export type CheckoutRulesOverviewQuery = { shopifyFunctions: { nodes: Array<Pick<AdminTypes.ShopifyFunction, 'id' | 'handle'>> }, discountNodes: { nodes: Array<(
      Pick<AdminTypes.DiscountNode, 'id'>
      & { config?: AdminTypes.Maybe<Pick<AdminTypes.Metafield, 'jsonValue'>>, discount: (
        { __typename: 'DiscountAutomaticApp' }
        & Pick<AdminTypes.DiscountAutomaticApp, 'title' | 'status'>
        & { appDiscountType: Pick<AdminTypes.AppDiscountType, 'functionId'> }
      ) | { __typename: 'DiscountAutomaticBasic' | 'DiscountAutomaticBxgy' | 'DiscountAutomaticFreeShipping' | 'DiscountCodeApp' | 'DiscountCodeBasic' | 'DiscountCodeBxgy' | 'DiscountCodeFreeShipping' } }
    )> }, validations: { nodes: Array<(
      Pick<AdminTypes.Validation, 'id' | 'title' | 'enabled'>
      & { shopifyFunction: Pick<AdminTypes.ShopifyFunction, 'id'>, config?: AdminTypes.Maybe<Pick<AdminTypes.Metafield, 'jsonValue'>> }
    )> } };

export type RefillRewardCreateMutationVariables = AdminTypes.Exact<{
  discount: AdminTypes.DiscountAutomaticAppInput;
}>;


export type RefillRewardCreateMutation = { discountAutomaticAppCreate?: AdminTypes.Maybe<{ automaticAppDiscount?: AdminTypes.Maybe<Pick<AdminTypes.DiscountAutomaticApp, 'discountId'>>, userErrors: Array<Pick<AdminTypes.DiscountUserError, 'field' | 'message' | 'code'>> }> };

export type OrderLimitCreateMutationVariables = AdminTypes.Exact<{
  validation: AdminTypes.ValidationCreateInput;
}>;


export type OrderLimitCreateMutation = { validationCreate?: AdminTypes.Maybe<{ validation?: AdminTypes.Maybe<Pick<AdminTypes.Validation, 'id'>>, userErrors: Array<Pick<AdminTypes.ValidationUserError, 'field' | 'message' | 'code'>> }> };

export type CheckoutRuleConfigSetMutationVariables = AdminTypes.Exact<{
  metafields: Array<AdminTypes.MetafieldsSetInput> | AdminTypes.MetafieldsSetInput;
}>;


export type CheckoutRuleConfigSetMutation = { metafieldsSet?: AdminTypes.Maybe<{ metafields?: AdminTypes.Maybe<Array<Pick<AdminTypes.Metafield, 'id'>>>, userErrors: Array<Pick<AdminTypes.MetafieldsSetUserError, 'field' | 'message' | 'code'>> }> };

export type FixCurrentProductsQueryVariables = AdminTypes.Exact<{
  ids: Array<AdminTypes.Scalars['ID']['input']> | AdminTypes.Scalars['ID']['input'];
  keys?: AdminTypes.InputMaybe<Array<AdminTypes.Scalars['String']['input']> | AdminTypes.Scalars['String']['input']>;
}>;


export type FixCurrentProductsQuery = { nodes: Array<AdminTypes.Maybe<(
    Pick<AdminTypes.Product, 'id' | 'title' | 'handle'>
    & { metafields: { nodes: Array<(
        Pick<AdminTypes.Metafield, 'namespace' | 'key' | 'value'>
        & { reference?: AdminTypes.Maybe<Pick<AdminTypes.Metaobject, 'handle'>> }
      )> } }
  )>> };

export type FixChoiceDefinitionsQueryVariables = AdminTypes.Exact<{ [key: string]: never; }>;


export type FixChoiceDefinitionsQuery = { metafieldDefinitions: { nodes: Array<(
      Pick<AdminTypes.MetafieldDefinition, 'namespace' | 'key'>
      & { validations: Array<Pick<AdminTypes.MetafieldDefinitionValidation, 'name' | 'value'>> }
    )> } };

export type FixKeyEntriesQueryVariables = AdminTypes.Exact<{ [key: string]: never; }>;


export type FixKeyEntriesQuery = { species: { nodes: Array<Pick<AdminTypes.Metaobject, 'id' | 'handle'>> }, foodType: { nodes: Array<Pick<AdminTypes.Metaobject, 'id' | 'handle'>> }, protein: { nodes: Array<Pick<AdminTypes.Metaobject, 'id' | 'handle'>> } };

export type FlowTriggerRefillDueMutationVariables = AdminTypes.Exact<{
  handle: AdminTypes.Scalars['String']['input'];
  payload: AdminTypes.Scalars['JSON']['input'];
}>;


export type FlowTriggerRefillDueMutation = { flowTriggerReceive?: AdminTypes.Maybe<{ userErrors: Array<Pick<AdminTypes.UserError, 'field' | 'message'>> }> };

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

export type ProductHealthDataQueryVariables = AdminTypes.Exact<{
  id: AdminTypes.Scalars['ID']['input'];
}>;


export type ProductHealthDataQuery = { product?: AdminTypes.Maybe<(
    Pick<AdminTypes.Product, 'id' | 'title' | 'handle' | 'status' | 'requiresSellingPlan'>
    & { variants: { nodes: Array<Pick<AdminTypes.ProductVariant, 'id' | 'title' | 'sku'>> }, metafields: { nodes: Array<Pick<AdminTypes.Metafield, 'namespace' | 'key' | 'value'>> }, media: { nodes: Array<Pick<AdminTypes.ExternalVideo, 'id' | 'alt'> | Pick<AdminTypes.MediaImage, 'id' | 'alt'> | Pick<AdminTypes.Model3d, 'id' | 'alt'> | Pick<AdminTypes.Video, 'id' | 'alt'>> }, resourcePublicationsV2: { nodes: Array<{ publication: Pick<AdminTypes.Publication, 'id'> }> } }
  )> };

export type HubspotCompaniesQueryVariables = AdminTypes.Exact<{
  after?: AdminTypes.InputMaybe<AdminTypes.Scalars['String']['input']>;
}>;


export type HubspotCompaniesQuery = { companies: { pageInfo: Pick<AdminTypes.PageInfo, 'hasNextPage' | 'endCursor'>, nodes: Array<(
      Pick<AdminTypes.Company, 'id' | 'name'>
      & { contacts: { nodes: Array<(
          Pick<AdminTypes.CompanyContact, 'id'>
          & { customer: { defaultEmailAddress?: AdminTypes.Maybe<Pick<AdminTypes.CustomerEmailAddress, 'emailAddress'>> } }
        )> } }
    )> } };

export type HubspotCompanyQueryVariables = AdminTypes.Exact<{
  id: AdminTypes.Scalars['ID']['input'];
}>;


export type HubspotCompanyQuery = { company?: AdminTypes.Maybe<(
    Pick<AdminTypes.Company, 'id' | 'name'>
    & { contacts: { nodes: Array<(
        Pick<AdminTypes.CompanyContact, 'id'>
        & { customer: { defaultEmailAddress?: AdminTypes.Maybe<Pick<AdminTypes.CustomerEmailAddress, 'emailAddress'>> } }
      )> } }
  )> };

export type HubspotCompanyOfContactQueryVariables = AdminTypes.Exact<{
  id: AdminTypes.Scalars['ID']['input'];
}>;


export type HubspotCompanyOfContactQuery = { companyContact?: AdminTypes.Maybe<{ company: Pick<AdminTypes.Company, 'id'> }> };

export type RefillCustomerDefinitionsQueryVariables = AdminTypes.Exact<{ [key: string]: never; }>;


export type RefillCustomerDefinitionsQuery = { metafieldDefinitions: { nodes: Array<(
      Pick<AdminTypes.MetafieldDefinition, 'key'>
      & { type: Pick<AdminTypes.MetafieldDefinitionType, 'name'> }
    )> } };

export type RefillMetafieldsSetMutationVariables = AdminTypes.Exact<{
  metafields: Array<AdminTypes.MetafieldsSetInput> | AdminTypes.MetafieldsSetInput;
}>;


export type RefillMetafieldsSetMutation = { metafieldsSet?: AdminTypes.Maybe<{ metafields?: AdminTypes.Maybe<Array<Pick<AdminTypes.Metafield, 'key'>>>, userErrors: Array<Pick<AdminTypes.MetafieldsSetUserError, 'field' | 'message'>> }> };

export type RefillPixelQueryVariables = AdminTypes.Exact<{ [key: string]: never; }>;


export type RefillPixelQuery = { webPixel?: AdminTypes.Maybe<Pick<AdminTypes.WebPixel, 'id' | 'settings'>> };

export type RefillPixelCreateMutationVariables = AdminTypes.Exact<{
  settings: AdminTypes.Scalars['JSON']['input'];
}>;


export type RefillPixelCreateMutation = { webPixelCreate?: AdminTypes.Maybe<{ webPixel?: AdminTypes.Maybe<Pick<AdminTypes.WebPixel, 'id'>>, userErrors: Array<Pick<AdminTypes.ErrorsWebPixelUserError, 'code' | 'field' | 'message'>> }> };

export type RefillPixelUpdateMutationVariables = AdminTypes.Exact<{
  id: AdminTypes.Scalars['ID']['input'];
  settings: AdminTypes.Scalars['JSON']['input'];
}>;


export type RefillPixelUpdateMutation = { webPixelUpdate?: AdminTypes.Maybe<{ webPixel?: AdminTypes.Maybe<Pick<AdminTypes.WebPixel, 'id'>>, userErrors: Array<Pick<AdminTypes.ErrorsWebPixelUserError, 'code' | 'field' | 'message'>> }> };

export type RefillReminderEmailsQueryVariables = AdminTypes.Exact<{
  ids: Array<AdminTypes.Scalars['ID']['input']> | AdminTypes.Scalars['ID']['input'];
}>;


export type RefillReminderEmailsQuery = { nodes: Array<AdminTypes.Maybe<(
    Pick<AdminTypes.Customer, 'id'>
    & { defaultEmailAddress?: AdminTypes.Maybe<Pick<AdminTypes.CustomerEmailAddress, 'emailAddress'>> }
  )>> };

export type RefillOrderQueryVariables = AdminTypes.Exact<{
  id: AdminTypes.Scalars['ID']['input'];
}>;


export type RefillOrderQuery = { order?: AdminTypes.Maybe<(
    Pick<AdminTypes.Order, 'id' | 'processedAt'>
    & { customer?: AdminTypes.Maybe<Pick<AdminTypes.Customer, 'id'>>, purchasingEntity?: AdminTypes.Maybe<{ __typename: 'Customer' | 'PurchasingCompany' }>, refillReminders?: AdminTypes.Maybe<Pick<AdminTypes.Metafield, 'value'>>, lineItems: { nodes: Array<(
        Pick<AdminTypes.LineItem, 'quantity'>
        & { variant?: AdminTypes.Maybe<(
          Pick<AdminTypes.ProductVariant, 'id'>
          & { bagGrams?: AdminTypes.Maybe<Pick<AdminTypes.Metafield, 'value'>>, product: { species?: AdminTypes.Maybe<{ reference?: AdminTypes.Maybe<Pick<AdminTypes.Metaobject, 'handle'>> }>, kcalPerKg?: AdminTypes.Maybe<Pick<AdminTypes.Metafield, 'value'>> } }
        )> }
      )> } }
  )> };

export type ShopOverviewQueryVariables = AdminTypes.Exact<{ [key: string]: never; }>;


export type ShopOverviewQuery = { shop: Pick<AdminTypes.Shop, 'name' | 'myshopifyDomain'>, productsCount?: AdminTypes.Maybe<Pick<AdminTypes.Count, 'count' | 'precision'>>, ingredientDefinition?: AdminTypes.Maybe<Pick<AdminTypes.MetaobjectDefinition, 'name' | 'metaobjectsCount'>> };

interface GeneratedQueryTypes {
  "#graphql\n  query bulkOperationStatus($id: ID!) {\n    bulkOperation(id: $id) {\n      id\n      status\n      errorCode\n      objectCount\n      rootObjectCount\n      url\n      partialDataUrl\n      createdAt\n      completedAt\n    }\n  }\n": {return: BulkOperationStatusQuery, variables: BulkOperationStatusQueryVariables},
  "#graphql\n  query bundlesOverview($kitHandle: String!, $recipeQuery: String!, $treatsHandle: String!) {\n    shopifyFunctions(first: 25) {\n      nodes {\n        id\n        handle\n      }\n    }\n    cartTransforms(first: 5) {\n      nodes {\n        id\n        functionId\n        config: metafield(namespace: \"$app\", key: \"starter-kit-config\") {\n          jsonValue\n        }\n      }\n    }\n    shop {\n      id\n      features {\n        bundles {\n          eligibleForBundles\n        }\n      }\n    }\n    kit: productByIdentifier(identifier: { handle: $kitHandle }) {\n      legacyResourceId\n      status\n      variants(first: 5) {\n        nodes {\n          id\n          requiresComponents\n        }\n      }\n    }\n    recipes: products(first: 25, query: $recipeQuery) {\n      nodes {\n        handle\n        title\n        variants(first: 10) {\n          nodes {\n            id\n            title\n            price\n            bagGrams: metafield(namespace: \"custom\", key: \"bag_grams\") {\n              value\n            }\n          }\n        }\n      }\n    }\n    treats: productByIdentifier(identifier: { handle: $treatsHandle }) {\n      status\n      variants(first: 10) {\n        nodes {\n          id\n          title\n          price\n        }\n      }\n    }\n  }\n": {return: BundlesOverviewQuery, variables: BundlesOverviewQueryVariables},
  "#graphql\n  query checkoutRulesOverview {\n    shopifyFunctions(first: 25) {\n      nodes {\n        id\n        handle\n      }\n    }\n    discountNodes(first: 25, query: \"type:app\") {\n      nodes {\n        id\n        config: metafield(namespace: \"$app\", key: \"refill-reward-config\") {\n          jsonValue\n        }\n        discount {\n          __typename\n          ... on DiscountAutomaticApp {\n            title\n            status\n            appDiscountType {\n              functionId\n            }\n          }\n        }\n      }\n    }\n    validations(first: 25) {\n      nodes {\n        id\n        title\n        enabled\n        shopifyFunction {\n          id\n        }\n        config: metafield(namespace: \"$app\", key: \"order-limit-config\") {\n          jsonValue\n        }\n      }\n    }\n  }\n": {return: CheckoutRulesOverviewQuery, variables: CheckoutRulesOverviewQueryVariables},
  "#graphql\n  query fixCurrentProducts($ids: [ID!]!, $keys: [String!]) {\n    nodes(ids: $ids) {\n      ... on Product {\n        id\n        title\n        handle\n        metafields(first: 20, keys: $keys) {\n          nodes {\n            namespace\n            key\n            value\n            reference {\n              ... on Metaobject {\n                handle\n              }\n            }\n          }\n        }\n      }\n    }\n  }\n": {return: FixCurrentProductsQuery, variables: FixCurrentProductsQueryVariables},
  "#graphql\n  query fixChoiceDefinitions {\n    metafieldDefinitions(first: 50, ownerType: PRODUCT, namespace: \"custom\") {\n      nodes {\n        namespace\n        key\n        validations {\n          name\n          value\n        }\n      }\n    }\n  }\n": {return: FixChoiceDefinitionsQuery, variables: FixChoiceDefinitionsQueryVariables},
  "#graphql\n  query fixKeyEntries {\n    species: metaobjects(type: \"species\", first: 50) {\n      nodes {\n        id\n        handle\n      }\n    }\n    foodType: metaobjects(type: \"food_type\", first: 50) {\n      nodes {\n        id\n        handle\n      }\n    }\n    protein: metaobjects(type: \"protein\", first: 50) {\n      nodes {\n        id\n        handle\n      }\n    }\n  }\n": {return: FixKeyEntriesQuery, variables: FixKeyEntriesQueryVariables},
  "#graphql\n  query b2bCatalogs {\n    catalogs(first: 50, type: COMPANY_LOCATION) {\n      nodes {\n        id\n        status\n        publication {\n          id\n        }\n      }\n    }\n  }\n": {return: B2bCatalogsQuery, variables: B2bCatalogsQueryVariables},
  "#graphql\n  query productHealthData($id: ID!) {\n    product(id: $id) {\n      id\n      title\n      handle\n      status\n      requiresSellingPlan\n      variants(first: 250) {\n        nodes {\n          id\n          title\n          sku\n        }\n      }\n      metafields(first: 250) {\n        nodes {\n          namespace\n          key\n          value\n        }\n      }\n      media(first: 250) {\n        nodes {\n          id\n          alt\n        }\n      }\n      resourcePublicationsV2(first: 250, onlyPublished: true) {\n        nodes {\n          publication {\n            id\n          }\n        }\n      }\n    }\n  }\n": {return: ProductHealthDataQuery, variables: ProductHealthDataQueryVariables},
  "#graphql\n  query hubspotCompanies($after: String) {\n    companies(first: 50, after: $after) {\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n      nodes {\n        id\n        name\n        contacts(first: 50) {\n          nodes {\n            id\n            customer {\n              defaultEmailAddress {\n                emailAddress\n              }\n            }\n          }\n        }\n      }\n    }\n  }\n": {return: HubspotCompaniesQuery, variables: HubspotCompaniesQueryVariables},
  "#graphql\n  query hubspotCompany($id: ID!) {\n    company(id: $id) {\n      id\n      name\n      contacts(first: 50) {\n        nodes {\n          id\n          customer {\n            defaultEmailAddress {\n              emailAddress\n            }\n          }\n        }\n      }\n    }\n  }\n": {return: HubspotCompanyQuery, variables: HubspotCompanyQueryVariables},
  "#graphql\n  query hubspotCompanyOfContact($id: ID!) {\n    companyContact(id: $id) {\n      company {\n        id\n      }\n    }\n  }\n": {return: HubspotCompanyOfContactQuery, variables: HubspotCompanyOfContactQueryVariables},
  "#graphql\n  query refillCustomerDefinitions {\n    metafieldDefinitions(first: 50, ownerType: CUSTOMER, namespace: \"$app\") {\n      nodes {\n        key\n        type {\n          name\n        }\n      }\n    }\n  }\n": {return: RefillCustomerDefinitionsQuery, variables: RefillCustomerDefinitionsQueryVariables},
  "#graphql\n  query refillPixel {\n    webPixel {\n      id\n      settings\n    }\n  }\n": {return: RefillPixelQuery, variables: RefillPixelQueryVariables},
  "#graphql\n  query refillReminderEmails($ids: [ID!]!) {\n    nodes(ids: $ids) {\n      ... on Customer {\n        id\n        defaultEmailAddress {\n          emailAddress\n        }\n      }\n    }\n  }\n": {return: RefillReminderEmailsQuery, variables: RefillReminderEmailsQueryVariables},
  "#graphql\n  query refillOrder($id: ID!) {\n    order(id: $id) {\n      id\n      processedAt\n      customer {\n        id\n      }\n      purchasingEntity {\n        __typename\n      }\n      refillReminders: metafield(namespace: \"$app\", key: \"refill_reminders\") {\n        value\n      }\n      lineItems(first: 100) {\n        nodes {\n          quantity\n          variant {\n            id\n            bagGrams: metafield(namespace: \"custom\", key: \"bag_grams\") {\n              value\n            }\n            product {\n              species: metafield(namespace: \"custom\", key: \"species\") {\n                reference {\n                  ... on Metaobject {\n                    handle\n                  }\n                }\n              }\n              kcalPerKg: metafield(namespace: \"custom\", key: \"kcal_per_kg\") {\n                value\n              }\n            }\n          }\n        }\n      }\n    }\n  }\n": {return: RefillOrderQuery, variables: RefillOrderQueryVariables},
  "#graphql\n  query shopOverview {\n    shop {\n      name\n      myshopifyDomain\n    }\n    productsCount {\n      count\n      precision\n    }\n    ingredientDefinition: metaobjectDefinitionByType(type: \"ingredient\") {\n      name\n      metaobjectsCount\n    }\n  }\n": {return: ShopOverviewQuery, variables: ShopOverviewQueryVariables},
}

interface GeneratedMutationTypes {
  "#graphql\n  mutation runBulkQuery($query: String!) {\n    bulkOperationRunQuery(query: $query) {\n      bulkOperation {\n        id\n        status\n        createdAt\n      }\n      userErrors {\n        field\n        message\n        code\n      }\n    }\n  }\n": {return: RunBulkQueryMutation, variables: RunBulkQueryMutationVariables},
  "#graphql\n  mutation stageBulkVariables {\n    stagedUploadsCreate(\n      input: {\n        resource: BULK_MUTATION_VARIABLES\n        filename: \"variables.jsonl\"\n        mimeType: \"text/jsonl\"\n        httpMethod: POST\n      }\n    ) {\n      stagedTargets {\n        url\n        parameters {\n          name\n          value\n        }\n      }\n      userErrors {\n        field\n        message\n      }\n    }\n  }\n": {return: StageBulkVariablesMutation, variables: StageBulkVariablesMutationVariables},
  "#graphql\n  mutation runBulkMutation($mutation: String!, $stagedUploadPath: String!) {\n    bulkOperationRunMutation(mutation: $mutation, stagedUploadPath: $stagedUploadPath) {\n      bulkOperation {\n        id\n        status\n        createdAt\n      }\n      userErrors {\n        field\n        message\n        code\n      }\n    }\n  }\n": {return: RunBulkMutationMutation, variables: RunBulkMutationMutationVariables},
  "#graphql\n  mutation starterKitTransformCreate($functionHandle: String!, $metafields: [MetafieldInput!]!) {\n    cartTransformCreate(functionHandle: $functionHandle, blockOnFailure: false, metafields: $metafields) {\n      cartTransform {\n        id\n      }\n      userErrors {\n        field\n        message\n        code\n      }\n    }\n  }\n": {return: StarterKitTransformCreateMutation, variables: StarterKitTransformCreateMutationVariables},
  "#graphql\n  mutation starterKitConfigSet($metafields: [MetafieldsSetInput!]!) {\n    metafieldsSet(metafields: $metafields) {\n      metafields {\n        id\n      }\n      userErrors {\n        field\n        message\n        code\n      }\n    }\n  }\n": {return: StarterKitConfigSetMutation, variables: StarterKitConfigSetMutationVariables},
  "#graphql\n  mutation refillRewardCreate($discount: DiscountAutomaticAppInput!) {\n    discountAutomaticAppCreate(automaticAppDiscount: $discount) {\n      automaticAppDiscount {\n        discountId\n      }\n      userErrors {\n        field\n        message\n        code\n      }\n    }\n  }\n": {return: RefillRewardCreateMutation, variables: RefillRewardCreateMutationVariables},
  "#graphql\n  mutation orderLimitCreate($validation: ValidationCreateInput!) {\n    validationCreate(validation: $validation) {\n      validation {\n        id\n      }\n      userErrors {\n        field\n        message\n        code\n      }\n    }\n  }\n": {return: OrderLimitCreateMutation, variables: OrderLimitCreateMutationVariables},
  "#graphql\n  mutation checkoutRuleConfigSet($metafields: [MetafieldsSetInput!]!) {\n    metafieldsSet(metafields: $metafields) {\n      metafields {\n        id\n      }\n      userErrors {\n        field\n        message\n        code\n      }\n    }\n  }\n": {return: CheckoutRuleConfigSetMutation, variables: CheckoutRuleConfigSetMutationVariables},
  "#graphql\n  mutation flowTriggerRefillDue($handle: String!, $payload: JSON!) {\n    flowTriggerReceive(handle: $handle, payload: $payload) {\n      userErrors {\n        field\n        message\n      }\n    }\n  }\n": {return: FlowTriggerRefillDueMutation, variables: FlowTriggerRefillDueMutationVariables},
  "#graphql\n  mutation refillMetafieldsSet($metafields: [MetafieldsSetInput!]!) {\n    metafieldsSet(metafields: $metafields) {\n      metafields {\n        key\n      }\n      userErrors {\n        field\n        message\n      }\n    }\n  }\n": {return: RefillMetafieldsSetMutation, variables: RefillMetafieldsSetMutationVariables},
  "#graphql\n  mutation refillPixelCreate($settings: JSON!) {\n    webPixelCreate(webPixel: { settings: $settings }) {\n      webPixel {\n        id\n      }\n      userErrors {\n        code\n        field\n        message\n      }\n    }\n  }\n": {return: RefillPixelCreateMutation, variables: RefillPixelCreateMutationVariables},
  "#graphql\n  mutation refillPixelUpdate($id: ID!, $settings: JSON!) {\n    webPixelUpdate(id: $id, webPixel: { settings: $settings }) {\n      webPixel {\n        id\n      }\n      userErrors {\n        code\n        field\n        message\n      }\n    }\n  }\n": {return: RefillPixelUpdateMutation, variables: RefillPixelUpdateMutationVariables},
}
declare module '@shopify/admin-api-client' {
  type InputMaybe<T> = AdminTypes.InputMaybe<T>;
  interface AdminQueries extends GeneratedQueryTypes {}
  interface AdminMutations extends GeneratedMutationTypes {}
}
