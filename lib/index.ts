import { InputAI } from "./inputAi";

interface Texts {
	modalTitle: string;
	promptPlaceholder: string;
}

interface Templates {
	modal: string;
	primaryButton: string;
	preTagActions: string;
}

interface ApiOptions {
	url: string;
	headers: Record<string, string>;
	body: Record<string, string | number | boolean | object>;
	debounceTime: number;
	responseExpression?: string;
	errorExpression?: string;
}

interface FormElementOption {
	value: string;
	label: string;
}

interface FormElementValue {
	value: string | number | boolean | null;
	label?: string;
	all: FormElementOption[];
}

type ContextValue = FormElementValue | string | object[];
type Context = { [elementName: string]: ContextValue };

interface Controls {
	modal: HTMLDialogElement;
	close: HTMLButtonElement;
	promptForm: HTMLFormElement;
	promptInput: HTMLTextAreaElement;
	responseContainer: HTMLDivElement;
	submit: HTMLButtonElement;
	stop: HTMLButtonElement;
}

interface PartialApiOptions extends Partial<ApiOptions> {}
interface PartialTemplates extends Partial<Templates> {}
interface PartialTexts extends Partial<Texts> {}

interface InputAIOptions {
	api?: PartialApiOptions;
	template?: PartialTemplates;
	text?: PartialTexts;
	expressionEvaluator?: (expression: string, context: Context) => Promise<string>;
	evaluatorContext?: () => Context;
	systemInstructions?: string;
	systemInstructionsForHTML?: string;
	userMessage?: object;
	assistantMessage?: object;
}

const instances = new WeakMap<HTMLElement, InputAI>();
const globalOptions: InputAIOptions = {};

/**
 * Configure global options for all InputAI instances
 * @param options InputAIOptions
 * @returns void
 * @example
 * ```ts
 * import { configureInputAI } from "inputai";
 * configureInputAI({
 *   api: {
 *     url: "https://api.example.com",
 *     headers: {
 *       "X-CSRF-Token": "{{csrftoken.value}}",
 *     },
 *     body: {
 *       messages: "{{messages}}",
 *       system: "{{systemInstructions}}",
 *       max_tokens: 1000,
 *      },
 * })
 */
function configureInputAI(options: InputAIOptions | null = null): void {
	if (options === null) {
		for (const key of Object.keys(globalOptions)) {
			delete globalOptions[key as keyof InputAIOptions];
		}
	} else {
		Object.assign(globalOptions, options);
	}
}
type InputAIElementType = HTMLInputElement | HTMLTextAreaElement;

/**
 * Initialize an InputAI instance or get the existing one for the element
 * @param element The input or textarea element
 * @param options InputAIOptions for this instance
 * @returns The InputAI instance
 * @example
 * ```ts
 * import { inputAI } from "inputai";
 * const subject = document.querySelector("#subject") as HTMLInputElement;
 * const inputAIInstance = inputAI(subject, {
 *   text: {
 *     modalTitle: "Generate Subject Line",
 *     promptPlaceholder: "What is the email about ?",
 *   },
 *   systemInstructions: "You are an expert in email writing. Generate a subject line wrapped in <pre> tag.",
 * });
 */
function inputAI(element: InputAIElementType, options?: InputAIOptions): InputAI {
	if (instances.has(element) && instances.get(element) instanceof InputAI) {
		// biome-ignore lint/style/noNonNullAssertion: This is safe because we check for the instance above
		return instances.get(element)!;
	}

	const mergedOptions = { ...globalOptions, ...options };
	const instance = new InputAI(element, mergedOptions);
	instances.set(element, instance);

	return instance;
}

/**
 * Destroy an InputAI instance and clean up
 * @param element The element whose InputAI instance should be destroyed
 * @returns true if an instance was found and destroyed, false otherwise
 * @example
 * ```ts
 * import { destroyInputAI } from "inputai";
 * const subject = document.querySelector("#subject") as HTMLInputElement;
 * const wasDestroyed = destroyInputAI(subject);
 * if (wasDestroyed) {
 *   console.log("InputAI instance destroyed successfully.");
 * }
 */
function destroyInputAI(element: InputAIElementType): boolean {
	const instance = instances.get(element);
	if (instance) {
		instance.destroy();

		// Remove references
		instances.delete(element);
		return true;
	}
	return false;
}

/**
 * Find and initialize all elements compatible with InputAI
 * @returns void
 */
function initAllInputAIElements(): void {
	// Find all input and textarea elements that are not already initialized
	// 1. Ignore elements that have the data-input-ai attribute
	// 2. Include elements that have any data-input-ai-* attributes
	const inputs: NodeListOf<InputAIElementType> = document.querySelectorAll("input, textarea");

	const aiInputs: InputAIElementType[] = Array.from(inputs).filter((element: InputAIElementType) =>
		Array.from(element.attributes).some((attr: Attr) => attr.name.startsWith("data-input-ai-")),
	);

	for (const aiInput of aiInputs) {
		inputAI(aiInput);
	}
}

declare global {
	interface Window {
		configureInputAI: typeof configureInputAI;
		inputAI: typeof inputAI;
		destroyInputAI: typeof destroyInputAI;
	}
}

(() => {
	window.configureInputAI = configureInputAI;
	window.inputAI = inputAI;
	window.destroyInputAI = destroyInputAI;

	window.addEventListener("DOMContentLoaded", initAllInputAIElements);
})();

export { inputAI, configureInputAI, destroyInputAI, InputAI };
export type {
	ApiOptions,
	PartialApiOptions,
	PartialTemplates,
	PartialTexts,
	Texts,
	Templates,
	ContextValue,
	Context,
	FormElementOption,
	FormElementValue,
	Controls,
	InputAIOptions,
};
