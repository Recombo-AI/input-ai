import jsonata from "jsonata";
import { StreamingContainer } from "./streamingContainer";

interface InputAITexts {
	modalTitle: string;
	promptPlaceholder: string;
}

interface ApiOptions {
	url: string;
	headers: Record<string, string>;
	body: Record<string, string | number | boolean | object>;
	responseExpression: string;
	debounceTime: number;
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

interface InputAIOptions {
	modalTemplate?: string;
	actionsTemplate?: string;
	api?: Partial<ApiOptions>;
	expressionEvaluator?: (
		expression: string,
		context: {
			[elementName: string]: FormElementValue;
		},
	) => Promise<string>;
	evaluatorContext?: () => {
		[elementName: string]: FormElementValue;
	};
	system?: string;
	prompt?: string;
	text?: Partial<InputAITexts>;
}

interface InputAIControls {
	modal: HTMLElement;
	close: HTMLElement | null;
	userInput: HTMLTextAreaElement | null;
	responseContainer: HTMLElement | null;
	response: HTMLElement | null;
	submit: HTMLButtonElement | null;
	stop: HTMLButtonElement | null;
	error: HTMLElement | null;
	accept: HTMLElement | null;
	reject: HTMLElement | null;
}

class InputAI {
	inputElement: HTMLInputElement | HTMLTextAreaElement;
	options: Required<InputAIOptions> & {
		api: Required<ApiOptions>;
		text: Required<InputAITexts>;
	};
	private controller: AbortController | null;
	private controls: Partial<InputAIControls>;
	private isGenerating: boolean;

	constructor(
		inputElement: HTMLInputElement | HTMLTextAreaElement,
		options: InputAIOptions = {},
	) {
		const defaultTexts: InputAITexts = {
			modalTitle: "Input AI",
			promptPlaceholder: "What do you want to ask?",
		};

		const defaults = {
			modalTemplate: this.defaultModalTemplate(defaultTexts),
			actionsTemplate: this.defaultResponseActionsTemplate(defaultTexts),
			api: {
				url: this.getApiUrl(inputElement),
				headers: this.defaultApiHeaders(),
				body: this.defaultApiBody(),
				responseExpression: this.getApiResponseExpression(inputElement),
				debounceTime: 300,
			},
			expressionEvaluator: this.defaultExpressionEvaluator.bind(this),
			evaluatorContext: this.defaultEvaluatorContext.bind(this),
			system: inputElement.dataset.inputAiSystem ?? "",
			prompt: inputElement.dataset.inputAiPrompt ?? "{{userInput.value}}",
			text: defaultTexts,
		};

		this.inputElement = inputElement;

		this.options = {
			...defaults,
			...options,
			api: {
				...defaults.api,
				...(options.api || {}),
			},
			text: {
				...defaults.text,
				...(options.text || {}),
			},
		};

		this.controller = null;
		this.controls = {};
		this.isGenerating = false;
		this.#init();
	}

	defaultModalTemplate(text: InputAITexts): string {
		return `
      <div class="input-ai--modal-content">
        <div class="input-ai--modal-header">
          <h3 class="input-ai--modal-title">${text.modalTitle}</h3>
          <button class="input-ai--modal-close">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

				<div class="input-ai--user-input-container">
					<textarea name="userInput" class="input-ai--user-input" rows="3" placeholder="${text.promptPlaceholder}"></textarea>

					<div class="input-ai--user-input-actions">
						<button class="input-ai--submit-prompt">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" d="m15 11.25-3-3m0 0-3 3m3-3v7.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
							</svg>
						</button>
						<button class="input-ai--stop-prompt input-ai--d-none">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" d="M5.25 7.5A2.25 2.25 0 0 1 7.5 5.25h9a2.25 2.25 0 0 1 2.25 2.25v9a2.25 2.25 0 0 1-2.25 2.25h-9a2.25 2.25 0 0 1-2.25-2.25v-9Z" />
							</svg>
						</button>
					</div>
				</div>

        <div class="input-ai--prompt-response-container">
          <div class="input-ai--prompt-response"></div>
          <div class="input-ai--prompt-response-error"></div>
        </div>
      </div>
    `;
	}

	defaultResponseActionsTemplate(text: InputAITexts): string {
		return `
      <button class="input-ai--accept-pre" title="Paste to input">
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" d="m7.49 12-3.75 3.75m0 0 3.75 3.75m-3.75-3.75h16.5V4.499" />
				</svg>
			</button>
      <button class="input-ai--copy-pre" title="Copy to clipboard">
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" d="M8.25 7.5V6.108c0-1.135.845-2.098 1.976-2.192.373-.03.748-.057 1.123-.08M15.75 18H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08M15.75 18.75v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5A3.375 3.375 0 0 0 6.375 7.5H5.25m11.9-3.664A2.251 2.251 0 0 0 15 2.25h-1.5a2.251 2.251 0 0 0-2.15 1.586m5.8 0c.065.21.1.433.1.664v.75h-6V4.5c0-.231.035-.454.1-.664M6.75 7.5H4.875c-.621 0-1.125.504-1.125 1.125v12c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V16.5a9 9 0 0 0-9-9Z" />
				</svg>
			</button>
    `;
	}

	getApiUrl(inputElement: HTMLInputElement | HTMLTextAreaElement): string {
		if (inputElement.dataset.inputAiUrl) {
			return inputElement.dataset.inputAiUrl;
		}

		const metaElement = document.querySelector('meta[name="input-ai-url"]');
		if (metaElement) {
			return (metaElement as HTMLMetaElement).content;
		}

		return "";
	}

	getApiResponseExpression(
		inputElement: HTMLInputElement | HTMLTextAreaElement,
	): string {
		if (inputElement.dataset.inputAiResponseExpression) {
			return inputElement.dataset.inputAiResponseExpression;
		}

		const metaElement = document.querySelector(
			'meta[name="input-ai-api-response-expression"]',
		);
		if (metaElement) {
			return (metaElement as HTMLMetaElement).content;
		}

		return "";
	}

	addActionsHandler(actions: HTMLElement, outputTag: HTMLElement): void {
		const acceptButton = actions.querySelector(".input-ai--accept-pre");
		if (acceptButton) {
			acceptButton.addEventListener("click", (e) =>
				this.#handleAcceptOutput(e, outputTag),
			);
		}

		const copyButton = actions.querySelector(".input-ai--copy-pre");
		if (copyButton) {
			copyButton.addEventListener("click", (e) =>
				this.#handleCopyOutput(e, outputTag),
			);
		}
	}

	defaultApiHeaders(): Record<string, string> {
		return {
			"Content-Type": "application/json",
		};
	}

	defaultApiBody(): Record<string, string | number | boolean | object> {
		return {
			system: "{{system}}",
			prompt: "{{prompt}}",
		};
	}

	buildApiBody(system: string, prompt: string): string {
		const newBody = { ...this.options.api.body };

		return JSON.stringify(newBody)
			.replace(/{{system}}/g, system)
			.replace(/{{prompt}}/g, prompt);
	}

	defaultEvaluatorContext() {
		let formFields: NodeListOf<
			HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
		>;
		const context: Record<
			string,
			{
				value: string | boolean | number | null;
				label?: string;
				all: FormElementOption[];
			}
		> = {};

		const formElement = this.inputElement.closest("form");
		if (formElement) {
			formFields = formElement.querySelectorAll<
				HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
			>("input, select, textarea");
		} else {
			formFields = document.querySelectorAll<
				HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
			>("input, select, textarea");
		}

		for (const field of Array.from(formFields)) {
			if (!field.name) continue;

			const name = field.name;
			if (!context[name]) {
				context[name] = { value: null, all: [] };
			}

			switch (field.type) {
				case "radio":
				case "checkbox": {
					const inputField = field as HTMLInputElement;
					if (inputField.checked) {
						context[name].value = inputField.value;
						context[name].label = inputField.labels?.[0]?.textContent || "";
					}

					context[name].all.push({
						value: inputField.value,
						label: inputField.labels?.[0]?.textContent || "",
					});
					break;
				}

				case "select-one": {
					const selectField = field as HTMLSelectElement;
					context[name].value = selectField.value;
					context[name].label =
						selectField.options[selectField.selectedIndex]?.textContent || "";

					for (const option of Array.from(selectField.options)) {
						context[name].all.push({
							value: option.value,
							label: option.textContent || "",
						});
					}
					break;
				}

				case "select-multiple": {
					const multiSelectField = field as HTMLSelectElement;
					context[name].value = Array.from(multiSelectField.selectedOptions)
						.map((option) => option.value)
						.join(", ");
					context[name].label = Array.from(multiSelectField.selectedOptions)
						.map((option) => option.textContent)
						.join(", ");

					for (const option of Array.from(multiSelectField.options)) {
						context[name].all.push({
							value: option.value,
							label: option.textContent || "",
						});
					}
					break;
				}

				case "password":
				case "file": {
					context[name].value = "";
					break;
				}

				default: {
					context[name].value = field.value;
					context[name].label = field.labels?.[0]?.textContent || "";
				}
			}
		}

		return context;
	}

	get evaluatorContext() {
		return this.options.evaluatorContext();
	}

	evaluate(
		expression: string,
		context = this.evaluatorContext,
	): Promise<string> {
		return this.options.expressionEvaluator(expression, context);
	}

	async defaultExpressionEvaluator(
		expression: string,
		context: { [elementName: string]: FormElementValue },
	): Promise<string> {
		return await jsonata(expression).evaluate(context);
	}

	addActionBar(outputTag: HTMLElement): void {
		const parentDiv = document.createElement("div");
		parentDiv.classList.add("input-ai--pre-tag-container");

		const responseActions = document.createElement("div");
		responseActions.innerHTML = this.options.actionsTemplate;
		responseActions.classList.add("input-ai--pre-tag-actions");

		const actions = responseActions.cloneNode(true) as HTMLElement;
		outputTag.parentNode?.insertBefore(parentDiv, outputTag);
		parentDiv.appendChild(outputTag);
		parentDiv.appendChild(actions);

		this.addActionsHandler(actions, outputTag);
	}

	#init(): void {
		this.#addAiButton();
		this.#addGlobalListeners();
	}

	#addAiButton(): void {
		const primaryButton = document.createElement("button");
		primaryButton.type = "button";
		primaryButton.className = "input-ai--primary-button";
		primaryButton.innerHTML = this.primaryButtonSvg;

		const wrapper = document.createElement("span");
		wrapper.className = "input-ai--wrapper";

		const buttonWrapper = document.createElement("span");
		buttonWrapper.className = "input-ai--button-wrapper";
		buttonWrapper.appendChild(primaryButton);
		wrapper.appendChild(buttonWrapper);

		const parent = this.inputElement.parentElement;
		if (parent) {
			parent.insertBefore(wrapper, this.inputElement);
			wrapper.appendChild(this.inputElement);
		}

		primaryButton.addEventListener("click", () => this.#showModal());
	}

	get primaryButtonSvg(): string {
		return `
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
      </svg>
    `;
	}

	#addGlobalListeners(): void {
		document.addEventListener("keydown", (e) => {
			if (e.key === "Escape") {
				const modal = document.querySelector(".input-ai--modal");
				if (modal) this.#removeModal(modal as HTMLElement);
			}
		});
	}

	#showModal(): void {
		const modal = document.createElement("div");
		modal.classList.add("input-ai--modal");
		modal.innerHTML = this.options.modalTemplate;
		document.body.appendChild(modal);
		this.#setupModalControls(modal);
	}

	#setupModalControls(modal: HTMLElement): void {
		this.controls = {
			modal,
			close: modal.querySelector<HTMLElement>(".input-ai--modal-close"),
			userInput: modal.querySelector<HTMLTextAreaElement>(
				".input-ai--user-input",
			),
			responseContainer: modal.querySelector<HTMLElement>(
				".input-ai--prompt-response-container",
			),
			response: modal.querySelector<HTMLElement>(".input-ai--prompt-response"),
			submit: modal.querySelector<HTMLButtonElement>(
				".input-ai--submit-prompt",
			),
			stop: modal.querySelector<HTMLButtonElement>(".input-ai--stop-prompt"),
			error: modal.querySelector<HTMLElement>(
				".input-ai--prompt-response-error",
			),
		};

		const debouncedSubmit = this.#debounce(
			() => this.#handleSubmit(),
			this.options.api.debounceTime,
		);

		if (this.controls.userInput) {
			this.controls.userInput.focus();
		}

		if (this.controls.submit) {
			this.controls.submit.addEventListener("click", debouncedSubmit);
		}

		if (this.controls.stop) {
			this.controls.stop.addEventListener("click", () => this.#handleStop());
		}

		if (this.controls.close) {
			this.controls.close.addEventListener("click", () =>
				this.#removeModal(modal),
			);
		}
	}

	async #handleSubmit(): Promise<void> {
		if (this.isGenerating) return;
		if (
			!this.controls.userInput ||
			!this.controls.submit ||
			!this.controls.stop ||
			!this.controls.error ||
			!this.controls.response
		) {
			throw new Error("InputAI: Modal controls are not defined");
		}

		this.isGenerating = true;
		this.controller = new AbortController();
		this.controls.error.textContent = "";
		this.controls.response.textContent = "";
		this.controls.stop.classList.remove("input-ai--d-none");
		this.controls.submit.classList.add("input-ai--d-none");

		const evaluatorContext = this.options.evaluatorContext();
		evaluatorContext.userInput = {
			value: this.controls.userInput.value,
			all: [],
		};

		const system = await this.#evaluateVariables(
			this.options.system,
			evaluatorContext,
		);
		const prompt = await this.#evaluateVariables(
			this.options.prompt,
			evaluatorContext,
		);

		try {
			if (!this.options.api.url) {
				throw new Error("InputAI: API URL is not defined");
			}

			const response = await fetch(this.options.api.url, {
				method: "POST",
				headers: this.options.api.headers,
				body: this.buildApiBody(system, prompt),
				signal: this.controller.signal,
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.message || "An error occurred");
			}

			await this.#handleStreamResponse(response);
		} catch (error: unknown) {
			if (error instanceof Error && error.name !== "AbortError") {
				this.controls.error.textContent = error.message;
			}
		} finally {
			this.#cleanupGeneration();
		}
	}

	async #handleStreamResponse(response: Response): Promise<void> {
		if (
			!this.controls.response ||
			!this.controls.responseContainer ||
			!this.controls.stop ||
			!this.controls.submit
		) {
			return;
		}

		const streamer = new StreamingContainer(this.controls.response);
		streamer.onTagAdded("pre", this.addActionBar.bind(this));

		const reader = response.body?.getReader();
		if (!reader) return;

		const decoder = new TextDecoder();
		this.controls.responseContainer.classList.remove("input-ai--d-none");

		while (true) {
			const { done, value } = await reader.read();
			let chunk = decoder.decode(value, { stream: true });

			if (this.options.api.responseExpression && chunk) {
				chunk = await this.#evaluateVariables(
					this.options.api.responseExpression,
					JSON.parse(chunk.replace("data: ", "")),
				);
			}

			if (done) {
				if (this.controls.stop && this.controls.submit) {
					this.controls.stop.classList.add("input-ai--d-none");
					this.controls.submit.classList.remove("input-ai--d-none");
				}

				break;
			}

			streamer.addChunk(chunk);

			if (this.controls.response) {
				this.controls.response.scroll({
					top: this.controls.response.scrollHeight,
					behavior: "smooth",
				});
			}
		}
	}

	#handleStop(): void {
		this.controller?.abort();
		this.#cleanupGeneration();
	}

	#cleanupGeneration(): void {
		this.isGenerating = false;
		this.controller = null;

		if (this.controls.stop) {
			this.controls.stop.classList.add("input-ai--d-none");
		}

		if (this.controls.submit) {
			this.controls.submit.classList.remove("input-ai--d-none");
		}
	}

	#handleAcceptOutput(e: Event, outputTag: HTMLElement): void {
		e.preventDefault();

		this.inputElement.value = outputTag.textContent || "";
		this.inputElement.focus();

		const modal = document.querySelector(".input-ai--modal");
		if (modal) {
			this.#removeModal(modal as HTMLElement);
		}
	}

	#handleCopyOutput(e: Event, outputTag: HTMLElement): void {
		e.preventDefault();
		if (outputTag.textContent) {
			navigator.clipboard.writeText(outputTag.textContent);
		}

		const target = e.target as HTMLElement;
		target.innerHTML = `
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
				</svg>
			`;

		setTimeout(() => {
			target.innerHTML = `
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" d="M8.25 7.5V6.108c0-1.135.845-2.098 1.976-2.192.373-.03.748-.057 1.123-.08M15.75 18H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08M15.75 18.75v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5A3.375 3.375 0 0 0 6.375 7.5H5.25m11.9-3.664A2.251 2.251 0 0 0 15 2.25h-1.5a2.251 2.251 0 0 0-2.15 1.586m5.8 0c.065.21.1.433.1.664v.75h-6V4.5c0-.231.035-.454.1-.664M6.75 7.5H4.875c-.621 0-1.125.504-1.125 1.125v12c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V16.5a9 9 0 0 0-9-9Z" />
				</svg>
			`;
		}, 2000);
	}

	#removeModal(modal: HTMLElement): void {
		modal.remove();
		this.controller?.abort();
		this.isGenerating = false;
	}

	async #evaluateVariables(
		text: string,
		context: { [elementName: string]: FormElementValue },
	): Promise<string> {
		let replacedText = text;
		const regex = /{{(.*?)}}/g;
		const matches = text.match(regex);

		if (!matches) return replacedText;

		for (const match of matches) {
			const expression = match.slice(2, -2);
			const result = await this.evaluate(expression, context);

			if (result) {
				replacedText = replacedText.replace(match, result);
			}
		}

		return replacedText;
	}

	#debounce<T extends (...args: unknown[]) => unknown>(
		fn: T,
		delay: number,
	): (...args: Parameters<T>) => void {
		let timeout: number | undefined;
		return (...args: Parameters<T>): void => {
			clearTimeout(timeout);
			timeout = window.setTimeout(() => fn.apply(this, args), delay);
		};
	}
}

export { InputAI };
