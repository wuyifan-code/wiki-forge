import { requestUrl } from 'obsidian';
import { LLMWikiForgeSettings } from './main';

export interface IngestResult {
    wikiContent: string;
    suggestedFilename: string;
    logEntry: string;
    indexEntry: string;
}

const SYSTEM_PROMPT = `You are an expert knowledge base maintainer acting as an "LLM Wiki Forge".
Your job is to read a raw source document, extract its key information, and integrate it into a personal wiki.

You should return your answer EXACTLY as a JSON object with four keys:
1. "suggestedFilename": A short, hyphen-separated filename for the new wiki page (e.g., "concept-attention-mechanism"). Do NOT include the .md extension.
2. "wikiContent": The full markdown content of the new wiki page. This should include a title, a short summary of the source, the key insights, and cross-references (using [[Double Bracket]] notation) to concepts/entities mentioned. Add YAML frontmatter at the top with "type: source-summary" and "source: [filename]".
3. "logEntry": A one-line string to append to the chronological log.md file. Format: "- [YYYY-MM-DD] Ingested | [Source Title] -> [[suggestedFilename]]"
4. "indexEntry": A one-line string to insert into the index.md file. Format: "- [[suggestedFilename]]: A short one-sentence summary of what this page is about."

CRITICAL: Return ONLY valid JSON. Do not include markdown codeblocks (\`\`\`json) or any conversational text before or after the JSON.
`;

export async function callLLMForIngest(settings: LLMWikiForgeSettings, sourceContent: string, sourceFilename: string): Promise<IngestResult> {
    const userPrompt = `Source filename: ${sourceFilename}\n\nSource Content:\n${sourceContent}`;

    if (settings.provider === 'openai') {
        return callOpenAI(settings, userPrompt);
    } else if (settings.provider === 'anthropic') {
        return callAnthropic(settings, userPrompt);
    } else {
        throw new Error(`Unsupported provider: ${settings.provider}`);
    }
}

async function callOpenAI(settings: LLMWikiForgeSettings, userPrompt: string): Promise<IngestResult> {
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
                { role: 'system', content: SYSTEM_PROMPT },
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

async function callAnthropic(settings: LLMWikiForgeSettings, userPrompt: string): Promise<IngestResult> {
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
            system: SYSTEM_PROMPT,
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
