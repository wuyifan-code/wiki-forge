import { App, Plugin, PluginSettingTab, Setting, WorkspaceLeaf, Notice, TFile } from 'obsidian';
import { LLMWikiView, VIEW_TYPE_LLM_WIKI } from './view';

export interface LLMWikiForgeSettings {
    apiKey: string;
    provider: 'openai' | 'anthropic' | 'ollama';
    model: string;
    ollamaEndpoint: string;
    sourceFolder: string;
    wikiFolder: string;
    indexFile: string;
    logFile: string;
}

const DEFAULT_SETTINGS: LLMWikiForgeSettings = {
    apiKey: '',
    provider: 'openai',
    model: 'gpt-4o-mini',
    ollamaEndpoint: 'http://localhost:11434',
    sourceFolder: '_source',
    wikiFolder: 'wiki',
    indexFile: 'wiki/index.md',
    logFile: 'wiki/log.md'
};

export default class LLMWikiForgePlugin extends Plugin {
    settings: LLMWikiForgeSettings;

    async onload() {
        console.log('Loading LLM Wiki Forge Plugin');
        await this.loadSettings();

        this.registerView(
            VIEW_TYPE_LLM_WIKI,
            (leaf) => new LLMWikiView(leaf, this)
        );

        this.addRibbonIcon('library', 'Open LLM Wiki Forge', () => {
            this.activateView();
        });

        this.addCommand({
            id: 'open-llm-wiki-forge-view',
            name: 'Open LLM Wiki Forge view',
            callback: () => {
                this.activateView();
            }
        });

        this.addSettingTab(new LLMWikiForgeSettingTab(this.app, this));
    }

    async activateView() {
        const { workspace } = this.app;

        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_LLM_WIKI);

        if (leaves.length > 0) {
            // A leaf with our view already exists, use that
            leaf = leaves[0];
        } else {
            // Our view could not be found in the workspace, create a new leaf
            // in the right sidebar for it
            const rightLeaf = workspace.getRightLeaf(false);
            if (rightLeaf) {
                leaf = rightLeaf;
                await leaf.setViewState({ type: VIEW_TYPE_LLM_WIKI, active: true });
            }
        }

        // "Reveal" the leaf in case it is in a collapsed sidebar
        if (leaf) {
            workspace.revealLeaf(leaf);
        }
    }

    async handleLint(onUpdate: (text: string) => void) {
        try {
            const { callLLMForLint } = await import('./llm');
            let indexContent = "Index file not found or empty.";

            const indexFile = this.app.vault.getAbstractFileByPath(this.settings.indexFile) as TFile;
            if (indexFile) {
                indexContent = await this.app.vault.read(indexFile);
            } else {
                onUpdate("No index file found to analyze.");
                return;
            }

            const response = await callLLMForLint(this.settings, indexContent);
            onUpdate(response);
        } catch(e) {
            console.error("Lint error:", e);
            onUpdate(`Error: ${e.message}`);
        }
    }

    async handleQuery(query: string, onUpdate: (text: string) => void) {
        try {
            const { callLLMForQuery } = await import('./llm');
            let indexContent = "Index file not found or empty.";

            const indexFile = this.app.vault.getAbstractFileByPath(this.settings.indexFile) as TFile;
            if (indexFile) {
                indexContent = await this.app.vault.read(indexFile);
            }

            const response = await callLLMForQuery(this.settings, query, indexContent);
            onUpdate(response);
        } catch(e) {
            console.error("Query error:", e);
            onUpdate(`Error: ${e.message}`);
        }
    }

    async ingestSource(file: TFile, onStatus?: (status: string) => void) {
        new Notice(`Ingesting ${file.name}...`);
        if(onStatus) onStatus("Reading File...");
        try {
            const content = await this.app.vault.read(file);
            const { callLLMForIngest } = await import('./llm');

            if(onStatus) onStatus("Calling LLM...");
            const result = await callLLMForIngest(this.settings, content, file.name);

            if(onStatus) onStatus("Writing to Wiki...");
            // 1. Ensure wiki folder exists
            const wikiFolderPath = this.settings.wikiFolder;
            if (!(this.app.vault.getAbstractFileByPath(wikiFolderPath))) {
                await this.app.vault.createFolder(wikiFolderPath);
            }

            // 2. Create the new wiki page
            const newFilePath = `${wikiFolderPath}/${result.suggestedFilename}.md`;
            let wikiFile = this.app.vault.getAbstractFileByPath(newFilePath) as TFile;
            if (wikiFile) {
                // If it exists, we might want to append or overwrite. For now, let's append to avoid data loss, or just overwrite.
                // Let's overwrite for simplicity of this MVP but notify the user.
                new Notice(`Overwriting existing ${newFilePath}`);
                await this.app.vault.modify(wikiFile, result.wikiContent);
            } else {
                wikiFile = await this.app.vault.create(newFilePath, result.wikiContent);
            }

            // 3. Append to log file
            const logFilePath = this.settings.logFile;
            let logFile = this.app.vault.getAbstractFileByPath(logFilePath) as TFile;
            const logLine = result.logEntry.replace('[YYYY-MM-DD]', new Date().toISOString().split('T')[0]) + '\n';
            if (logFile) {
                await this.app.vault.append(logFile, logLine);
            } else {
                // ensure parent folder exists
                const logParts = logFilePath.split('/');
                if (logParts.length > 1) {
                    const logFolder = logParts.slice(0, -1).join('/');
                    if (!(this.app.vault.getAbstractFileByPath(logFolder))) {
                        await this.app.vault.createFolder(logFolder);
                    }
                }
                await this.app.vault.create(logFilePath, "# Ingestion Log\n\n" + logLine);
            }

            // 4. Append to index file
            const indexFilePath = this.settings.indexFile;
            let indexFile = this.app.vault.getAbstractFileByPath(indexFilePath) as TFile;
            const indexLine = result.indexEntry + '\n';
            if (indexFile) {
                await this.app.vault.append(indexFile, indexLine);
            } else {
                // ensure parent folder exists
                const indexParts = indexFilePath.split('/');
                if (indexParts.length > 1) {
                    const indexFolder = indexParts.slice(0, -1).join('/');
                    if (!(this.app.vault.getAbstractFileByPath(indexFolder))) {
                        await this.app.vault.createFolder(indexFolder);
                    }
                }
                await this.app.vault.create(indexFilePath, "# Wiki Index\n\n" + indexLine);
            }

            new Notice(`Successfully ingested ${file.name} to ${newFilePath}`);
        } catch (e) {
            console.error("Ingestion error:", e);
            new Notice(`Failed to ingest ${file.name}: ${e.message}`);
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

class LLMWikiForgeSettingTab extends PluginSettingTab {
    plugin: LLMWikiForgePlugin;

    constructor(app: App, plugin: LLMWikiForgePlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName('Provider')
            .setDesc('Choose your LLM provider')
            .addDropdown(drop => drop
                .addOption('openai', 'OpenAI')
                .addOption('anthropic', 'Anthropic')
                .addOption('ollama', 'Ollama (Local)')
                .setValue(this.plugin.settings.provider)
                .onChange(async (value: 'openai' | 'anthropic' | 'ollama') => {
                    this.plugin.settings.provider = value;
                    await this.plugin.saveSettings();
                    this.display(); // Redraw to update settings fields
                }));

        if (this.plugin.settings.provider === 'ollama') {
            new Setting(containerEl)
                .setName('Ollama Endpoint')
                .setDesc('Default is http://localhost:11434')
                .addText(text => text
                    .setPlaceholder('http://localhost:11434')
                    .setValue(this.plugin.settings.ollamaEndpoint)
                    .onChange(async (value) => {
                        this.plugin.settings.ollamaEndpoint = value;
                        await this.plugin.saveSettings();
                    }));
        } else {
            new Setting(containerEl)
                .setName('API Key')
                .setDesc('Your API key for the chosen provider')
                .addText(text => text
                    .setPlaceholder('Enter your API key')
                    .setValue(this.plugin.settings.apiKey)
                    .onChange(async (value) => {
                        this.plugin.settings.apiKey = value;
                        await this.plugin.saveSettings();
                    }));
        }

        new Setting(containerEl)
            .setName('Model')
            .setDesc('Model to use (e.g. gpt-4o, claude-3-5-sonnet-20240620)')
            .addText(text => text
                .setPlaceholder('Enter model name')
                .setValue(this.plugin.settings.model)
                .onChange(async (value) => {
                    this.plugin.settings.model = value;
                    await this.plugin.saveSettings();
                }));

        containerEl.createEl('h3', { text: 'Directory & File Settings' });

        new Setting(containerEl)
            .setName('Source Folder')
            .setDesc('Folder containing raw sources to ingest (e.g., _source)')
            .addText(text => text
                .setPlaceholder('_source')
                .setValue(this.plugin.settings.sourceFolder)
                .onChange(async (value) => {
                    this.plugin.settings.sourceFolder = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Wiki Folder')
            .setDesc('Folder where generated wiki pages will be saved')
            .addText(text => text
                .setPlaceholder('wiki')
                .setValue(this.plugin.settings.wikiFolder)
                .onChange(async (value) => {
                    this.plugin.settings.wikiFolder = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Index File')
            .setDesc('Path to the index file (e.g., wiki/index.md)')
            .addText(text => text
                .setPlaceholder('wiki/index.md')
                .setValue(this.plugin.settings.indexFile)
                .onChange(async (value) => {
                    this.plugin.settings.indexFile = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Log File')
            .setDesc('Path to the log file (e.g., wiki/log.md)')
            .addText(text => text
                .setPlaceholder('wiki/log.md')
                .setValue(this.plugin.settings.logFile)
                .onChange(async (value) => {
                    this.plugin.settings.logFile = value;
                    await this.plugin.saveSettings();
                }));
    }
}
