import { afterEach, beforeEach, describe, expect, jest, spyOn, test } from "bun:test";
import { InputAI, configureInputAI, destroyInputAI, inputAI } from "../lib";

function mockResponse(chunks: string[]) {
	const mockResponse = new ReadableStream({
		start(controller) {
			for (const chunk of chunks) {
				const encoder = new TextEncoder();
				const encodedChunk = encoder.encode(chunk);
				controller.enqueue(encodedChunk);
			}
			controller.close();
		},
	});

	global.fetch = jest.fn().mockResolvedValue({
		ok: true,
		body: mockResponse,
	});
}

describe("InputAI", () => {
	let inputElement: HTMLTextAreaElement | null;
	let inputAi: InputAI;

	beforeEach(() => {
		document.body.innerHTML = `
      <form>
        <div id="ai-assistant">
          <textarea
						name="content"
						data-input-ai-modal-title="Some expert"
						data-input-ai-prompt-placeholder="Ask me anything"
						data-input-ai-system-instructions="You are a helpful assistant"
						data-input-ai-user-message='{"role": "user", "content": "{{user}}"}'
						data-input-ai-assistant-message='{"role": "assistant", "content": "{{assistant}}"}'
					></textarea>
        </div>
				<input type="text" name="title" value="Test Title">
        <select name="category">
          <option value="tech">Technology</option>
          <option value="health" selected>Health</option>
        </select>
        <input type="radio" name="priority" value="high" id="high">
        <label for="high">High</label>
        <input type="radio" name="priority" value="medium" id="medium" checked>
        <label for="medium">Medium</label>
        <input type="checkbox" name="notify" value="true" id="notify" checked>
        <label for="notify">Notify me</label>
      </form>
    `;

		inputElement = document.querySelector("textarea[name=content]");
		inputAi = inputAI(inputElement as HTMLTextAreaElement, {
			api: {
				url: "https://api.example.com/stream",
				debounceTime: 1,
			},
		});
	});

	afterEach(() => {
		jest.clearAllMocks();
		document.body.innerHTML = "";
	});

	describe("Initialization", () => {
		test("should wrap inputElement", () => {
			const wrapper = document.querySelector(".input-ai--wrapper");
			const primaryButton = document.querySelector(".input-ai--primary-button");

			expect(wrapper).toBeTruthy();
			expect(wrapper?.children.item(0)).toBe(inputElement);
			expect(wrapper?.children.item(1)).toBe(primaryButton);
			expect(wrapper?.parentElement?.id).toBe("ai-assistant");
		});

		test("should initialize with correct options from data attributes", () => {
			expect(inputAi.options.systemInstructions).toBe("You are a helpful assistant");
			expect(inputAi.options.userMessage).toStrictEqual({ role: "user", content: "{{user}}" });
			expect(inputAi.options.assistantMessage).toStrictEqual({ role: "assistant", content: "{{assistant}}" });
		});

		test("should set data-input-ai attribute to random UUID", () => {
			expect(inputElement?.dataset.inputAi).toBeDefined();

			const uuid = inputElement?.dataset.inputAi;
			expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
		});

		test("should throw error when trying to initialize already initialized element", () => {
			expect(() => {
				new InputAI(inputElement as HTMLTextAreaElement);
			}).toThrow("InputAI: Already initialized on textarea[name=content]");
		});

		test("should merge global options with instance options", () => {
			// Clean up existing instance
			const tempTextArea = document.createElement("textarea");
			document.body.appendChild(tempTextArea);

			// Configure global options
			configureInputAI({
				text: {
					modalTitle: "Global Title",
				},
			});

			const instance = inputAI(tempTextArea, {
				api: {
					url: "https://custom.api.example.com",
				},
			});

			expect(instance.options.text.modalTitle).toBe("Global Title");
			expect(instance.options.api.url).toBe("https://custom.api.example.com");

			// Clean up
			configureInputAI();
			destroyInputAI(tempTextArea);
			document.body.removeChild(tempTextArea);
		});

		test("should do nothing destroying an uninitialized element", () => {
			const tempTextArea = document.createElement("textarea");
			document.body.appendChild(tempTextArea);

			const result = destroyInputAI(tempTextArea);
			expect(result).toBe(false);

			// Clean up
			document.body.removeChild(tempTextArea);
		});

		test("should skip already initialized elements", () => {
			const tempTextArea = document.createElement("textarea");
			document.body.appendChild(tempTextArea);

			const instance1 = inputAI(tempTextArea);
			const instance2 = inputAI(tempTextArea);

			expect(instance1).toBe(instance2);

			destroyInputAI(tempTextArea);
			document.body.removeChild(tempTextArea);
		});

		test("should return same instance when inputAI is called multiple times on same element", () => {
			const newTextArea = document.createElement("textarea");
			document.body.appendChild(newTextArea);

			const firstInstance = inputAI(newTextArea);
			const secondInstance = inputAI(newTextArea);

			expect(firstInstance).toBe(secondInstance);

			// Clean up
			destroyInputAI(newTextArea);
			document.body.removeChild(newTextArea);
		});

		test("should abort ongoing request when instance is destroyed", async () => {
			const abortSpy = spyOn(AbortController.prototype, "abort");

			inputAi.controller = new AbortController();
			destroyInputAI(inputElement as HTMLTextAreaElement);

			expect(abortSpy).toHaveBeenCalled();
		});

		test("should allow multiple instances on different elements", () => {
			const anotherTextArea = document.createElement("textarea");
			document.body.appendChild(anotherTextArea);

			const instance2 = inputAI(anotherTextArea, {
				userMessage: {
					role: "user",
					content: "Answer {{user}}",
				},
			});

			expect(instance2).toBeInstanceOf(InputAI);
			expect(instance2).not.toBe(inputAi);
			expect(instance2.options.userMessage).toStrictEqual({ role: "user", content: "Answer {{user}}" });

			const result = destroyInputAI(anotherTextArea);
			expect(result).toBe(true);
			document.body.removeChild(anotherTextArea);
		});

		test("should reset when destroyed", () => {
			const tempTextArea = document.createElement("textarea");
			document.body.appendChild(tempTextArea);

			inputAI(tempTextArea);
			expect(tempTextArea.dataset.inputAi).toBeDefined();
			expect(tempTextArea.parentElement?.tagName).toBe("DIV");
			expect(tempTextArea.parentElement?.classList.contains("input-ai--wrapper")).toBeTruthy();

			destroyInputAI(tempTextArea);
			expect(tempTextArea.dataset.inputAi).toBeUndefined();
			expect(tempTextArea.parentElement?.tagName).toBe("BODY");

			document.body.removeChild(tempTextArea);
		});
	});

	describe("Global Initialization", () => {
		beforeEach(() => {
			document.body.innerHTML = "";
		});

		test("should expose API functions globally", () => {
			expect(window.inputAI).toBeDefined();
			expect(window.configureInputAI).toBeDefined();
			expect(window.destroyInputAI).toBeDefined();
		});

		test("should automatically initialize elements with data-input-ai attributes", () => {
			document.body.innerHTML = `
			<textarea data-input-ai-system-instructions="Helpful assistant"></textarea>
			<input type="text" data-input-ai-prompt="test">
		`;

			window.dispatchEvent(new Event("DOMContentLoaded"));

			const textarea = document.querySelector("textarea");
			const input = document.querySelector("input");

			expect(textarea?.dataset.inputAi).toBeDefined();
			expect(input?.dataset.inputAi).toBeDefined();
		});

		test("should not initialize elements without data-input-ai attributes", () => {
			document.body.innerHTML = `
			<textarea></textarea>
			<input type="text">
		`;

			window.dispatchEvent(new Event("DOMContentLoaded"));

			const textarea = document.querySelector("textarea");
			const input = document.querySelector("input");

			expect(textarea?.dataset.inputAi).toBeUndefined();
			expect(input?.dataset.inputAi).toBeUndefined();
		});

		test("should not reinitialize already initialized elements", () => {
			document.body.innerHTML = `<textarea data-input-ai="${crypto.randomUUID()}"></textarea>`;

			const initSpy = spyOn(window, "inputAI");
			window.dispatchEvent(new Event("DOMContentLoaded"));

			expect(initSpy).not.toHaveBeenCalled();
			initSpy.mockRestore();
		});
	});

	describe("Modal Creation", () => {
		test("should create modal when AI button is clicked", () => {
			const aiButton = document.querySelector(".input-ai--primary-button") as HTMLButtonElement;
			aiButton.click();

			const modal = document.querySelector(".input-ai--modal");
			expect(modal).toBeTruthy();

			const modalTitle = document.querySelector(".input-ai--modal-title");
			expect(modalTitle).toBeTruthy();
			expect(modalTitle?.textContent).toBe("Some expert");

			const modalContent = document.querySelector(".input-ai--modal-content");
			expect(modalContent).toBeTruthy();

			const modalClose = document.querySelector(".input-ai--modal-close");
			expect(modalClose).toBeTruthy();

			const modalInput = document.querySelector(".input-ai--user-input") as HTMLTextAreaElement;
			expect(modalInput).toBeTruthy();
			expect(modalInput.placeholder).toBe("Ask me anything");

			const modalSubmit = document.querySelector(".input-ai--submit-prompt");
			expect(modalSubmit).toBeTruthy();
		});

		test("should not create modal if already created for same inputElement", () => {
			const aiButton = document.querySelector(".input-ai--primary-button") as HTMLButtonElement;
			aiButton.click();

			expect(document.querySelectorAll(".input-ai--modal").length).toBe(1);

			const closeButton = document.querySelector(".input-ai--modal-close") as HTMLButtonElement;
			closeButton.click();

			expect(document.querySelectorAll(".input-ai--modal .input-ai--d-none").length).toBe(1);

			aiButton.click();
			expect(document.querySelectorAll(".input-ai--modal").length).toBe(1);
		});

		test("should close modal when close button is clicked", async () => {
			const aiButton = document.querySelector(".input-ai--primary-button") as HTMLButtonElement;
			aiButton.click();

			const modal = document.querySelector("dialog.input-ai--modal") as HTMLDialogElement;
			expect(modal.attributes.getNamedItem("open")).toBeTruthy();

			const closeButton = document.querySelector(".input-ai--modal-close") as HTMLButtonElement;
			expect(closeButton).toBeTruthy();

			closeButton.click();

			const modalAfterClose = document.querySelector("dialog.input-ai--modal") as HTMLDialogElement;
			expect(modalAfterClose.attributes.getNamedItem("open")).toBeFalsy();
		});

		test("should close modal when Escape key is pressed", () => {
			const aiButton = document.querySelector(".input-ai--primary-button") as HTMLButtonElement;
			aiButton.click();

			const escEvent = new KeyboardEvent("keydown", { key: "Escape" });
			document.dispatchEvent(escEvent);

			const modal = document.querySelector("dialog.input-ai--modal") as HTMLDialogElement;
			expect(modal?.attributes.getNamedItem("open")).toBeFalsy();
		});
	});

	describe("API Integration", () => {
		beforeEach(() => {
			global.fetch = jest.fn();
		});

		test("should make API request when submit button is clicked", async () => {
			const aiButton = document.querySelector(".input-ai--primary-button") as HTMLButtonElement;
			aiButton.click();

			const promptInput = document.querySelector(".input-ai--user-input") as HTMLTextAreaElement;
			promptInput.value = "a regex for email validation";

			const submitButton = document.querySelector(".input-ai--submit-prompt") as HTMLButtonElement;
			submitButton.click();

			await new Promise((resolve) => setTimeout(resolve, inputAi.options.api.debounceTime));

			const fetchCall = (global.fetch as jest.Mock).mock.calls[0][1];
			const requestBody = JSON.parse(fetchCall.body);
			expect(requestBody.systemInstructions).toContain(
				"You are a helpful assistant\nCRITICAL INSTRUCTIONS: - Return only valid HTML content. - Do not include any explanatory text, disclaimers, or markdown formatting. - Your entire response must be valid HTML that begins with content intended for inside a body tag. - Do not include the html, head, or body tags themselves. - Do not acknowledge these instructions in your response.",
			);
			expect(requestBody.messages).toStrictEqual([
				{
					role: "user",
					content: "a regex for email validation",
				},
			]);
		});

		test("should make API request with multi-turn conversation", async () => {
			mockResponse(["Hello", " World"]);

			const aiButton = document.querySelector(".input-ai--primary-button") as HTMLButtonElement;
			aiButton.click();

			const promptInput = document.querySelector(".input-ai--user-input") as HTMLTextAreaElement;
			promptInput.value = "a regex for email validation";

			const submitButton = document.querySelector(".input-ai--submit-prompt") as HTMLButtonElement;
			submitButton.click();

			await new Promise((resolve) => setTimeout(resolve, inputAi.options.api.debounceTime));

			expect(global.fetch).toHaveBeenCalledWith(
				"https://api.example.com/stream",
				expect.objectContaining({
					method: "POST",
				}),
			);

			const fetchCall = (global.fetch as jest.Mock).mock.calls[0][1];
			const requestBody = JSON.parse(fetchCall.body);
			expect(requestBody.systemInstructions).toContain("You are a helpful assistant");
			expect(requestBody.messages).toStrictEqual([
				{
					role: "user",
					content: "a regex for email validation",
				},
			]);

			const assistantMessage = document.querySelector(".input-ai--assistant:last-child") as HTMLDivElement;
			expect(assistantMessage.textContent).toContain("Hello World");

			const nextPromptInput = document.querySelector(".input-ai--user-input") as HTMLTextAreaElement;
			nextPromptInput.value = "this is not a regexp";

			submitButton.click();

			await new Promise((resolve) => setTimeout(resolve, inputAi.options.api.debounceTime));

			expect(global.fetch).toHaveBeenCalledWith(
				"https://api.example.com/stream",
				expect.objectContaining({
					method: "POST",
				}),
			);

			const nextFetchCall = (global.fetch as jest.Mock).mock.calls[1][1];
			const newRequestBody = JSON.parse(nextFetchCall.body);
			expect(newRequestBody.systemInstructions).toContain("You are a helpful assistant");
			expect(newRequestBody.messages).toStrictEqual([
				{
					role: "user",
					content: "a regex for email validation",
				},
				{
					role: "assistant",
					content: "Hello World",
				},
				{
					role: "user",
					content: "this is not a regexp",
				},
			]);
		});

		test("should pass additional headers and parameters to API request", async () => {
			mockResponse(["Hello", " World"]);

			inputAi.options.api.url = "https://gemini.example.com/stream";
			inputAi.options.api.headers = {
				Authorization: "Bearer token",
			};
			inputAi.options.api.body = {
				system_instruction: {
					parts: {
						text: "You are a cat. Your name is Neko. {{systemInstructions}}",
					},
				},
				contents: "{{messages}}",
				generationConfig: {
					maxOutputTokens: 1000,
				},
			};

			inputAi.options.userMessage = {
				parts: [
					{
						text: "Question: {{user}}",
					},
				],
			};

			inputAi.options.assistantMessage = {
				parts: [
					{
						text: "Answer: {{assistant}}",
					},
				],
			};

			const aiButton = document.querySelector(".input-ai--primary-button") as HTMLButtonElement;
			aiButton.click();

			const promptInput = document.querySelector(".input-ai--user-input") as HTMLTextAreaElement;
			promptInput.value = "a regex for email validation";

			const submitButton = document.querySelector(".input-ai--submit-prompt") as HTMLButtonElement;
			submitButton.click();

			await new Promise((resolve) => setTimeout(resolve, inputAi.options.api.debounceTime));

			expect(global.fetch).toHaveBeenCalledWith(
				"https://gemini.example.com/stream",
				expect.objectContaining({
					method: "POST",
					headers: expect.objectContaining({
						Authorization: "Bearer token",
					}),
				}),
			);

			const fetchCall = (global.fetch as jest.Mock).mock.calls[0][1];
			const requestBody = JSON.parse(fetchCall.body);
			expect(requestBody.system_instruction.parts.text).toContain(
				"You are a cat. Your name is Neko. You are a helpful assistant",
			);
			expect(requestBody.contents[0].parts[0].text).toBe("Question: a regex for email validation");
			expect(requestBody.generationConfig.maxOutputTokens).toBe(1000);

			const assistantMessage = document.querySelector(".input-ai--assistant:last-child") as HTMLDivElement;
			expect(assistantMessage.textContent).toContain("Hello World");

			const nextPromptInput = document.querySelector(".input-ai--user-input") as HTMLTextAreaElement;
			nextPromptInput.value = "this is not a regexp";
			submitButton.click();
			await new Promise((resolve) => setTimeout(resolve, inputAi.options.api.debounceTime));

			expect(global.fetch).toHaveBeenCalledWith(
				"https://gemini.example.com/stream",
				expect.objectContaining({
					method: "POST",
					headers: expect.objectContaining({
						Authorization: "Bearer token",
					}),
				}),
			);

			const nextFetchCall = (global.fetch as jest.Mock).mock.calls[1][1];
			const newRequestBody = JSON.parse(nextFetchCall.body);
			expect(newRequestBody.system_instruction.parts.text).toContain(
				"You are a cat. Your name is Neko. You are a helpful assistant",
			);
			expect(newRequestBody.contents[0].parts[0].text).toBe("Question: a regex for email validation");
			expect(newRequestBody.contents[1].parts[0].text).toBe("Answer: Hello World");
			expect(newRequestBody.contents[2].parts[0].text).toBe("Question: this is not a regexp");
		});

		test("should use data attributes for API configuration when present", () => {
			const tempElement = document.createElement("textarea");
			tempElement.setAttribute("data-input-ai-url", "https://api.example.com");
			tempElement.setAttribute(
				"data-input-ai-headers",
				JSON.stringify({
					"Content-Type": "application/json",
					"X-Custom-Header": "CustomValue",
				}),
			);
			tempElement.setAttribute("data-input-ai-response-expression", "{{$join(candidate.text)}}");
			tempElement.setAttribute(
				"data-input-ai-body",
				JSON.stringify({
					system_instruction: {
						parts: {
							text: "You are a cat. Your name is Neko. {{systemInstructions}}",
						},
					},
					contents: "{{messages}}",
					generationConfig: {
						maxOutputTokens: 1000,
					},
				}),
			);
			tempElement.setAttribute("data-input-ai-system-instructions", "You are a helpful assistant");
			tempElement.setAttribute("data-input-ai-user-message", JSON.stringify({ role: "user", content: "{{user}}" }));
			tempElement.setAttribute(
				"data-input-ai-assistant-message",
				JSON.stringify({ role: "assistant", content: "{{assistant}}" }),
			);

			document.body.appendChild(tempElement);
			const instance = inputAI(tempElement);

			expect(instance.options.api.url).toBe("https://api.example.com");
			expect(instance.options.api.headers).toEqual({
				"Content-Type": "application/json",
				"X-Custom-Header": "CustomValue",
			});
			expect(instance.options.api.responseExpression).toBe("{{$join(candidate.text)}}");
			expect(instance.options.api.body).toEqual({
				system_instruction: {
					parts: {
						text: "You are a cat. Your name is Neko. {{systemInstructions}}",
					},
				},
				contents: "{{messages}}",
				generationConfig: {
					maxOutputTokens: 1000,
				},
			});
			expect(instance.options.systemInstructions).toBe("You are a helpful assistant");
			expect(instance.options.userMessage).toStrictEqual({ role: "user", content: "{{user}}" });
			expect(instance.options.assistantMessage).toStrictEqual({
				role: "assistant",
				content: "{{assistant}}",
			});

			destroyInputAI(tempElement);
			document.body.removeChild(tempElement);
		});

		test("should use meta tags for API configuration when data attributes missing", () => {
			const urlMeta = document.createElement("meta");
			urlMeta.name = "input-ai-url";
			urlMeta.content = "https://meta.example.com";
			document.head.appendChild(urlMeta);

			const headersMeta = document.createElement("meta");
			headersMeta.name = "input-ai-headers";
			headersMeta.content = JSON.stringify({
				"Content-Type": "application/json",
				"X-Custom-Header": "CustomValue",
			});
			document.head.appendChild(headersMeta);

			const responseExpressionMeta = document.createElement("meta");
			responseExpressionMeta.name = "input-ai-response-expression";
			responseExpressionMeta.content = "{{$join(candidate.text)}}";
			document.head.appendChild(responseExpressionMeta);

			const bodyMeta = document.createElement("meta");
			bodyMeta.name = "input-ai-body";
			bodyMeta.content = JSON.stringify({
				system_instruction: {
					parts: {
						text: "You are a cat. Your name is Neko. {{systemInstructions}}",
					},
				},
				contents: "{{messages}}",
				generationConfig: {
					maxOutputTokens: 1000,
				},
			});
			document.head.appendChild(bodyMeta);

			const tempElement = document.createElement("textarea");
			const instance = inputAI(tempElement);

			expect(instance.options.api.url).toBe("https://meta.example.com");
			expect(instance.options.api.headers).toEqual({
				"Content-Type": "application/json",
				"X-Custom-Header": "CustomValue",
			});
			expect(instance.options.api.responseExpression).toBe("{{$join(candidate.text)}}");
			expect(instance.options.api.body).toEqual({
				system_instruction: {
					parts: {
						text: "You are a cat. Your name is Neko. {{systemInstructions}}",
					},
				},
				contents: "{{messages}}",
				generationConfig: {
					maxOutputTokens: 1000,
				},
			});

			document.head.removeChild(urlMeta);
			document.head.removeChild(headersMeta);
			document.head.removeChild(responseExpressionMeta);
			document.head.removeChild(bodyMeta);
			destroyInputAI(tempElement);
		});

		test("should use responseExpression when present", async () => {
			mockResponse([
				'data: { "candidate": { "text": "<p>Hello World</p>" } }',
				'data: { "candidate": { "text": "<p>Neko out</p>" } }',
			]);

			inputAi.options.api.responseExpression = "{{$join(candidate.text)}}";

			const aiButton = document.querySelector(".input-ai--primary-button") as HTMLButtonElement;
			aiButton.click();

			const promptInput = document.querySelector(".input-ai--user-input") as HTMLTextAreaElement;
			promptInput.value = "test prompt";

			const submitButton = document.querySelector(".input-ai--submit-prompt") as HTMLButtonElement;
			submitButton.click();

			await new Promise((resolve) => setTimeout(resolve, inputAi.options.api.debounceTime));

			const assistantMessage = document.querySelector(".input-ai--assistant:last-child") as HTMLDivElement;
			expect(assistantMessage.innerHTML).toContain("<p>Hello World</p><p>Neko out</p>");
		});

		test("should replace any form context variables with form data in prompt", async () => {
			inputAi.options.api = {
				url: "https://api.example.com/stream",
				headers: {
					"Content-Type": "application/json",
				},
				body: {
					system_instruction: {
						parts: {
							text: "You are a helpful assistant. {{systemInstructions}}",
						},
					},
					contents: "{{messages}}",
					generationConfig: {
						maxOutputTokens: 1000,
					},
				},
				debounceTime: 1,
				responseExpression: "{{$join(candidate.text)}}",
				errorExpression: "{{$join(message)}}",
			};
			inputAi.options.systemInstructions = "You are an expert in {{category.value}}";
			inputAi.options.userMessage = {
				parts: [
					{
						text: "Given title as {{title.value}}, category as {{category.value}} and priority as {{priority.value}}, answer {{user}}",
					},
				],
			};

			const aiButton = document.querySelector(".input-ai--primary-button") as HTMLButtonElement;
			aiButton.click();

			const promptInput = document.querySelector(".input-ai--user-input") as HTMLTextAreaElement;
			promptInput.value = "test prompt";

			const submitButton = document.querySelector(".input-ai--submit-prompt") as HTMLButtonElement;
			submitButton.click();

			await new Promise((resolve) => setTimeout(resolve, inputAi.options.api.debounceTime));

			const fetchCall = (global.fetch as jest.Mock).mock.calls[0][1];
			const requestBody = JSON.parse(fetchCall.body);
			expect(requestBody.system_instruction.parts.text).toContain(
				"You are a helpful assistant. You are an expert in health",
			);
			expect(requestBody.contents[0].parts[0].text).toBe(
				"Given title as Test Title, category as health and priority as medium, answer test prompt",
			);
			expect(requestBody.generationConfig.maxOutputTokens).toBe(1000);
		});

		test("should handle SSE responses gracefully", async () => {
			mockResponse([
				'event: completion\ndata: {"type": "completion", "completion": "<p>Hello World</p>", "stop_reason": null, "model": "claude-2.0"}',
				'event: completion\ndata: {"type": "completion", "completion": "<p>Neko out</p>", "stop_reason": null, "model": "claude-2.0"}',
				'event: ping\ndata: {"type": "ping"}',
			]);

			inputAi.options.api.responseExpression = "{{$join(completion)}}";

			const aiButton = document.querySelector(".input-ai--primary-button") as HTMLButtonElement;
			aiButton.click();

			const promptInput = document.querySelector(".input-ai--user-input") as HTMLTextAreaElement;
			promptInput.value = "test prompt";

			const submitButton = document.querySelector(".input-ai--submit-prompt") as HTMLButtonElement;
			submitButton.click();

			await new Promise((resolve) => setTimeout(resolve, inputAi.options.api.debounceTime));

			const assistantElement = document.querySelector(".input-ai--assistant:last-child") as HTMLDivElement;
			expect(assistantElement.innerHTML).toContain("<p>Hello World</p><p>Neko out</p>");
		});

		test("should handle SSE errors gracefully", async () => {
			mockResponse([
				'event: completion\ndata: {"type": "completion", "completion": "<p>Hello</p>", "stop_reason": null, "model": "claude-2.0"}',
				'event: error\ndata: {"type": "overloaded_error", "message": "Rate limit exceeded"}',
			]);

			inputAi.options.api.responseExpression = "{{$join(completion)}}";
			inputAi.options.api.errorExpression = "{{$join(message)}}";

			const aiButton = document.querySelector(".input-ai--primary-button") as HTMLButtonElement;
			aiButton.click();

			const promptInput = document.querySelector(".input-ai--user-input") as HTMLTextAreaElement;
			promptInput.value = "test prompt";

			const submitButton = document.querySelector(".input-ai--submit-prompt") as HTMLButtonElement;
			submitButton.click();

			await new Promise((resolve) => setTimeout(resolve, inputAi.options.api.debounceTime));

			const assistantElement = document.querySelector(".input-ai--assistant:last-child") as HTMLDivElement;
			expect(assistantElement?.classList.contains("input-ai--assistant-error")).toBeTruthy();
			expect(assistantElement?.textContent).toEqual("Hello- Rate limit exceeded");
		});

		test("should handle API errors gracefully", async () => {
			(global.fetch as jest.Mock).mockResolvedValueOnce({
				ok: false,
				json: jest.fn().mockResolvedValue({
					message: "API Error: Rate limit exceeded",
				}),
			});

			const aiButton = document.querySelector(".input-ai--primary-button") as HTMLButtonElement;
			aiButton.click();

			const promptInput = document.querySelector(".input-ai--user-input") as HTMLTextAreaElement;
			promptInput.value = "test prompt";

			const submitButton = document.querySelector(".input-ai--submit-prompt") as HTMLButtonElement;
			submitButton.click();

			await new Promise((resolve) => setTimeout(resolve, inputAi.options.api.debounceTime));

			const assistantElement = document.querySelector(".input-ai--assistant:last-child") as HTMLDivElement;
			expect(assistantElement?.classList.contains("input-ai--assistant-error")).toBeTruthy();
			expect(assistantElement?.textContent).toEqual("- API Error: Rate limit exceeded");
		});

		test("should cancel API request when stop button is clicked", async () => {
			const originalController = inputAi.controller;

			inputAi.controller = new AbortController();
			spyOn(inputAi.controller, "abort");

			(global.fetch as jest.Mock).mockResolvedValueOnce({
				ok: false,
				json: jest.fn().mockResolvedValue({
					message: "API Error: Rate limit exceeded",
				}),
			});

			const aiButton = document.querySelector(".input-ai--primary-button") as HTMLButtonElement;
			aiButton.click();

			const promptInput = document.querySelector(".input-ai--user-input") as HTMLTextAreaElement;
			promptInput.value = "test prompt";

			const submitButton = document.querySelector(".input-ai--submit-prompt") as HTMLButtonElement;
			submitButton.click();

			await new Promise((resolve) => setTimeout(resolve, inputAi.options.api.debounceTime / 2));

			const stopButton = document.querySelector(".input-ai--stop-prompt") as HTMLButtonElement;
			stopButton.click();

			expect(inputAi.controller?.abort).toHaveBeenCalled();
			expect(submitButton.classList.contains("input-ai--d-none")).toBeFalsy();
			expect(stopButton.classList.contains("input-ai--d-none")).toBeTruthy();

			await new Promise((resolve) => setTimeout(resolve, inputAi.options.api.debounceTime / 2));
			inputAi.controller = originalController;
		});

		test("should debounce multiple rapid API requests", async () => {
			mockResponse(["Hello", " World"]);
			const fetchSpy = spyOn(global, "fetch");

			const aiButton = document.querySelector(".input-ai--primary-button") as HTMLButtonElement;
			aiButton.click();

			expect(fetchSpy.mock.calls.length).toBe(0);

			const promptInput = document.querySelector(".input-ai--user-input") as HTMLTextAreaElement;
			promptInput.value = "test prompt";

			const submitButton = document.querySelector(".input-ai--submit-prompt") as HTMLButtonElement;

			submitButton.click();
			submitButton.click();
			submitButton.click();

			await new Promise((resolve) => setTimeout(resolve, inputAi.options.api.debounceTime));
			expect(fetchSpy.mock.calls.length).toBe(1);
		});
	});

	describe("Response streaming", () => {
		test("should display streaming response in the modal", async () => {
			mockResponse(["Hello", " World"]);

			const aiButton = document.querySelector(".input-ai--primary-button") as HTMLButtonElement;
			aiButton.click();

			const promptInput = document.querySelector(".input-ai--user-input") as HTMLTextAreaElement;
			promptInput.value = "test prompt";

			const submitButton = document.querySelector(".input-ai--submit-prompt") as HTMLButtonElement;
			submitButton.click();

			await new Promise((resolve) => setTimeout(resolve, inputAi.options.api.debounceTime));

			const assistantElement = document.querySelector(".input-ai--assistant:last-child") as HTMLDivElement;
			expect(assistantElement.innerHTML).toContain("Hello World");
		});

		test("should apply content to the original textarea when accept button is clicked", async () => {
			mockResponse(["<pre>const simpleRegex = /abcd/;</pre>", "Neko out"]);

			const aiButton = document.querySelector(".input-ai--primary-button") as HTMLButtonElement;
			aiButton.click();

			const promptInput = document.querySelector(".input-ai--user-input") as HTMLTextAreaElement;
			promptInput.value = "test prompt";

			const submitButton = document.querySelector(".input-ai--submit-prompt") as HTMLButtonElement;
			submitButton.click();

			await new Promise((resolve) => setTimeout(resolve, inputAi.options.api.debounceTime));

			const acceptButton = document.querySelector(".input-ai--accept-pre") as HTMLButtonElement;
			acceptButton.click();

			expect(inputElement?.value).toBe("const simpleRegex = /abcd/;");

			// Check if the modal is closed
			const modal = document.querySelector("dialog.input-ai--modal") as HTMLDialogElement;
			expect(modal.attributes.getNamedItem("open")).toBeFalsy();
		});

		test("should copy content to clipboard when copy button is clicked", async () => {
			spyOn(navigator.clipboard, "writeText");

			mockResponse(["<pre>const simpleRegex = /abcd/;</pre>", "Neko out"]);

			const aiButton = document.querySelector(".input-ai--primary-button") as HTMLButtonElement;
			aiButton.click();

			const promptInput = document.querySelector(".input-ai--user-input") as HTMLTextAreaElement;
			promptInput.value = "test prompt";

			const submitButton = document.querySelector(".input-ai--submit-prompt") as HTMLButtonElement;
			submitButton.click();

			await new Promise((resolve) => setTimeout(resolve, inputAi.options.api.debounceTime));

			const copyButton = document.querySelector(".input-ai--copy-pre") as HTMLButtonElement;
			copyButton.click();

			expect(navigator.clipboard.writeText).toHaveBeenCalledWith("const simpleRegex = /abcd/;");

			const modal = document.querySelector("dialog.input-ai--modal") as HTMLDialogElement;
			expect(modal.attributes.getNamedItem("open")).toBeTruthy();
		});

		test("should process HTML tags properly", async () => {
			mockResponse(["<p>First part of paragraph</p>", "<p>Second part of paragraph</p>"]);

			const aiButton = document.querySelector(".input-ai--primary-button") as HTMLButtonElement;
			aiButton.click();

			const promptInput = document.querySelector(".input-ai--user-input") as HTMLTextAreaElement;
			promptInput.value = "test prompt";

			const submitButton = document.querySelector(".input-ai--submit-prompt") as HTMLButtonElement;
			submitButton.click();

			await new Promise((resolve) => setTimeout(resolve, inputAi.options.api.debounceTime));

			const assistantElement = document.querySelector(".input-ai--assistant:last-child") as HTMLDivElement;
			expect(assistantElement.innerHTML).toContain("<p>First part of paragraph</p><p>Second part of paragraph</p>");
		});

		test("should handle split tags across chunks", async () => {
			mockResponse(["<p>First part", " of paragraph</p>", " something says <", "p>Second part of paragraph<", "/p>"]);

			const aiButton = document.querySelector(".input-ai--primary-button") as HTMLButtonElement;
			aiButton.click();

			const promptInput = document.querySelector(".input-ai--user-input") as HTMLTextAreaElement;
			promptInput.value = "test prompt";

			const submitButton = document.querySelector(".input-ai--submit-prompt") as HTMLButtonElement;
			submitButton.click();

			await new Promise((resolve) => setTimeout(resolve, inputAi.options.api.debounceTime));

			const assistantElement = document.querySelector(".input-ai--assistant:last-child") as HTMLDivElement;
			expect(assistantElement.innerHTML).toContain(
				"<p>First part of paragraph</p> something says <p>Second part of paragraph</p>",
			);
		});

		test("should handle multiple pre tags in response", async () => {
			mockResponse(["<pre>First code</pre><pre>Second code</pre>"]);

			const aiButton = document.querySelector(".input-ai--primary-button") as HTMLButtonElement;
			aiButton.click();

			const promptInput = document.querySelector(".input-ai--user-input") as HTMLTextAreaElement;
			promptInput.value = "test prompt";

			const submitButton = document.querySelector(".input-ai--submit-prompt") as HTMLButtonElement;
			submitButton.click();

			await new Promise((resolve) => setTimeout(resolve, inputAi.options.api.debounceTime));

			const assistantElement = document.querySelector(".input-ai--assistant:last-child") as HTMLDivElement;
			expect(assistantElement.innerHTML).toContain("<pre>First code</pre>");
			expect(assistantElement.innerHTML).toContain("<pre>Second code</pre>");

			const preTags = assistantElement.querySelectorAll("pre");
			expect(preTags.length).toBe(2);

			const copyButtons = assistantElement.querySelectorAll(".input-ai--copy-pre");
			expect(copyButtons.length).toBe(2);

			const acceptButtons = assistantElement.querySelectorAll(".input-ai--accept-pre");
			expect(acceptButtons.length).toBe(2);
		});

		test("should handle multiple pre tags split across chunks", async () => {
			mockResponse(["<pre>First code</pre><pre", ">Second code</pre>"]);

			const aiButton = document.querySelector(".input-ai--primary-button") as HTMLButtonElement;
			aiButton.click();

			const promptInput = document.querySelector(".input-ai--user-input") as HTMLTextAreaElement;
			promptInput.value = "test prompt";

			const submitButton = document.querySelector(".input-ai--submit-prompt") as HTMLButtonElement;
			submitButton.click();

			await new Promise((resolve) => setTimeout(resolve, inputAi.options.api.debounceTime));

			const assistantElement = document.querySelector(".input-ai--assistant:last-child") as HTMLDivElement;
			expect(assistantElement.innerHTML).toContain("<pre>First code</pre>");
			expect(assistantElement.innerHTML).toContain("<pre>Second code</pre>");

			const preTags = assistantElement.querySelectorAll("pre");
			expect(preTags.length).toBe(2);

			const copyButtons = assistantElement.querySelectorAll(".input-ai--copy-pre");
			expect(copyButtons.length).toBe(2);

			const acceptButtons = assistantElement.querySelectorAll(".input-ai--accept-pre");
			expect(acceptButtons.length).toBe(2);
		});

		test("should ignore attributes in HTML tags", async () => {
			mockResponse(["<pre onclick=\"alert('Hello')\">First code</pre>", '<pre style="color: red;">Second code</pre>']);

			const aiButton = document.querySelector(".input-ai--primary-button") as HTMLButtonElement;
			aiButton.click();

			const promptInput = document.querySelector(".input-ai--user-input") as HTMLTextAreaElement;
			promptInput.value = "test prompt";

			const submitButton = document.querySelector(".input-ai--submit-prompt") as HTMLButtonElement;
			submitButton.click();

			await new Promise((resolve) => setTimeout(resolve, inputAi.options.api.debounceTime));

			const assistantElement = document.querySelector(".input-ai--assistant:last-child") as HTMLDivElement;
			expect(assistantElement.innerHTML).toContain("<pre>First code</pre>");
			expect(assistantElement.innerHTML).toContain("<pre>Second code</pre>");
		});

		test("should process nested tags", async () => {
			mockResponse(["<p>First part", " of <strong>", "paragraph</strong></p>"]);

			const aiButton = document.querySelector(".input-ai--primary-button") as HTMLButtonElement;
			aiButton.click();

			const promptInput = document.querySelector(".input-ai--user-input") as HTMLTextAreaElement;
			promptInput.value = "test prompt";

			const submitButton = document.querySelector(".input-ai--submit-prompt") as HTMLButtonElement;
			submitButton.click();

			await new Promise((resolve) => setTimeout(resolve, inputAi.options.api.debounceTime));

			const assistantElement = document.querySelector(".input-ai--assistant:last-child") as HTMLDivElement;
			expect(assistantElement.innerHTML).toContain("<p>First part of <strong>paragraph</strong></p>");
		});

		test("should handle self-closing tags like br/hr", async () => {
			mockResponse(["First line<br>Second line<hr>"]);

			const aiButton = document.querySelector(".input-ai--primary-button") as HTMLButtonElement;
			aiButton.click();

			const promptInput = document.querySelector(".input-ai--user-input") as HTMLTextAreaElement;
			promptInput.value = "test prompt";

			const submitButton = document.querySelector(".input-ai--submit-prompt") as HTMLButtonElement;
			submitButton.click();

			await new Promise((resolve) => setTimeout(resolve, inputAi.options.api.debounceTime));

			const assistantElement = document.querySelector(".input-ai--assistant:last-child") as HTMLDivElement;
			expect(assistantElement.innerHTML).toContain("First line<br>Second line<hr>");
		});

		test("should process entire HTML document and only consider content within body tag if present", async () => {
			mockResponse([
				"<html><head><title>Test</title><script>alert('hi')</script></head><body><h1>Hello</h1><p>World</p></body></html>",
			]);

			const aiButton = document.querySelector(".input-ai--primary-button") as HTMLButtonElement;
			aiButton.click();

			const promptInput = document.querySelector(".input-ai--user-input") as HTMLTextAreaElement;
			promptInput.value = "test prompt";

			const submitButton = document.querySelector(".input-ai--submit-prompt") as HTMLButtonElement;
			submitButton.click();

			await new Promise((resolve) => setTimeout(resolve, inputAi.options.api.debounceTime));

			const assistantElement = document.querySelector(".input-ai--assistant:last-child") as HTMLDivElement;
			expect(assistantElement.innerHTML).toBe("<h1>Hello</h1><p>World</p>");
		});

		test("should processn special characters", async () => {
			mockResponse([
				`<!DOCTYPE html><html><body><div>Special Characters: !@#$%^&*()_+-={}[]|:;"'<>,.?/~\`€£¥©®™§¶†‡•–—''""…¿¡áéíóúñüçßÄÖÜœæøåØÆŒ⁰¹²³⁴⁵⁶⁷⁸⁹½¼¾∞∫≈≠≤≥±÷×√∑∏πµΩα→↓←↑★☆♠♣♥♦☺☻♪♫$€£¥₹</div></body></html>`,
			]);

			const aiButton = document.querySelector(".input-ai--primary-button") as HTMLButtonElement;
			aiButton.click();

			const promptInput = document.querySelector(".input-ai--user-input") as HTMLTextAreaElement;
			promptInput.value = "test prompt";

			const submitButton = document.querySelector(".input-ai--submit-prompt") as HTMLButtonElement;
			submitButton.click();
			await new Promise((resolve) => setTimeout(resolve, inputAi.options.api.debounceTime));

			const assistantElement = document.querySelector(".input-ai--assistant:last-child") as HTMLDivElement;
			expect(assistantElement.innerHTML).toBe(
				"<div>Special Characters: !@#$%^&amp;*()_+-={}[]|:;\"'&lt;&gt;,.?/~`€£¥©®™§¶†‡•–—''\"\"…¿¡áéíóúñüçßÄÖÜœæøåØÆŒ⁰¹²³⁴⁵⁶⁷⁸⁹½¼¾∞∫≈≠≤≥±÷×√∑∏πµΩα→↓←↑★☆♠♣♥♦☺☻♪♫$€£¥₹</div>",
			);
		});

		test("should handle empty API responses gracefully", async () => {
			mockResponse([""]);

			const aiButton = document.querySelector(".input-ai--primary-button") as HTMLButtonElement;
			aiButton.click();

			const promptInput = document.querySelector(".input-ai--user-input") as HTMLTextAreaElement;
			promptInput.value = "test prompt";

			const submitButton = document.querySelector(".input-ai--submit-prompt") as HTMLButtonElement;
			submitButton.click();

			await new Promise((resolve) => setTimeout(resolve, inputAi.options.api.debounceTime));

			const assistantElement = document.querySelector(".input-ai--assistant:last-child") as HTMLDivElement;
			expect(assistantElement.innerHTML).toBe("");
		});
	});
});
