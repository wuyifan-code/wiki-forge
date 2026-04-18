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

export async function callLLMForIngest(settings: LLMWikiForgeSettings, sourceContent: string, sourceFilename: string): Promise<IngestResult> {
    const userPrompt = `Source filename: ${sourceFilename}\n\nSource Content:\n${sourceContent}`;

    if (settings.provider === 'openai') {
        return callOpenAIIngest(settings, userPrompt);
    } else if (settings.provider === 'anthropic') {
        return callAnthropicIngest(settings, userPrompt);
    } else if (settings.provider === 'ollama') {
        return callOllamaIngest(settings, userPrompt);
    } else {
        throw new Error(`Unsupported provider: ${settings.provider}`);
    }
}

export async function callLLMForLint(settings: LLMWikiForgeSettings, indexContent: string): Promise<string> {
    const systemPrompt = `You are an expert knowledge base health inspector. You are given the current index of the user's Obsidian wiki.
Your job is to look for:
- Potential contradictions between pages
- Orphan concepts that should probably have their own pages
- Missing cross-references
- Broad topics that should be broken down

Provide a bulleted list of actionable recommendations. Be concise and use standard Markdown.`;

    if (settings.provider === 'openai') {
        return callOpenAIQuery(settings, systemPrompt, "Please review the following index and provide health recommendations:\n" + indexContent);
    } else if (settings.provider === 'anthropic') {
        return callAnthropicQuery(settings, systemPrompt, "Please review the following index and provide health recommendations:\n" + indexContent);
    } else if (settings.provider === 'ollama') {
        return callOllamaQuery(settings, systemPrompt, "Please review the following index and provide health recommendations:\n" + indexContent);
    } else {
        throw new Error(`Unsupported provider: ${settings.provider}`);
    }
}

export async function callLLMForQuery(settings: LLMWikiForgeSettings, query: string, indexContent: string): Promise<string> {
    const systemPrompt = `You are an expert knowledge base assistant. You are given the current index of the user's Obsidian wiki.
Your job is to answer the user's query based on the index or general knowledge, and optionally suggest they create new pages.
Whenever you mention a topic that exists in the index, use Obsidian [[Wikilinks]].

Here is the current Wiki Index:
${indexContent}
`;

    if (settings.provider === 'openai') {
        return callOpenAIQuery(settings, systemPrompt, query);
    } else if (settings.provider === 'anthropic') {
        return callAnthropicQuery(settings, systemPrompt, query);
    } else if (settings.provider === 'ollama') {
        return callOllamaQuery(settings, systemPrompt, query);
    } else {
        throw new Error(`Unsupported provider: ${settings.provider}`);
    }
}


async function callOllamaIngest(settings: LLMWikiForgeSettings, userPrompt: string): Promise<IngestResult> {
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
                { role: 'user', content: userPrompt }
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

async function callOpenAIIngest(settings: LLMWikiForgeSettings, userPrompt: string): Promise<IngestResult> {
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
                { role: 'user', content: userPrompt }
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

async function callAnthropicIngest(settings: LLMWikiForgeSettings, userPrompt: string): Promise<IngestResult> {
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
                { role: 'user', content: userPrompt }
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

async function callOllamaQuery(settings: LLMWikiForgeSettings, systemPrompt: string, userPrompt: string): Promise<string> {
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
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            stream: false,
            options: {
                temperature: 0.7
            }
        })
    });

    if (response.status !== 200) {
        throw new Error(`Ollama Error: ${response.text}`);
    }

    return response.json.message.content;
}

async function callOpenAIQuery(settings: LLMWikiForgeSettings, systemPrompt: string, userPrompt: string): Promise<string> {
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
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.7
        })
    });

    if (response.status !== 200) {
        throw new Error(`OpenAI Error: ${response.text}`);
    }

    return response.json.choices[0].message.content;
}

async function callAnthropicQuery(settings: LLMWikiForgeSettings, systemPrompt: string, userPrompt: string): Promise<string> {
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
            system: systemPrompt,
            messages: [
                { role: 'user', content: userPrompt }
            ],
            max_tokens: 4000,
            temperature: 0.7
        })
    });

    if (response.status !== 200) {
        throw new Error(`Anthropic Error: ${response.text}`);
    }

    return response.json.content[0].text;
}
