import "./index.css";
import { InputAI } from "./inputAi";

declare global {
	interface Window {
		InputAI: typeof InputAI;
	}
}

export type InputAIElementType = HTMLInputElement | HTMLTextAreaElement;

(() => {
	window.InputAI = InputAI;

	const inputs: NodeListOf<InputAIElementType> = document.querySelectorAll(
		'input[type="text"], textarea',
	);

	// Get all inputs that have data-input-ai-* attributes and initialize InputAI on them
	const aiInputs: InputAIElementType[] = Array.from(inputs)
		.filter((element: InputAIElementType) =>
			Array.from(element.attributes).some((attr: Attr) =>
				attr.name.startsWith("data-input-ai-"),
			),
		)
		.filter((element): element is InputAIElementType => element !== null);

	for (const aiInput of aiInputs) {
		new InputAI(aiInput);
	}
})();

export { InputAI };
