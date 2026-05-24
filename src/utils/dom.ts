import { ErrorCode, RuntimeError } from './error-handler';

type ElementConstructor<T extends Element> = abstract new () => T;

export const queryRequiredElement = <T extends Element>(
  selector: string,
  constructor: ElementConstructor<T>
): T => {
  const element = document.querySelector(selector);
  if (!(element instanceof constructor)) {
    throw new RuntimeError(
      ErrorCode.DOM_ELEMENT_MISSING,
      `Missing required DOM element: ${selector}`,
      {
        details: {
          expectedType: constructor.name,
          selector,
        },
      }
    );
  }

  return element;
};
