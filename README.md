# InputAI

> Simple, framework-agnostic, HTML first JavaScript library for adding AI-powered text generation to input fields.

InputAI seamlessly integrates AI capabilities into your inputs with an elegant user interface that works with any LLM. Built with vanilla JavaScript, it provides a simple solution for enhancing your forms with AI assistance.

```html
<input
  type="text"
  name="subject"
  data-input-ai-modal-title="Subject generator"
  data-input-ai-prompt-placeholder="Ask AI to generate a subject..."
  data-input-ai-system-instructions="
    You are a cat and an expert in drafting professional email subjects.
    Generate and return the subject wrapped in <pre> tag for given prompt.
  "
/>
```

https://github.com/user-attachments/assets/729da084-6633-421c-84ee-bdd1089ceb79

### Features
* [LLM Agnostic](#llm-agnostic)
* [HTML-First](#pure-javascript--html-first)
* [Multiple AI Experts](#multiple-ai-experts)
* [Streaming](#streaming)
* [Customizable UI](#customizable-ui)

### Getting Started
* [Installation](#installation)
* [Usage](#usage)
* [API Reference](#api-reference)
* [Styling](#styling)
* [Examples](#examples)
* [Use Cases](#use-cases)

---

### LLM Agnostic

Works with any Large Language Model API—OpenAI, Anthropic, or your own endpoint:

```html
<textarea
  name="feedback"
  data-input-ai-body='{ "system": "{{systemInstructions}}", "messages": "{{messages}}", "model": "gpt-4", "stream": true, "max_tokens": 100 }'
  data-input-ai-system-instructions="You are a customer support assistant. Help in generating feedback for given points."
  data-input-ai-user-message='{ "role": "user", "content": "{{user}}" }'
  data-input-ai-assistant-message='{ "role": "assistant", "content": "{{assistant}}" }'
  data-input-ai-response-expression="{{$join(completion.choices[0].message.content)}}"
></textarea>
```

It leverages the powerful [JSONata](https://jsonata.org/) transformer to generate and parse JSON, allowing flexibility with any LLM APIs.

### HTML-First

InputAI is built with an HTML-first design philosophy, allowing full configuration through data attributes: without writing any JavaScript, no build tools, or external libraries required.

```html
<!-- meta tags for global defaults -->
<meta name="input-ai-url" content="https://api.example.com/ai">
<meta name="input-ai-headers" content='{"X-CSRFToken": "{{csrfmiddlewaretoken.value}}"}'>
<!-- see API reference for all available meta tags -->

<input type="text" name="subject">
<textarea
  name="content"
  data-input-ai-modal-title="Email Drafter"
  data-input-ai-system-instructions="
    You are an expert in email drafting.
    Given <subject>{{subject.value}}</subject>, write a professional email content based on given prompt.
  "
  data-input-ai-user-message='{ "role": "user", "content": "{{user}}" }'
  data-input-ai-assistant-message='{ "role": "assistant", "content": "{{assistant}}" }'
></textarea>
```

### Multiple AI Experts

InputAI allows defining different AI personas for different inputs within the same form. Each input can have its own specialized AI assistant:

```html
<!-- A form with two specialized AI assistants -->
<form>
  <!-- Email Subject Expert -->
  <input
    type="text"
    name="email_subject"
    data-input-ai-modal-title="Subject Line Expert"
    data-input-ai-prompt-placeholder="Ask AI to generate a subject..."
    data-input-ai-system-instructions="You are an expert at writing catchy email subject lines.
      Generate a subject line based on the given prompt."
  >

  <!-- Email Body Expert -->
  <textarea
    name="email_body"
    data-input-ai-modal-title="Email Content Expert"
    data-input-ai-prompt-placeholder="Ask AI to draft an email body..."
    data-input-ai-system-instructions="You are an expert copywriter who drafts professional emails.
      Include the subject in your considerations: <subject>{{email_subject.value}}</subject>."
  ></textarea>
</form>
```

### Streaming

InputAI can consume and render SSE streams from your LLM by default, instantly displaying HTML formatted response as it arrives.

> 💡 To enable copy/insert buttons for specific content (i.e., outputs relevant to users), instruct the LLM to wrap the desired sections in `<pre>` tags.

```html
const input = document.querySelector('input[name="email_regex"]');

inputAI(input, {
  systemInstructions: `
    You are an expert in regular expressions.
    For validating emails, generate and return a regex pattern wrapped in <pre> tag
    considering these validation points: {{email_format.value}}
  `,
  userMessage: { role: 'user', content: '{{user}}' },
  assistantMessage: { role: 'assistant', content: '{{assistant}}' }
});
```

### Customizable UI

InputAI comes with a clean, minimalist design that can be easily customized to match your application's style. Simply override CSS variables in your stylesheet to change colors, fonts, and other visual properties:

```css
:root {
  --input-ai--primary-button-bg: #4a4a4a;
  --input-ai--modal-content-bg: #2d2d2d;
  --input-ai--prompt-bg: #2563eb;
  // and more...
}
```

Refer to the [Customization & Styling](#customization--styling) section for more details.

---

## Installation

### Via CDN

```html
<script src="https://unpkg.com/input-ai"></script>
<link rel="stylesheet" href="https://unpkg.com/input-ai@latest/dist/inputai.min.css">
```

This will add `inputAI` and other helper functions to the global `window` object. You can use them in your JavaScript code for programmatic configuration.

### Via package manager

```bash
npm install input-ai
# or
bun add input-ai
yarn add input-ai
pnpm add input-ai
```

Then import the library in your JavaScript:

```js
import { inputAI } from 'input-ai';
```

---

## Usage

InputAI provides 3 configuration methods to make your input/textarea elements AI-ready:

1. **JavaScript API**: Programmatically initialize InputAI on specific elements along with its configuration.
2. **Data Attributes**: Use HTML data attributes to configure InputAI directly in your HTML markup.
3. **Meta Tags**: Set global defaults for all input elements using meta tags in your HTML.

Precedence: **JavaScript API > Data Attributes > Meta Tags** where the JavaScript configuration takes the highest priority overriding others.

For the list of all available configuration options, see the [API Reference](#api-reference) below.

### 1. JavaScript API

```js
import { inputAI, configureInputAI, destroyInputAI } from 'input-ai';

// Set global defaults for all elements
configureInputAI({ api: { url: 'https://api.example.com/ai' } });

// Initialize on an element
const textarea = document.querySelector('textarea[name="content"]');
const ai = inputAI(textarea, {
  api: {
    url: 'https://api.example.com/ai',
    headers: { 'X-CSRFToken': '{{csrfmiddlewaretoken.value}}' }
  },
  systemInstructions: 'You are a helpful assistant.',
  userMessage: { role: 'user', content: '{{user}}' },
  assistantMessage: { role: 'assistant', content: '{{assistant}}' }
});

// Remove InputAI from an element
destroyInputAI(textarea);
```

### 2. Data Attributes (HTML-First)

```html
<textarea
  name="content"
  data-input-ai-modal-title="AI Assistant"
  data-input-ai-system-instructions="You are a helpful assistant."
></textarea>
```

The library auto-initializes on page load and applies the configuration to all input/textarea elements having `data-input-ai-*` attributes.

### 3. Meta Tags (Global Defaults)

```html
<meta name="input-ai-url" content="https://api.example.com/ai">
<meta name="input-ai-headers" content='{"X-CSRFToken": "{{csrfmiddlewaretoken.value}}"}'>
<meta name="input-ai-body" content='{"system": "{{systemInstructions}}", "messages": "{{messages}}", "model":"gpt-4","stream":true, "max_tokens": 100}'>
```

Refer to the [API Reference](#api-reference) for all available meta tags.

---

## API Reference

### Data Attributes

| Attribute                           | Description                                             |
| ----------------------------------- | ------------------------------------------------------- |
| `data-input-ai-url`                 | API endpoint URL                                        |
| `data-input-ai-headers`             | JSON string of HTTP headers                             |
| `data-input-ai-body`                | JSON string for the request body (e.g., model)          |
| `data-input-ai-system-instructions` | System prompt template                                  |
| `data-input-ai-user-message`        | User message template (must include `{{user}}`)         |
| `data-input-ai-assistant-message`   | Assistant template (must include `{{assistant}}`)       |
| `data-input-ai-response-expression` | JSONata expression to parse and extract the reply       |
| `data-input-ai-error-expression`    | JSONata expression to parse and extract the error       |

### Meta Tags

| Meta Tag                            | Description                                               |
| ----------------------------------- | --------------------------------------------------------- |
| `input-ai-url`                      | Default API endpoint URL                                  |
| `input-ai-headers`                  | Default JSON string of HTTP headers                       |
| `input-ai-body`                     | Default JSON string for the request body                  |
| `input-ai-response-expression`      | Default JSONata expression to parse and extract the reply |
| `input-ai-error-expression`         | Default JSONata expression to parse and extract the error |

You can refer any form elements using `{{name.value}}` syntax as the meta value. For example:

```html
<meta name="input-ai-headers" content='{"X-CSRFToken": "{{csrfmiddlewaretoken.value}}"}'>
```

This will replace `{{csrfmiddlewaretoken.value}}` with the actual value of the `csrfmiddlewaretoken`
element present in the form when the request is made.

### JavaScript Options

```ts
interface InputAIOptions {
  api: {
    url: string;
    headers?: Record<string,string>;
    body?: Record<string, any>;
    debounceTime?: number;
  };
  text?: {
    modalTitle?: string;
    promptPlaceholder?: string;
  };
  systemInstructions?: string;
  userMessage?: { role: string; content: string };
  assistantMessage?: { role: string; content: string };
  responseExpression?: string;
  errorExpression?: string;
}
```

Form element values can be referenced using the {{name.value}} syntax when defining headers or body parameters, allowing dynamic injection of form data into API requests. For example:

```js
inputAI(textarea, {
  api: {
    url: 'https://api.example.com/ai',
    headers: { 'X-CSRFToken': '{{csrfmiddlewaretoken.value}}' },
    body: {
      system: '{{systemInstructions}}',
      messages: '{{messages}}',
      max_tokens: 100,
      model: '{{model.value}}',
    }
  },
  systemInstructions: 'You are a helpful assistant.',
  userMessage: { role: 'user', content: '{{user}}' },
  assistantMessage: { role: 'assistant', content: '{{assistant}}' }
});
```

### Reserved Context Variables

Below variables are reserved and will be replaced with actual values when making the API request:

| Variable                         | Description                                                                         |
| -------------------------------- | ----------------------------------------------------------------------------------- |
| `{{user}}`                       | Prompt given by user                                                                |
| `{{assistant}}`                  | Output of the assistant                                                             |
| `{{systemInstructions}}`         | System instructions value                                                           |
| `{{messages}}`                   | List of all messages (user & assistant messages)                                    |
| `{{name.value}}`                 | Value of the form element with name `name`                                          |
| `{{name.all}}`                   | List of options for element with name `name` (for radio, checkbox & select element) |

### Helper Functions

* **`configureInputAI(options: InputAIOptions)`**: Globally set or update default configuration at runtime.
* **`destroyInputAI(element: HTMLElement)`**: Remove AI features and listeners from a given input element.

---

## Styling

InputAI defines a set of CSS variables for easy customization. You can override these in your CSS to match your design system.

```css
.input-ai--wrapper               /* Container around input + button */
.input-ai--primary-button         /* Main trigger button */
.input-ai--modal                  /* Modal overlay */
.input-ai--modal-content          /* Modal dialog */
.input-ai--modal-header           /* Modal header */
.input-ai--modal-title            /* Modal title text */
.input-ai--user-input-form        /* Form wrapper inside modal */
.input-ai--user-input             /* Textarea/input inside modal */
.input-ai--user-input-actions     /* Button group for submit/cancel */
```

and more. Refer to the [InputAI CSS](lib/index.css) for all available variables.

**Example**

```css
/* Example of overriding InputAI styles with Tailwind CSS variables */
:root {
  --input-ai--modal-content-bg: var(--color-gray-800);
  --input-ai--modal-header-border: 1px solid var(--color-gray-700);
  --input-ai--modal-title-color: var(--color-gray-100);

  --input-ai--primary-button-bg: var(--color-gray-800);
  --input-ai--primary-button-border-radius: var(--radius-md);

  --input-ai--action-button-bg: var(--color-gray-700);
  --input-ai--action-button-border-radius: var(--radius-md);

  --input-ai--user-input-bg: var(--color-gray-800);
  --input-ai--user-input-color: var(--color-gray-100);
  --input-ai--user-input-form-border-top: 2px solid var(--color-gray-700);
}
```

---

## Examples

Check out the `examples/` folder containing various examples

* [Default](examples/default/index.html)
* [Gemini + Tailwind](examples/gemini/index.html)
* more examples coming soon!

---

## Use Cases

* **Content Generation**: Draft product descriptions, feedback, reviews etc using only a few keywords.
* **Expert Assistance**: Provide suggestions or conversions like text-to-SQL, text-to-JSONata, etc.

---

## Contributing
We welcome contributions! Do submit issues, feature requests, or pull requests.

## License
This project is released under the [MIT License](https://opensource.org/licenses/MIT).
