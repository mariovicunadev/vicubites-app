import type {
  CartValidationsGenerateRunInput,
  CartValidationsGenerateRunResult,
  ValidationError,
} from "../generated/api";

export function cartValidationsGenerateRun(input: CartValidationsGenerateRunInput): CartValidationsGenerateRunResult {
  const errors: ValidationError[] = input.cart.lines
    .filter(({ quantity }) => quantity > 1)
    .map(() => ({
      message: "Not possible to order more than one of each",
      target: "$.cart",
    }));

  const operations = [
    {
      validationAdd: {
        errors
      },
    },
  ];

  return { operations };
}