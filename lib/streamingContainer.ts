interface TagType {
	start: string;
	end: string;
	element: string;
	className: string;
	callbacks: Array<(element: HTMLElement) => void>;
}

interface TagTypes {
	[key: string]: TagType;
}

class StreamingContainer {
	private container: HTMLElement;
	private wordQueue: string[];
	private streamInterval: number | null;
	private isProcessing: boolean;
	private tagBuffer: string;
	private isProcessingTag: boolean;
	private currentTag: { type: string; config: TagType } | null;
	private onCompleteCallbacks: Array<() => void>;
	private tagTypes: TagTypes;
	private allowedTags: string[];

	constructor(container: HTMLElement) {
		this.container = container;
		this.wordQueue = [];
		this.streamInterval = null;
		this.isProcessing = false;
		this.tagBuffer = "";
		this.isProcessingTag = false;
		this.currentTag = null;
		this.onCompleteCallbacks = [];

		this.allowedTags = [
			"p",
			"div",
			"span",
			"br",
			"hr",
			"b",
			"i",
			"strong",
			"em",
			"u",
			"code",
			"pre",
			"ul",
			"ol",
			"li",
			"h1",
			"h2",
			"h3",
			"h4",
			"h5",
			"h6",
			"a",
			"table",
			"thead",
			"tbody",
			"tr",
			"th",
			"td",
		];

		this.tagTypes = {};
		this.initializeTagTypes();
	}

	/**
	 * Initialize tag types for all allowed tags
	 */
	private initializeTagTypes(): void {
		for (const tag of this.allowedTags) {
			this.tagTypes[tag] = {
				start: `<${tag}`,
				end: `</${tag}>`,
				element: tag,
				className: `input-ai--${tag}-tag`,
				callbacks: [],
			};
		}
	}

	/**
	 * Add a callback to be executed when streaming is complete
	 */
	onComplete(callback: () => void): StreamingContainer {
		if (typeof callback === "function") {
			this.onCompleteCallbacks.push(callback);
		}
		return this;
	}

	/**
	 * Add a callback to be executed when a tag is added from the stream
	 */
	onTagAdded(
		type: string,
		callback: (element: HTMLElement) => void,
	): StreamingContainer {
		if (this.tagTypes[type]) {
			this.tagTypes[type].callbacks.push(callback);
		}
		return this;
	}

	addChunk(chunk: string): void {
		if (!chunk || chunk.length === 0) return;

		const words = chunk.split(/(\s+)/).filter((word) => word.length > 0);
		this.wordQueue = this.wordQueue.concat(words);

		if (!this.isProcessing) {
			this.startProcessing();
		}
	}

	private startProcessing(): void {
		this.isProcessing = true;
		this.streamInterval = window.setInterval(() => this.processNextWord(), 0);
	}

	private processNextWord(): void {
		if (this.wordQueue.length === 0) {
			if (this.streamInterval !== null) {
				clearInterval(this.streamInterval);
			}
			this.isProcessing = false;

			// Handle any remaining tag buffer content
			if (this.tagBuffer && this.tagBuffer.length > 0) {
				this.processWord(this.tagBuffer);
				this.tagBuffer = "";
			}

			// Execute completion callbacks
			for (const callback of this.onCompleteCallbacks) {
				callback();
			}
			this.onCompleteCallbacks = [];
			return;
		}

		const word = this.wordQueue.shift();
		if (word === undefined) return;

		// Check if we're currently processing a tag or this word starts a new tag
		if (this.isProcessingTag) {
			this.continueProcessingTag(word);
		} else if (this.startsWithTag(word)) {
			this.beginProcessingTag(word);
		} else {
			this.processWord(word);
		}
	}

	/**
	 * Check if a word starts with an HTML tag
	 */
	private startsWithTag(word: string): boolean {
		return word.startsWith("<") && /^<[a-z][a-z0-9]*\b/i.test(word);
	}

	/**
	 * Extract tag name from opening tag
	 */
	private extractTagName(word: string): string | null {
		const match = word.match(/^<([a-z][a-z0-9]*)\b/i);
		return match ? match[1].toLowerCase() : null;
	}

	/**
	 * Escape HTML special characters
	 */
	private escapeHtml(str: string): string {
		return str
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#039;");
	}

	/**
	 * Begin processing a tag
	 */
	private beginProcessingTag(word: string): void {
		const tagName = this.extractTagName(word);

		// If not a valid tag or not allowed, treat as plain text
		if (!tagName || !this.allowedTags.includes(tagName)) {
			this.processWord(this.escapeHtml(word));
			return;
		}

		this.isProcessingTag = true;
		this.currentTag = {
			type: tagName,
			config: this.tagTypes[tagName],
		};

		const tagMatch = word.match(new RegExp(`<${tagName}([^>]*)>(.*)`));
		const contentAfterTag = tagMatch ? tagMatch[2] : "";

		// Create the element
		const element = document.createElement(tagName);
		element.classList.add(this.tagTypes[tagName].className);

		this.container.appendChild(element);

		// Check if this word also contains the end tag
		const endTag = this.tagTypes[tagName].end;
		if (contentAfterTag?.includes(endTag)) {
			const [beforeEnd, afterEnd] = this.splitAtEndTag(contentAfterTag, endTag);
			element.textContent = beforeEnd;
			this.isProcessingTag = false;
			this.currentTag = null;

			// Process any content after the end tag
			if (afterEnd) {
				this.processWord(afterEnd);
			}
		} else {
			element.textContent = contentAfterTag;
		}
	}

	/**
	 * Continue processing an existing tag
	 */
	private continueProcessingTag(word: string): void {
		if (!this.currentTag) {
			this.isProcessingTag = false;
			this.processWord(word);
			return;
		}

		const element = this.container.lastChild as HTMLElement;
		const endTag = this.currentTag.config.end;

		if (word.includes(endTag)) {
			const [beforeEnd, afterEnd] = this.splitAtEndTag(word, endTag);
			if (element.textContent !== null) {
				element.textContent += beforeEnd;
			}

			for (const callback of this.currentTag.config.callbacks) {
				callback(element);
			}

			this.isProcessingTag = false;
			this.currentTag = null;

			if (afterEnd) {
				this.processWord(afterEnd);
			}
		} else {
			if (element.textContent !== null) {
				element.textContent += word;
			}
		}
	}

	/**
	 * Split text at the end tag
	 */
	private splitAtEndTag(text: string, endTag: string): [string, string] {
		const endIndex = text.indexOf(endTag);
		if (endIndex === -1) return [text, ""];

		const beforeEnd = text.substring(0, endIndex);
		const afterEnd = text.substring(endIndex + endTag.length);
		return [beforeEnd, afterEnd];
	}

	/**
	 * Process a regular word (non-tag)
	 */
	private processWord(word: string): void {
		// Check if the word potentially contains a tag start
		if (this.startsWithTag(word)) {
			const tagName = this.extractTagName(word);

			// If it's an allowed tag, begin processing it
			if (tagName && this.allowedTags.includes(tagName)) {
				this.beginProcessingTag(word);
				return;
			}
		}

		const wordSpan = document.createElement("span");
		wordSpan.textContent = word;
		this.container.appendChild(wordSpan);
	}
}

export { StreamingContainer };
