export const pluginFiles: Record<string, string> = {
  "manifest.json": `{
  "id": "llm-wiki-agent",
  "name": "Karpathy LLM Wiki",
  "version": "1.0.0",
  "minAppVersion": "0.15.0",
  "description": "Maintains your personal knowledge base using Karpathy's LLM Wiki method.",
  "author": "AI Studio",
  "authorUrl": "",
  "isDesktopOnly": false
}`,
  
  "package.json": `{
  "name": "llm-wiki-agent",
  "version": "1.0.0",
  "description": "An Obsidian plugin that builds and maintains an LLM Wiki.",
  "main": "main.js",
  "scripts": {
    "dev": "node esbuild.config.mjs",
    "build": "tsc -noEmit -skipLibCheck && node esbuild.config.mjs production",
    "version": "node version-bump.mjs && git add manifest.json versions.json"
  },
  "dependencies": {
    "@google/genai": "^0.1.2"
  },
  "devDependencies": {
    "@types/node": "^16.11.29",
    "@typescript-eslint/eslint-plugin": "^5.29.0",
    "@typescript-eslint/parser": "^5.29.0",
    "builtin-modules": "^3.3.0",
    "esbuild": "0.17.3",
    "obsidian": "latest",
    "tslib": "2.4.0",
    "typescript": "4.9.5"
  }
}`,

  "tsconfig.json": `{
  "compilerOptions": {
    "baseUrl": ".",
    "inlineSourceMap": true,
    "inlineSources": true,
    "module": "ESNext",
    "target": "ES6",
    "allowJs": true,
    "noImplicitAny": true,
    "moduleResolution": "node",
    "importHelpers": true,
    "isolatedModules": true,
    "strictNullChecks": true,
    "lib": ["DOM", "ES5", "ES6", "ES7"]
  },
  "include": ["**/*.ts"]
}`,

  "esbuild.config.mjs": `import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";

const prod = (process.argv[2] === "production");

const parameters = {
  entryPoints: ["main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtins],
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
};

if (prod) {
  esbuild.build(parameters).catch(() => process.exit(1));
} else {
  esbuild.context(parameters).then(context => {
    context.watch();
  }).catch(() => process.exit(1));
}`,

  "main.ts": `import { Plugin, WorkspaceLeaf, Notice, TFile } from 'obsidian';
import { LLMWikiSettingTab, DEFAULT_SETTINGS, LLMWikiSettings } from './settings';
import { AgentView, AGENT_VIEW_TYPE } from './AgentView';
import { WikiOperations } from './wiki-operations';

export default class LLMWikiPlugin extends Plugin {
	settings: LLMWikiSettings;
	wikiOps: WikiOperations;

	async onload() {
		await this.loadSettings();
		this.wikiOps = new WikiOperations(this.app, this.settings);

		this.registerView(
			AGENT_VIEW_TYPE,
			(leaf) => new AgentView(leaf, this)
		);

		this.addRibbonIcon('bot', 'Open LLM Wiki Agent', () => {
			this.activateView();
		});

		this.addCommand({
			id: 'open-llm-wiki-agent',
			name: 'Open LLM Wiki Agent',
			callback: () => this.activateView()
		});

		this.addCommand({
			id: 'ingest-current-file',
			name: 'Ingest Current File to Wiki',
			callback: async () => {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile) {
					new Notice(\`Ingesting \${activeFile.basename}...\`);
					try {
						await this.wikiOps.ingestFile(activeFile);
						new Notice(\`Successfully ingested \${activeFile.basename}!\`);
					} catch (e: any) {
						new Notice(\`Failed to ingest: \${e.message}\`);
						console.error(e);
					}
				} else {
					new Notice('No active file to ingest.');
				}
			}
		});

		this.addCommand({
			id: 'lint-wiki',
			name: 'Lint Wiki Health',
			callback: async () => {
				new Notice('Starting Wiki Linting...');
				try {
					await this.wikiOps.lintWiki();
					new Notice('Linting complete. Check log.md for details.');
				} catch (e: any) {
					new Notice(\`Linting failed: \${e.message}\`);
				}
			}
		});

		this.addSettingTab(new LLMWikiSettingTab(this.app, this));
	}

	async activateView() {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(AGENT_VIEW_TYPE);

		if (leaves.length > 0) {
			leaf = leaves[0];
		} else {
			leaf = workspace.getRightLeaf(false);
			if (leaf) {
				await leaf.setViewState({ type: AGENT_VIEW_TYPE, active: true });
			}
		}
		if (leaf) workspace.revealLeaf(leaf);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}`,

  "settings.ts": `import { App, PluginSettingTab, Setting } from 'obsidian';
import type LLMWikiPlugin from './main';

export interface LLMWikiSettings {
	apiType: string;
	apiKey: string;
	baseUrl: string;
	model: string;
	wikiFolder: string;
}

export const DEFAULT_SETTINGS: LLMWikiSettings = {
	apiType: 'gemini',
	apiKey: '',
	baseUrl: '',
	model: 'gemini-2.5-pro',
	wikiFolder: 'Wiki'
}

export class LLMWikiSettingTab extends PluginSettingTab {
	plugin: LLMWikiPlugin;

	constructor(app: App, plugin: LLMWikiPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('API Type')
			.setDesc('Select API provider. Choose "OpenAI Compatible" for Local APIs (Ollama, LM Studio) or Custom Proxies.')
			.addDropdown(dropdown => dropdown
				.addOption('gemini', 'Google Gemini')
				.addOption('openai', 'OpenAI Compatible (Custom/Local)')
				.setValue(this.plugin.settings.apiType)
				.onChange(async (value) => {
					this.plugin.settings.apiType = value;
					await this.plugin.saveSettings();
					this.display();
				}));

		const baseUrlSetting = new Setting(containerEl)
			.setName('Base URL (Custom/Local API)')
			.setDesc('E.g., http://localhost:11434/v1 for Ollama.')
			.addText(text => text
				.setPlaceholder('https://api.openai.com/v1')
				.setValue(this.plugin.settings.baseUrl)
				.onChange(async (value) => {
					this.plugin.settings.baseUrl = value;
					await this.plugin.saveSettings();
				}));
		baseUrlSetting.settingEl.style.display = this.plugin.settings.apiType === 'openai' ? 'flex' : 'none';

		new Setting(containerEl)
			.setName('API Key')
			.setDesc('Required for Gemini or OpenAI. Leave empty if local API does not require one.')
			.addText(text => text
				.setPlaceholder('Enter your API key')
				.setValue(this.plugin.settings.apiKey)
				.onChange(async (value) => {
					this.plugin.settings.apiKey = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Model Name')
			.setDesc('E.g., gemini-2.5-pro, gpt-4o, or llama3.')
			.addText(text => text
				.setPlaceholder('gemini-2.5-pro')
				.setValue(this.plugin.settings.model)
				.onChange(async (value) => {
					this.plugin.settings.model = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Wiki Folder')
			.setDesc('Folder where the LLM will store the index, logs, and generated pages.')
			.addText(text => text
				.setPlaceholder('Wiki')
				.setValue(this.plugin.settings.wikiFolder)
				.onChange(async (value) => {
					this.plugin.settings.wikiFolder = value;
					await this.plugin.saveSettings();
				}));
	}
}`,

  "AgentView.ts": `import { ItemView, WorkspaceLeaf } from 'obsidian';
import type LLMWikiPlugin from './main';

export const AGENT_VIEW_TYPE = 'llm-wiki-agent-view';

export class AgentView extends ItemView {
	plugin: LLMWikiPlugin;

	constructor(leaf: WorkspaceLeaf, plugin: LLMWikiPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType() {
		return AGENT_VIEW_TYPE;
	}

	getDisplayText() {
		return 'LLM Wiki Agent';
	}

	async onOpen() {
		const container = this.containerEl.children[1];
		container.empty();
		container.addClass('llm-wiki-agent-container');
		container.setAttr('style', 'display: flex; flex-direction: column; height: 100%;');

		const header = container.createEl('h3', { text: 'Karpathy LLM Wiki Agent' });
		const desc = container.createEl('p', { text: 'I am your persistent wiki maintainer. Use the commands to Ingest files, or chat with me below to Query your knowledge base.' });

		const chatLog = container.createDiv({ cls: 'chat-log' });
		chatLog.style.overflowY = 'auto';
		chatLog.style.flexGrow = '1';
		chatLog.style.marginBottom = '10px';
		chatLog.style.border = '1px solid var(--background-modifier-border)';
		chatLog.style.padding = '10px';
		chatLog.style.borderRadius = '5px';

		const addMessage = (role: string, content: string) => {
			const msgDiv = chatLog.createDiv();
			msgDiv.style.marginBottom = '8px';
			msgDiv.innerHTML = \`<strong>\${role}:</strong> \${content}\`;
			chatLog.scrollTop = chatLog.scrollHeight;
		};

		addMessage('Agent', 'Ready. What would you like to know?');

		const inputContainer = container.createDiv();
		inputContainer.style.display = 'flex';
		inputContainer.style.gap = '5px';

		const input = inputContainer.createEl('input', { type: 'text', placeholder: 'Ask the wiki...' });
		input.style.flexGrow = '1';

		const submitBtn = inputContainer.createEl('button', { text: 'Send' });

		const handleSubmit = async () => {
			const q = input.value;
			if(!q) return;
			input.value = '';
			addMessage('You', q);
			submitBtn.disabled = true;

			try {
				const response = await this.plugin.wikiOps.queryWiki(q);
				addMessage('Agent', response);
			} catch (e: any) {
				addMessage('System', \`Error: \${e.message}\`);
			} finally {
				submitBtn.disabled = false;
			}
		};

		submitBtn.addEventListener('click', handleSubmit);
		input.addEventListener('keypress', (e) => {
			if (e.key === 'Enter') handleSubmit();
		});
	}

	async onClose() {
		// Cleanup
	}
}`,

  "llm.ts": `import { GoogleGenAI } from '@google/genai';
import { requestUrl } from 'obsidian';
import type { LLMWikiSettings } from './settings';

export class LLMClient {
    private settings: LLMWikiSettings;

    constructor(settings: LLMWikiSettings) {
        this.settings = settings;
    }

    private getGeminiClient() {
        if (!this.settings.apiKey) {
            throw new Error("Gemini API key is missing. Please configure it in the plugin settings.");
        }
        return new GoogleGenAI({ apiKey: this.settings.apiKey });
    }

    async generateText(prompt: string, systemInstruction?: string): Promise<string> {
        if (this.settings.apiType === 'openai') {
            return await this.fetchOpenAI(prompt, systemInstruction, false);
        }

        const ai = this.getGeminiClient();
        const response = await ai.models.generateContent({
            model: this.settings.model,
            contents: prompt,
            config: {
                systemInstruction: systemInstruction
            }
        });
        return response.text || '';
    }

    async extractJson<T>(prompt: string, systemInstruction?: string): Promise<T> {
        if (this.settings.apiType === 'openai') {
            const text = await this.fetchOpenAI(prompt, systemInstruction, true);
            try {
                const jsonMatch = text.match(/\\\`\\\`\\\`json\\n([\\s\\S]*?)\\n\\\`\\\`\\\`/);
                const rawJson = jsonMatch ? jsonMatch[1] : text;
                return JSON.parse(rawJson);
            } catch (e) {
                throw new Error("Failed to parse JSON response from LLM");
            }
        }

        const ai = this.getGeminiClient();
        const response = await ai.models.generateContent({
            model: this.settings.model,
            contents: prompt,
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: "application/json",
            }
        });
        try {
            return JSON.parse(response.text || '{}');
        } catch (e) {
            throw new Error("Failed to parse JSON response from LLM");
        }
    }

    private async fetchOpenAI(prompt: string, systemInstruction?: string, isJson?: boolean): Promise<string> {
        if (!this.settings.baseUrl) throw new Error("Base URL is missing for Custom API.");
        
        const url = \`\${this.settings.baseUrl.replace(/\\/$/, '')}/chat/completions\`;
        const headers: Record<string, string> = {
            "Content-Type": "application/json"
        };
        
        if (this.settings.apiKey) {
            headers["Authorization"] = \`Bearer \${this.settings.apiKey}\`;
        }

        const messages = [];
        if (systemInstruction) {
            messages.push({ role: "system", content: systemInstruction });
        }
        messages.push({ role: "user", content: prompt });

        const body: any = {
            model: this.settings.model,
            messages: messages,
            temperature: 0.1
        };

        if (isJson) {
            body.response_format = { type: "json_object" };
        }

        try {
            const response = await requestUrl({
                url: url,
                method: "POST",
                headers: headers,
                body: JSON.stringify(body)
            });

            if (response.status >= 400) {
                throw new Error(\`API Error: \${response.status} - \${response.text}\`);
            }

            return response.json.choices[0].message.content;
        } catch (e: any) {
            throw new Error(\`Custom API request failed: \${e.message}\`);
        }
    }
}`,

  "wiki-operations.ts": `import { App, TFile, normalizePath } from 'obsidian';
import type { LLMWikiSettings } from './settings';
import { LLMClient } from './llm';

export class WikiOperations {
    private app: App;
    private settings: LLMWikiSettings;
    private llm: LLMClient;

    constructor(app: App, settings: LLMWikiSettings) {
        this.app = app;
        this.settings = settings;
        this.llm = new LLMClient(settings);
    }

    async ensureFolder() {
        const folderPath = this.settings.wikiFolder;
        if (!this.app.vault.getAbstractFileByPath(folderPath)) {
            await this.app.vault.createFolder(folderPath);
        }
    }

    async getFileContent(path: string): Promise<string> {
        const fullPath = normalizePath(path);
        const file = this.app.vault.getAbstractFileByPath(fullPath);
        if (file instanceof TFile) {
            return await this.app.vault.read(file);
        }
        return '';
    }

    async writeOrUpdateFile(path: string, content: string, append: boolean = false) {
        await this.ensureFolder();
        const fullPath = normalizePath(path);
        const file = this.app.vault.getAbstractFileByPath(fullPath);
        
        if (file instanceof TFile) {
            if (append) {
                const current = await this.app.vault.read(file);
                await this.app.vault.modify(file, current + '\\n' + content);
            } else {
                await this.app.vault.modify(file, content);
            }
        } else {
            // Create directly
            await this.app.vault.create(fullPath, content);
        }
    }

    async logAction(action: string, detail: string) {
        const date = new Date().toISOString().split('T')[0];
        const logEntry = \`## [\${date}] \${action} | \${detail}\\n\`;
        await this.writeOrUpdateFile(\`\${this.settings.wikiFolder}/log.md\`, logEntry, true);
    }

    async updateIndex(pages: {filename: string, summary: string}[]) {
        const indexPath = \`\${this.settings.wikiFolder}/index.md\`;
        let indexContent = await this.getFileContent(indexPath);
        
        if (!indexContent) {
            indexContent = "# Wiki Index\\n\\n";
        }

        pages.forEach(page => {
            const entry = \`- [[\${page.filename}]]: \${page.summary}\`;
            if (!indexContent.includes(page.filename)) {
                indexContent += \`\\n\${entry}\`;
            }
        });

        await this.writeOrUpdateFile(indexPath, indexContent);
    }

    async ingestFile(file: TFile) {
        const content = await this.app.vault.read(file);
        const filename = file.basename;

        const systemPrompt = "You are a Wiki Maintainer agent based on Karpathy's method. You read raw sources and extract structured knowledge. Provide output in JSON: { \\"summary\\": \\"brief 1 line summary\\", \\"entities\\": [{ \\"title\\": \\"Concept or Entity Name\\", \\"content\\": \\"Markdown page content compiling knowledge about this entity from the source.\\" }] }";
        
        const res = await this.llm.extractJson<{
            summary: string, 
            entities: {title: string, content: string}[]
        }>(\`Source filename: \${filename}\\n\\n\${content}\`, systemPrompt);

        const indexUpdates = [];
        indexUpdates.push({ filename: filename, summary: res.summary });

        for (const entity of res.entities) {
            const safeTitle = entity.title.replace(/[/\\\\?%*:|"<>]/g, '-');
            const path = \`\${this.settings.wikiFolder}/\${safeTitle}.md\`;
            
            let existingContent = await this.getFileContent(path);
            let newContent = entity.content;

            if (existingContent) {
                const mergePrompt = "Merge the new knowledge into the existing wiki page. Keep it structured. Highlight any contradictions.\\n\\nExisting:\\n" + existingContent + "\\n\\nNew:\\n" + newContent;
                newContent = await this.llm.generateText(mergePrompt);
            }
            
            await this.writeOrUpdateFile(path, newContent);
            indexUpdates.push({ filename: safeTitle, summary: \`Entity/Concept page for \${safeTitle}\` });
        }

        await this.updateIndex(indexUpdates);
        await this.logAction('ingest', filename);
    }

    async queryWiki(query: string): Promise<string> {
        const indexPath = \`\${this.settings.wikiFolder}/index.md\`;
        const indexContent = await this.getFileContent(indexPath);

        if (!indexContent) {
            return "The wiki is empty. Ingest some files first!";
        }

        const routingPrompt = \`Given this index of the wiki:\\n\${indexContent}\\n\\nWhich page titles are relevant to answer: "\${query}"? Return JSON: { "filesToRead": ["title1", "title2"] }\`;
        const routingData = await this.llm.extractJson<{filesToRead: string[]}>(routingPrompt);
        
        let context = "";
        for (const title of routingData.filesToRead || []) {
            const path = \`\${this.settings.wikiFolder}/\${title}.md\`;
            const content = await this.getFileContent(path);
            if (content) {
                context += \`\\n\\n--- Page: \${title} ---\\n\${content}\`;
            }
        }

        if (!context) {
             context = "No specific pages found matching the query in the index.";
        }

        const synthesisPrompt = \`System: You are an expert agent querying a personal wiki to answer a question. Answer using ONLY the provided context. Cite the pages.\\n\\nContext:\${context}\\n\\nUser Query: \${query}\`;
        
        const answer = await this.llm.generateText(synthesisPrompt);
        await this.logAction('query', query);
        return answer;
    }

    async lintWiki() {
        const indexPath = \`\${this.settings.wikiFolder}/index.md\`;
        const indexContent = await this.getFileContent(indexPath);

        const prompt = \`Review this wiki index. Identify any potentially orphaned concepts, redundancies, or suggest new areas to explore. Be concise.\\n\\n\${indexContent}\`;
        const report = await this.llm.generateText(prompt);

        await this.logAction('lint', 'Health check performed.');
        const path = \`\${this.settings.wikiFolder}/HealthReport.md\`;
        await this.writeOrUpdateFile(path, report);
        
        return report;
    }
}`
};
