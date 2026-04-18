import { ItemView, WorkspaceLeaf, TFile } from 'obsidian';
import LLMWikiForgePlugin from './main';

export const VIEW_TYPE_LLM_WIKI = "llm-wiki-view";

export class LLMWikiView extends ItemView {
    plugin: LLMWikiForgePlugin;

    constructor(leaf: WorkspaceLeaf, plugin: LLMWikiForgePlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() {
        return VIEW_TYPE_LLM_WIKI;
    }

    getDisplayText() {
        return "LLM Wiki Forge";
    }

    async onOpen() {
        const container = this.containerEl.children[1];
        container.empty();

        container.createEl("h3", { text: "Wiki Forge" });

        const contentDiv = container.createDiv({ cls: "llm-wiki-content" });
        this.renderSourceFiles(contentDiv);
    }

    async renderSourceFiles(container: HTMLElement) {
        container.empty();
        const { sourceFolder } = this.plugin.settings;

        container.createEl("p", { text: `Sources from: ${sourceFolder}` });

        const files = this.app.vault.getFiles().filter(file => file.path.startsWith(sourceFolder + '/'));

        if (files.length === 0) {
            container.createEl("p", { text: "No source files found." });
            return;
        }

        const list = container.createEl("ul");
        for (const file of files) {
            const listItem = list.createEl("li", { cls: "llm-wiki-source-item" });
            listItem.style.display = "flex";
            listItem.style.justifyContent = "space-between";
            listItem.style.marginBottom = "5px";

            const nameSpan = listItem.createEl("span", { text: file.name });
            nameSpan.style.cursor = "pointer";
            nameSpan.onclick = () => {
                this.app.workspace.getLeaf(false).openFile(file);
            };

            const ingestBtn = listItem.createEl("button", { text: "Ingest" });
            ingestBtn.onclick = async () => {
                ingestBtn.disabled = true;
                ingestBtn.innerText = "Ingesting...";
                try {
                    await this.plugin.ingestSource(file);
                } catch (e) {
                    console.error("Ingest failed", e);
                } finally {
                    ingestBtn.disabled = false;
                    ingestBtn.innerText = "Ingest";
                }
            };
        }
    }

    async onClose() {
        // Cleanup if needed
    }
}
