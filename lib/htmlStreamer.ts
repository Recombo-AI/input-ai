const BLOCKED_TAGS = [
	"!doctype",
	"html",
	"head",
	"title",
	"script",
	"style",
	"link",
	"meta",
	"body",
	"a",
	"iframe",
	"img",
];

interface SSEEvent {
	event: string;
	data: string;
}

export class HTMLStreamer {
	dataChunks: string[] = [];
	private tagStack: HTMLElement[];
	private reader: ReadableStreamDefaultReader<Uint8Array>;
	private decoder: TextDecoder;
	private textBuffer = "";
	private partialTagContent: string | null = null;
	private isProcessingBlockedTag = false;
	private readonly selfClosingTags = ["br", "hr"];

	private processSuccessEvent: (chunk: string) => string | Promise<string> = (chunk) => chunk;
	private processErrorEvent: (chunk: string) => string | Promise<string> = (chunk) => chunk;
	private onFinish: () => void = () => {};
	private tagHandlers: Record<string, (element: HTMLElement) => void> = {};

	constructor(container: HTMLElement, reader: ReadableStreamDefaultReader<Uint8Array>) {
		this.tagStack = [container];
		this.reader = reader;
		this.decoder = new TextDecoder();
	}

	onComplete(callback: () => void) {
		this.onFinish = callback;
		return this;
	}

	onSuccessEvent(callback: (chunk: string) => string | Promise<string>) {
		this.processSuccessEvent = callback;
		return this;
	}

	onErrorEvent(callback: (chunk: string) => string | Promise<string>) {
		this.processErrorEvent = callback;
		return this;
	}

	onTagAdded(tagName: string, callback: (element: HTMLElement) => void) {
		this.tagHandlers[tagName.toLowerCase()] = callback;
		return this;
	}

	private processSSE(rawChunk: string): SSEEvent[] {
		const eventLines = rawChunk.split("\n\n");
		const events: SSEEvent[] = [];

		for (const eventBlock of eventLines) {
			if (!eventBlock.trim()) continue;

			let event = "message"; // Default event type
			let data = "";

			const lines = eventBlock
				.split("\n")
				.map((l) => l.trim())
				.filter(Boolean);

			for (const line of lines) {
				if (line.startsWith("event:")) {
					event = line.substring(6).trim();
				} else if (line.startsWith("data:")) {
					data = line.substring(5).trim();
				}
			}

			if (data) {
				events.push({ event, data });
			}
		}

		return events;
	}

	async start() {
		while (true) {
			const { done, value } = await this.reader.read();
			const rawChunk = value ? this.decoder.decode(value, { stream: true }) : null;

			if (!rawChunk || done) {
				this.flushBufferedText();
				this.onFinish();
				break;
			}

			if (rawChunk.startsWith("event:") || rawChunk.startsWith("data:")) {
				const events = this.processSSE(rawChunk);

				for (const event of events) {
					if (event.event === "error") {
						await this.handleError(event.data);
					} else {
						await this.handleChunk(event.data);
					}
				}
			} else {
				await this.handleChunk(rawChunk);
			}
		}
	}

	private async handleChunk(rawChunk: string) {
		const dataChunk = await this.processSuccessEvent(rawChunk);
		this.dataChunks.push(dataChunk);

		const fullChunk = this.textBuffer + dataChunk;
		this.textBuffer = "";

		if (fullChunk) {
			this.parseHTML(fullChunk);
		}
	}

	private async handleError(error: string) {
		const errorMessage = await this.processErrorEvent(error);
		throw new Error(errorMessage, { cause: "Error from SSE" });
	}

	private parseHTML(html: string) {
		for (let i = 0; i < html.length; i++) {
			const char = html[i];

			if (char === "<") {
				this.flushBufferedText();

				const closingTagPosition = html.indexOf(">", i + 1);
				if (closingTagPosition !== -1) {
					const tagContent = html.slice(i + 1, closingTagPosition);
					if (tagContent) {
						this.processTag(tagContent);
						i = closingTagPosition;
					} else {
						this.textBuffer += char;
					}
				} else {
					this.partialTagContent = html.slice(i + 1);
					break;
				}
			} else if (char === ">" && this.partialTagContent !== null) {
				const tagContent = this.partialTagContent + this.textBuffer;
				this.processTag(tagContent);

				this.partialTagContent = null;
				this.textBuffer = "";
			} else if (char === " ") {
				this.textBuffer += char;
				this.flushBufferedText();
			} else {
				this.textBuffer += char;
			}
		}
	}

	private processTag(tagContent: string) {
		const tagName = tagContent.split(" ")[0].toLowerCase();
		const isClosingTag = tagName.startsWith("/");

		if (BLOCKED_TAGS.includes(tagName.replace("/", ""))) {
			this.isProcessingBlockedTag = true;
			return;
		}

		this.isProcessingBlockedTag = false;

		if (isClosingTag && this.tagStack.length > 1) {
			this.tagStack.pop();
			return;
		}

		const element = document.createElement(tagName);
		this.currentTag.appendChild(element);

		const handler = this.tagHandlers[element.tagName.toLowerCase()];
		if (handler) {
			handler(element);
		}

		if (!this.selfClosingTags.includes(tagName)) {
			this.tagStack.push(element);
		}
	}

	private flushBufferedText() {
		if (this.partialTagContent !== null) {
			return;
		}

		if (!this.isProcessingBlockedTag && this.textBuffer) {
			this.currentTag.appendChild(document.createTextNode(this.textBuffer));
		}

		this.textBuffer = "";
	}

	private get currentTag() {
		return this.tagStack[this.tagStack.length - 1];
	}
}
