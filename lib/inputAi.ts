import jsonata from "jsonata";
import { HTMLStreamer } from "./htmlStreamer";
import type { ApiOptions, Context, Controls, FormElementValue, InputAIOptions, Templates, Texts } from "./index";
import { MODAL_TEMPLATE, PRE_TAG_ACTIONS_TEMPLATE, PRIMARY_BUTTON_TEMPLATE } from "./templates";

class InputAI {
	inputElement: HTMLInputElement | HTMLTextAreaElement;
	options: Required<{
		api: Required<ApiOptions>;
		template: Required<Templates>;
		text: Required<Texts>;
		systemInstructions: string;
		systemInstructionsForHTML: string;
		userMessage: object;
		assistantMessage: object;
		expressionEvaluator: (expression: string, context: Context) => Promise<string>;
		evaluatorContext: () => Context;
	}>;
	messages: object[] = [];
	controller: AbortController | null = null;
	controls: Controls = {} as Controls;

	private isGenerating = false;

	constructor(inputElement: HTMLInputElement | HTMLTextAreaElement, options: Partial<InputAIOptions> = {}) {
		this.validateInputElement(inputElement);
		this.inputElement = inputElement;
		this.options = this.mergeOptions(options);

		this.setupUI();
		this.addGlobalEventListeners();
	}

	private validateInputElement(inputElement: HTMLInputElement | HTMLTextAreaElement) {
		if (inputElement.dataset.inputAi) {
			throw new Error(`InputAI: Already initialized on ${inputElement.type}[name=${inputElement.name}]`);
		}
	}

	private mergeOptions(options: InputAIOptions) {
		const defaults = {
			template: {
				modal: MODAL_TEMPLATE,
				primaryButton: PRIMARY_BUTTON_TEMPLATE,
				preTagActions: PRE_TAG_ACTIONS_TEMPLATE,
			},
			api: {
				url: this.defaultUrl(),
				headers: this.defaultHeaders(),
				body: this.defaultBody(),
				responseExpression: this.defaultResponseExpression(),
				errorExpression: this.defaultErrorExpression(),
				debounceTime: 300,
			},
			text: {
				modalTitle: this.defaultModalTitle(),
				promptPlaceholder: this.defaultPromptPlaceholder(),
			},
			expressionEvaluator: this.evaluateExpression.bind(this),
			evaluatorContext: this.getFormContext.bind(this),
			systemInstructions: this.defaultSystemInstructions(),
			systemInstructionsForHTML: this.defaultSystemInstructionsForHTML(),
			userMessage: this.defaultUserMessage(),
			assistantMessage: this.defaultAssistantMessage(),
		};

		const mergedOptions = {
			...defaults,
			...options,
			template: {
				...defaults.template,
				...(options.template || {}),
			},
			api: {
				...defaults.api,
				...(options.api || {}),
			},
			text: {
				...defaults.text,
				...(options.text || {}),
			},
		};

		return mergedOptions;
	}

	defaultUrl() {
		if (this.inputElement.dataset.inputAiUrl) {
			return this.inputElement.dataset.inputAiUrl;
		}

		return this.getMetaValue("url");
	}

	defaultHeaders() {
		if (this.inputElement.dataset.inputAiHeaders) {
			return JSON.parse(this.inputElement.dataset.inputAiHeaders.replace(/'/g, '"'));
		}

		return this.getMetaObject("headers") || {};
	}

	defaultBody() {
		if (this.inputElement.dataset.inputAiBody) {
			return JSON.parse(this.inputElement.dataset.inputAiBody.replace(/'/g, '"'));
		}

		return (
			this.getMetaObject("body") || {
				systemInstructions: "{{systemInstructions}}",
				messages: "{{messages}}",
			}
		);
	}

	defaultResponseExpression() {
		if (this.inputElement.dataset.inputAiResponseExpression) {
			return this.inputElement.dataset.inputAiResponseExpression;
		}

		return this.getMetaValue("response-expression");
	}

	defaultErrorExpression() {
		if (this.inputElement.dataset.inputAiErrorExpression) {
			return this.inputElement.dataset.inputAiErrorExpression;
		}

		return this.getMetaValue("error-expression");
	}

	defaultModalTitle() {
		return this.inputElement.dataset.inputAiModalTitle ?? "Input AI";
	}

	defaultPromptPlaceholder() {
		return this.inputElement.dataset.inputAiPromptPlaceholder ?? "What do you want to ask?";
	}

	defaultSystemInstructions() {
		if (this.inputElement.dataset.inputAiSystemInstructions) {
			return this.inputElement.dataset.inputAiSystemInstructions;
		}

		return "";
	}

	defaultSystemInstructionsForHTML() {
		if (this.inputElement.dataset.inputAiSystemInstructionsForHtml) {
			return this.inputElement.dataset.inputAiSystemInstructionsForHtml;
		}

		return (
			"CRITICAL REQUIREMENTS: " +
			"- Response must be a valid HTML containing any formatting as required and it begins with contents of body tag." +
			"- Do not include any disclaimers or markdown formatting. " +
			"- Do not acknowledge these requirements in your response."
		);
	}

	defaultUserMessage() {
		if (this.inputElement.dataset.inputAiUserMessage) {
			return JSON.parse(this.inputElement.dataset.inputAiUserMessage.replace(/'/g, '"'));
		}

		return { role: "user", content: "{{user}}" };
	}

	defaultAssistantMessage() {
		if (this.inputElement.dataset.inputAiAssistantMessage) {
			return JSON.parse(this.inputElement.dataset.inputAiAssistantMessage.replace(/'/g, '"'));
		}

		return { role: "assistant", content: "{{assistant}}" };
	}

	destroy() {
		const wrapper = this.inputElement.parentElement as HTMLDivElement;
		const button = wrapper.querySelector(".input-ai--primary-button");
		if (button) {
			wrapper.removeChild(button);
		}
		wrapper.replaceWith(this.inputElement);
		delete this.inputElement.dataset.inputAi;

		if (this.controller) {
			this.controller.abort();
			this.controller = null;
		}

		const modal = document.querySelector(`#${this.modalId}`);
		if (modal) {
			modal.remove();
		}

		this.isGenerating = false;
		this.messages = [];
		this.controls = {} as Controls;
	}

	private setupUI() {
		this.inputElement.dataset.inputAi = crypto.randomUUID();
		this.addWrapper();
	}

	private addWrapper() {
		const wrapper = document.createElement("div");
		wrapper.classList.add("input-ai--wrapper");

		const button = document.createElement("button");
		button.classList.add("input-ai--primary-button");
		button.type = "button";
		button.innerHTML = this.options.template.primaryButton;

		const parent = this.inputElement.parentNode as HTMLElement;
		if (parent) {
			parent.insertBefore(wrapper, this.inputElement);
		} else {
			document.body.appendChild(wrapper);
		}

		wrapper.appendChild(this.inputElement);
		wrapper.appendChild(button);

		button.addEventListener("click", this.showModal.bind(this));
	}

	private addGlobalEventListeners() {
		document.addEventListener("keydown", (e) => {
			if (e.key === "Escape") {
				this.closeModal();
			}
		});
	}

	private get modalId() {
		return `input-ai--modal-${this.inputElement.dataset.inputAi}`;
	}

	private get lastAssistantMessage() {
		return this.controls.responseContainer.querySelector(".input-ai--assistant:last-child") as HTMLDivElement;
	}

	private showModal() {
		let modal = document.querySelector(`#${this.modalId}`) as HTMLDialogElement;
		if (!modal) {
			modal = this.createModal();
			document.body.appendChild(modal);
		}

		modal.showModal();
		this.controls.promptInput.focus();
	}

	private createModal() {
		const modal = document.createElement("dialog");
		modal.id = this.modalId;
		modal.classList.add("input-ai--modal");

		modal.innerHTML = this.options.template.modal
			.replace(/{{\s*modalTitle\s*}}/g, this.options.text.modalTitle)
			.replace(/{{\s*promptPlaceholder\s*}}/g, this.options.text.promptPlaceholder);

		this.setupModalControls(modal);
		this.configureModalInteractions();

		return modal;
	}

	private setupModalControls(modal: HTMLDialogElement) {
		this.controls = {
			modal,
			close: modal.querySelector(".input-ai--modal-close") as HTMLButtonElement,
			promptForm: modal.querySelector(".input-ai--user-input-form") as HTMLFormElement,
			promptInput: modal.querySelector(".input-ai--user-input") as HTMLTextAreaElement,
			responseContainer: modal.querySelector(".input-ai--prompt-response-container") as HTMLDivElement,
			submit: modal.querySelector(".input-ai--submit-prompt") as HTMLButtonElement,
			stop: modal.querySelector(".input-ai--stop-prompt") as HTMLButtonElement,
		};
	}

	private configureModalInteractions() {
		this.controls.promptForm.addEventListener("submit", this.debouncedSubmit.bind(this));
		this.controls.promptInput.addEventListener("keydown", this.handlePromptInputChange.bind(this));
		this.controls.promptInput.addEventListener("paste", this.handlePromptInputChange.bind(this));
		this.controls.submit.addEventListener("click", this.debouncedSubmit.bind(this));
		this.controls.stop.addEventListener("click", this.stopGeneration.bind(this));
		this.controls.close.addEventListener("click", this.closeModal.bind(this));
	}

	private debouncedSubmit(e: Event) {
		e.preventDefault();
		this.debounce(this.submitPrompt.bind(this), this.options.api.debounceTime)();
	}

	private handlePromptInputChange(e: KeyboardEvent | ClipboardEvent) {
		if (e instanceof KeyboardEvent && e.key === "Enter" && !e.shiftKey) {
			this.debouncedSubmit(e);
			return;
		}
	}

	private async submitPrompt() {
		if (!this.options.api.url) {
			throw new Error("InputAI: API URL is not defined");
		}

		if (this.isGenerating) return;
		const prompt = this.controls.promptInput.value.trim();
		if (prompt === "") return;

		this.startGenerating();
		try {
			const context = this.options.evaluatorContext();
			const response = await fetch(this.options.api.url, {
				method: "POST",
				headers: await this.getResolvedHeaders(context),
				body: await this.getRequestBody(prompt, context),
				signal: this.controller?.signal,
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.message || "An error occurred while fetching the response");
			}

			this.controls.promptInput.value = "";
			await this.processStreamResponse(response);
		} catch (error: unknown) {
			if (error instanceof Error && error.name !== "AbortError") {
				this.lastAssistantMessage.classList.add("input-ai--assistant-error");
				this.lastAssistantMessage.textContent += `- ${error.message}`;
			}
		} finally {
			this.endGenerating();
		}
	}

	private startGenerating() {
		this.isGenerating = true;
		this.controller = new AbortController();
		this.controls.stop.classList.remove("input-ai--d-none");
		this.controls.submit.classList.add("input-ai--d-none");

		const promptElement = document.createElement("div");
		promptElement.classList.add("input-ai--prompt");
		promptElement.textContent = this.controls.promptInput.value;
		this.controls.responseContainer.appendChild(promptElement);

		const assistantElement = document.createElement("div");
		assistantElement.classList.add("input-ai--assistant");
		this.controls.responseContainer.appendChild(assistantElement);

		promptElement.scrollIntoView({ behavior: "smooth" });

		this.controls.promptInput.focus();
	}

	private endGenerating() {
		if (this.isGenerating === false) return;

		this.isGenerating = false;
		this.controls.stop.classList.add("input-ai--d-none");
		this.controls.submit.classList.remove("input-ai--d-none");
	}

	private async getResolvedHeaders(context: Context) {
		const headers = { ...this.options.api.headers };

		for (const key in headers) {
			headers[key] = await this.replaceVariables(headers[key], context);
		}

		return headers;
	}

	private async getRequestBody(prompt: string, context: Context) {
		const systemInstructions = await this.replaceVariables(
			`${this.options.systemInstructions}\n${this.options.systemInstructionsForHTML}`,
			context,
		);
		await this.pushUserMessage(prompt, context);

		const body = this.deepCopy(this.options.api.body);
		await this.deepReplaceVariables(body, {
			...context,
			systemInstructions,
			messages: this.messages,
		});

		return JSON.stringify(body);
	}

	private async processStreamResponse(response: Response) {
		const reader = response.body?.getReader();
		if (!reader) throw new Error("Response body is not readable");

		const streamer = new HTMLStreamer(this.lastAssistantMessage, reader);

		const responseExpression = this.options.api.responseExpression;
		if (responseExpression) {
			streamer.onSuccessEvent(async (rawChunk) => {
				const jsonChunk = JSON.parse(rawChunk);

				try {
					return await this.replaceVariables(responseExpression, jsonChunk);
				} catch (error) {
					throw new Error(`Unable to parse the chunk with given responseExpression: ${error}`);
				}
			});
		}

		const errorExpression = this.options.api.errorExpression;
		if (errorExpression) {
			streamer.onErrorEvent(async (rawChunk) => {
				const jsonChunk = JSON.parse(rawChunk);

				try {
					return await this.replaceVariables(errorExpression, jsonChunk);
				} catch (error) {
					throw new Error(`Unable to parse the chunk with given errorExpression: ${error}`);
				}
			});
		}

		streamer.onTagAdded("pre", this.addActionBar.bind(this));
		streamer.onComplete(async () => {
			await this.pushAssistantMessage(streamer.dataChunks.join(""));

			this.controls.stop.classList.add("input-ai--d-none");
			this.controls.submit.classList.remove("input-ai--d-none");
		});

		return streamer.start();
	}

	private stopGeneration() {
		this.controller?.abort();
		this.endGenerating();
	}

	private closeModal() {
		this.controls.modal?.close();
		this.stopGeneration();
	}

	public addActionBar(preTag: HTMLElement) {
		const container = document.createElement("div");
		container.classList.add("input-ai--pre-tag-container");
		container.innerHTML = this.options.template.preTagActions;

		preTag.parentNode?.insertBefore(container, preTag);
		container.appendChild(preTag);
		this.setupActionHandlers(container, preTag as HTMLPreElement);
	}

	private setupActionHandlers(container: HTMLElement, preTag: HTMLPreElement) {
		const acceptButton = container.querySelector(".input-ai--accept-pre");
		if (acceptButton) {
			acceptButton.addEventListener("click", (e) => this.insertTextIntoInput(e, preTag));
		}

		const copyButton = container.querySelector(".input-ai--copy-pre");
		if (copyButton) {
			copyButton.addEventListener("click", (e) => this.copyToClipboard(e, preTag));
		}
	}

	private insertTextIntoInput(e: Event, preTag: HTMLElement) {
		e.preventDefault();

		const outputValue = preTag.textContent?.trim() || "";
		this.inputElement.focus();

		if (this.shouldPrependText()) {
			const prependText = `${this.inputElement.value}\n\n${"-".repeat(50)}\n\n`;
			this.inputElement.value = `${prependText}${outputValue}`;
		} else {
			this.inputElement.value = outputValue;
		}

		this.closeModal();
	}

	private shouldPrependText() {
		return this.inputElement.tagName === "TEXTAREA" && this.inputElement.value.length > 0;
	}

	private copyToClipboard(e: Event, preTag: HTMLElement) {
		e.preventDefault();
		if (!preTag.textContent) return;

		navigator.clipboard.writeText(preTag.textContent.trim());

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

	private async pushUserMessage(prompt: string, context: Context) {
		const userMessage = this.deepCopy(this.options.userMessage);
		await this.deepReplaceVariables(userMessage as Record<string, unknown>, {
			...context,
			user: prompt,
		});
		this.messages.push(userMessage);
	}

	private async pushAssistantMessage(message: string) {
		const assistantMessage = this.deepCopy(this.options.assistantMessage);
		await this.deepReplaceVariables(assistantMessage as Record<string, unknown>, {
			assistant: message,
		});
		this.messages.push(assistantMessage);
	}

	private async evaluateExpression(expression: string, context: Context) {
		return await jsonata(expression).evaluate(context);
	}

	private async replaceVariables(text: string, context: Context) {
		let result = text;
		const regex = /{{(.*?)}}/g;
		const matches = text.match(regex);

		if (!matches) return result;

		for (const match of matches) {
			const expression = match.slice(2, -2);
			const evaluated = await this.options.expressionEvaluator(expression, context);

			if (evaluated !== undefined) {
				if (typeof evaluated === "object") {
					// If the evaluated value is an object, we return immediately as we don't combine multiple objects.
					// FIXME: This is a bit of a hack, we should probably handle this better.
					return evaluated;
				}

				result = result.replace(match, evaluated);
			}
		}

		return result;
	}

	private getFormContext() {
		const context: Context = {};
		const formElement = this.inputElement.closest("form");
		const formFields = formElement
			? formElement.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
					"input, select, textarea",
				)
			: document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
					"input, select, textarea",
				);

		for (const field of Array.from(formFields)) {
			if (!field.name) continue;

			if (!context[field.name]) {
				context[field.name] = { value: null, all: [] };
			}

			this.extractFieldValue(field, context[field.name] as FormElementValue);
		}

		return context;
	}

	private extractFieldValue(
		field: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
		contextValue: FormElementValue,
	) {
		switch (field.type) {
			case "radio":
			case "checkbox": {
				const inputField = field as HTMLInputElement;
				if (inputField.checked) {
					contextValue.value = inputField.value;
					contextValue.label = inputField.labels?.[0]?.textContent || "";
				}

				contextValue.all.push({
					value: inputField.value,
					label: inputField.labels?.[0]?.textContent || "",
				});
				break;
			}

			case "select-one": {
				const selectField = field as HTMLSelectElement;
				contextValue.value = selectField.value;
				contextValue.label = selectField.options[selectField.selectedIndex]?.textContent || "";

				for (const option of Array.from(selectField.options)) {
					contextValue.all.push({
						value: option.value,
						label: option.textContent || "",
					});
				}
				break;
			}

			case "select-multiple": {
				const multiSelectField = field as HTMLSelectElement;
				contextValue.value = Array.from(multiSelectField.selectedOptions)
					.map((option) => option.value)
					.join(", ");
				contextValue.label = Array.from(multiSelectField.selectedOptions)
					.map((option) => option.textContent)
					.join(", ");

				for (const option of Array.from(multiSelectField.options)) {
					contextValue.all.push({
						value: option.value,
						label: option.textContent || "",
					});
				}
				break;
			}

			case "password":
			case "file": {
				contextValue.value = "";
				break;
			}

			default: {
				contextValue.value = field.value;
				contextValue.label = field.labels?.[0]?.textContent || "";
			}
		}
	}

	private debounce<T extends (...args: unknown[]) => unknown>(fn: T, delay: number) {
		let timeout: number | undefined;
		return (...args: Parameters<T>) => {
			clearTimeout(timeout);
			timeout = window.setTimeout(() => fn.apply(this, args), delay);
		};
	}

	private getMetaValue(type: string): string {
		const metaElement = document.querySelector(`meta[name="input-ai-${type}"]`);
		return metaElement ? (metaElement as HTMLMetaElement).content : "";
	}

	private getMetaObject(type: string): Record<string, string> | null {
		const metaElement = document.querySelector(`meta[name="input-ai-${type}"]`);
		return metaElement ? JSON.parse((metaElement as HTMLMetaElement).content) : null;
	}

	private deepCopy<T>(obj: T): T {
		return JSON.parse(JSON.stringify(obj));
	}

	private async deepReplaceVariables<T extends Record<string, unknown>>(source: T, context: Context) {
		for (const key in source) {
			if (typeof source[key] === "object") {
				await this.deepReplaceVariables(source[key] as T, context);
			}

			if (typeof source[key] === "string") {
				source[key] = (await this.replaceVariables(source[key], context)) as T[typeof key];
			}
		}
	}
}

export { InputAI, type InputAIOptions };
