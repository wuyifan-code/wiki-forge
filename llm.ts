import { requestUrl } from 'obsidian';
import { LLMWikiForgeSettings } from './main';

export interface IngestResult {
    wikiContent: string;
    suggestedFilename: string;
    logEntry: string;
    indexEntry: string;
}

const INGEST_SYSTEM_PROMPT = `You are an expert knowledge base maintainer acting as an "LLM Wiki Forge".
Your job is to read a raw source document, extract its key information, and integrate it into a personal Obsidian wiki.

You MUST follow these rules carefully:
- Always use standard Obsidian \`[[Wikilinks]]\` for concepts, people, and topics.
- Always include valid YAML Frontmatter at the very top of \`wikiContent\` starting with \`---\` and ending with \`---\`.
- In the Frontmatter, include fields like \`type: source-summary\`, \`tags: [...]\`, and \`source: [filename]\`.
- Make the summary structured using Markdown headings (e.g., \`## Core Idea\`, \`## Key Takeaways\`).

You should return your answer EXACTLY as a JSON object with four keys:
1. "suggestedFilename": A short, hyphen-separated filename for the new wiki page (e.g., "concept-attention-mechanism"). Do NOT include the .md extension.
2. "wikiContent": The full markdown content of the new wiki page (including frontmatter and Obsidian wikilinks).
3. "logEntry": A one-line string to append to the chronological log.md file. Format: "- [YYYY-MM-DD] Ingested | [Source Title] -> [[suggestedFilename]]"
4. "indexEntry": A one-line string to insert into the index.md file. Format: "- [[suggestedFilename]]: A short one-sentence summary of what this page is about."

CRITICAL: Return ONLY valid JSON. Do not include markdown codeblocks (\`\`\`json) or any conversational text before or after the JSON.
`;

import { ImageContent } from './utils';

export async function callLLMForIngest(settings: LLMWikiForgeSettings, sourceContent: string, sourceFilename: string, images: ImageContent[] = []): Promise<IngestResult> {
    const userPrompt = `Source filename: ${sourceFilename}\n\nSource Content:\n${sourceContent}`;

    if (settings.provider === 'openai') {
        return callOpenAIIngest(settings, userPrompt, images);
    } else if (settings.provider === 'anthropic') {
        return callAnthropicIngest(settings, userPrompt, images);
    } else if (settings.provider === 'ollama') {
        return callOllamaIngest(settings, userPrompt, images);
    } else {
        throw new Error(`Unsupported provider: ${settings.provider}`);
    }
}

export async function callLLMForLint(settings: LLMWikiForgeSettings, indexContent: string, onChunk: (text: string) => void): Promise<string> {
    const systemPrompt = `You are an expert knowledge base health inspector. You are given the current index of the user's Obsidian wiki.
Your job is to look for:
- Potential contradictions between pages
- Orphan concepts that should probably have their own pages
- Missing cross-references
- Broad topics that should be broken down

Provide a bulleted list of actionable recommendations. Be concise and use standard Markdown.`;

    const userPrompt = "Please review the following index and provide health recommendations:\n" + indexContent;

    if (settings.provider === 'openai') {
        return callOpenAIStream(settings, systemPrompt, userPrompt, onChunk);
    } else if (settings.provider === 'anthropic') {
        return callAnthropicStream(settings, systemPrompt, userPrompt, onChunk);
    } else if (settings.provider === 'ollama') {
        return callOllamaStream(settings, systemPrompt, userPrompt, onChunk);
    } else {
        throw new Error(`Unsupported provider: ${settings.provider}`);
    }
}

export async function callLLMForQuery(settings: LLMWikiForgeSettings, query: string, indexContent: string, onChunk: (text: string) => void): Promise<string> {
    const systemPrompt = `You are an expert knowledge base assistant. You are given the current index of the user's Obsidian wiki.
Your job is to answer the user's query based on the index or general knowledge, and optionally suggest they create new pages.
Whenever you mention a topic that exists in the index, use Obsidian [[Wikilinks]].

Here is the current Wiki Index:
${indexContent}
`;

    if (settings.provider === 'openai') {
        return callOpenAIStream(settings, systemPrompt, query, onChunk);
    } else if (settings.provider === 'anthropic') {
        return callAnthropicStream(settings, systemPrompt, query, onChunk);
    } else if (settings.provider === 'ollama') {
        return callOllamaStream(settings, systemPrompt, query, onChunk);
    } else {
        throw new Error(`Unsupported provider: ${settings.provider}`);
    }
}


async function callOllamaIngest(settings: LLMWikiForgeSettings, userPrompt: string, images: ImageContent[]): Promise<IngestResult> {
    let endpoint = settings.ollamaEndpoint || 'http://localhost:11434';
    if (endpoint.endsWith('/')) {
        endpoint = endpoint.slice(0, -1);
    }

    const response = await requestUrl({
        url: `${endpoint}/api/chat`,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: settings.model,
            messages: [
                { role: 'system', content: INGEST_SYSTEM_PROMPT },
                {
                    role: 'user',
                    content: userPrompt,
                    images: images.length > 0 ? images.map(img => img.base64) : undefined
                }
            ],
            stream: false,
            format: "json",
            options: {
                temperature: 0.2
            }
        })
    });

    if (response.status !== 200) {
        throw new Error(`Ollama Error: ${response.text}`);
    }

    const data = response.json;
    const content = data.message.content;
    try {
        return JSON.parse(content) as IngestResult;
    } catch (e) {
        throw new Error("Failed to parse JSON from Ollama response");
    }
}

async function callOpenAIIngest(settings: LLMWikiForgeSettings, userPrompt: string, images: ImageContent[]): Promise<IngestResult> {
    if (!settings.apiKey) throw new Error("OpenAI API key is missing");

    const response = await requestUrl({
        url: 'https://api.openai.com/v1/chat/completions',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${settings.apiKey}`
        },
        body: JSON.stringify({
            model: settings.model,
            messages: [
                { role: 'system', content: INGEST_SYSTEM_PROMPT },
                {
                    role: 'user',
                    content: images.length > 0 ? [
                        { type: "text", text: userPrompt },
                        ...images.map(img => ({
                            type: "image_url",
                            image_url: { url: `data:${img.mimeType};base64,${img.base64}` }
                        }))
                    ] : userPrompt
                }
            ],
            response_format: { type: "json_object" },
            temperature: 0.2
        })
    });

    if (response.status !== 200) {
        throw new Error(`OpenAI Error: ${response.text}`);
    }

    const data = response.json;
    const content = data.choices[0].message.content;
    try {
        return JSON.parse(content) as IngestResult;
    } catch (e) {
        throw new Error("Failed to parse JSON from OpenAI response");
    }
}

async function callAnthropicIngest(settings: LLMWikiForgeSettings, userPrompt: string, images: ImageContent[]): Promise<IngestResult> {
    if (!settings.apiKey) throw new Error("Anthropic API key is missing");

    const response = await requestUrl({
        url: 'https://api.anthropic.com/v1/messages',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': settings.apiKey,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model: settings.model,
            system: INGEST_SYSTEM_PROMPT,
            messages: [
                {
                    role: 'user',
                    content: images.length > 0 ? [
                        ...images.map(img => ({
                            type: "image",
                            source: {
                                type: "base64",
                                media_type: img.mimeType,
                                data: img.base64
                            }
                        })),
                        { type: "text", text: userPrompt }
                    ] : userPrompt
                }
            ],
            max_tokens: 4000,
            temperature: 0.2
        })
    });

    if (response.status !== 200) {
        throw new Error(`Anthropic Error: ${response.text}`);
    }

    const data = response.json;
    const content = data.content[0].text;

    // Sometimes Claude returns markdown JSON blocks even when told not to.
    // Try to strip them.
    let cleanContent = content.trim();
    if (cleanContent.startsWith('```json')) {
        cleanContent = cleanContent.replace(/^```json/, '').replace(/```$/, '').trim();
    } else if (cleanContent.startsWith('```')) {
        cleanContent = cleanContent.replace(/^```/, '').replace(/```$/, '').trim();
    }

    try {
        return JSON.parse(cleanContent) as IngestResult;
    } catch (e) {
        throw new Error("Failed to parse JSON from Anthropic response");
    }
}

async function callOllamaStream(settings: LLMWikiForgeSettings, systemPrompt: string, userPrompt: string, onChunk: (text: string) => void): Promise<string> {
    let endpoint = settings.ollamaEndpoint || 'http://localhost:11434';
    if (endpoint.endsWith('/')) {
        endpoint = endpoint.slice(0, -1);
    }

    const response = await fetch(`${endpoint}/api/chat`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: settings.model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            stream: true,
            options: {
                temperature: 0.7
            }
        })
    });

    if (!response.ok) {
        throw new Error(`Ollama Error: ${response.statusText}`);
    }

    return readStream(response, onChunk, (chunk) => {
        try {
            const data = JSON.parse(chunk);
            return data.message?.content || "";
        } catch (e) {
            return "";
        }
    });
}

async function callOpenAIStream(settings: LLMWikiForgeSettings, systemPrompt: string, userPrompt: string, onChunk: (text: string) => void): Promise<string> {
    if (!settings.apiKey) throw new Error("OpenAI API key is missing");

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${settings.apiKey}`
        },
        body: JSON.stringify({
            model: settings.model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.7,
            stream: true
        })
    });

    if (!response.ok) {
        throw new Error(`OpenAI Error: ${response.statusText}`);
    }

    return readSSEStream(response, onChunk, (data) => {
        return data.choices[0]?.delta?.content || "";
    });
}

async function callAnthropicStream(settings: LLMWikiForgeSettings, systemPrompt: string, userPrompt: string, onChunk: (text: string) => void): Promise<string> {
    if (!settings.apiKey) throw new Error("Anthropic API key is missing");

    // Note: Anthropic streaming requires slightly different headers, and some users might experience CORS issues using native fetch in Obsidian.
    // If CORS is an issue, Obsidian's requestUrl doesn't support streaming well. We use native fetch here.
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': settings.apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true' // Need this to skip CORS preflight block in some Obsidian environments
        },
        body: JSON.stringify({
            model: settings.model,
            system: systemPrompt,
            messages: [
                { role: 'user', content: userPrompt }
            ],
            max_tokens: 4000,
            temperature: 0.7,
            stream: true
        })
    });

    if (!response.ok) {
        throw new Error(`Anthropic Error: ${response.statusText}`);
    }

    return readSSEStream(response, onChunk, (data) => {
        if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta') {
            return data.delta.text || "";
        }
        return "";
    });
}

// Utility to read NDJSON streams (Ollama)
async function readStream(response: Response, onChunk: (text: string) => void, parseChunk: (chunk: string) => string): Promise<string> {
    const reader = response.body?.getReader();
    const decoder = new TextDecoder("utf-8");
    let fullText = "";

    if (!reader) throw new Error("No reader available");

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });

        const lines = chunk.split('\n');
        for (const line of lines) {
            if (line.trim()) {
                const text = parseChunk(line);
                if (text) {
                    fullText += text;
                    onChunk(text);
                }
            }
        }
    }
    return fullText;
}

// Utility to read SSE streams (OpenAI/Anthropic)
async function readSSEStream(response: Response, onChunk: (text: string) => void, parseData: (data: any) => string): Promise<string> {
    const reader = response.body?.getReader();
    const decoder = new TextDecoder("utf-8");
    let fullText = "";
    let buffer = "";

    if (!reader) throw new Error("No reader available");

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex;
        while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, newlineIndex).trim();
            buffer = buffer.slice(newlineIndex + 1);

            if (line.startsWith('data: ')) {
                const dataStr = line.slice(6);
                if (dataStr === '[DONE]') continue;

                try {
                    const data = JSON.parse(dataStr);
                    const text = parseData(data);
                    if (text) {
                        fullText += text;
                        onChunk(text);
                    }
                } catch (e) {
                    // Ignore parsing errors for incomplete chunks
                }
            }
        }
    }
    return fullText;
}
