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

    activeTab: 'ingest' | 'query' | 'lint' = 'ingest';

    async onOpen() {
        const container = this.containerEl.children[1];
        container.empty();

        container.createEl("h3", { text: "LLM Wiki Forge" });

        const tabsContainer = container.createDiv({ cls: "llm-wiki-forge-tabs" });

        const tabIngest = tabsContainer.createEl("div", { cls: `llm-wiki-forge-tab ${this.activeTab === 'ingest' ? 'active' : ''}`, text: "Ingest" });
        const tabQuery = tabsContainer.createEl("div", { cls: `llm-wiki-forge-tab ${this.activeTab === 'query' ? 'active' : ''}`, text: "Query" });
        const tabLint = tabsContainer.createEl("div", { cls: `llm-wiki-forge-tab ${this.activeTab === 'lint' ? 'active' : ''}`, text: "Lint" });

        const contentContainer = container.createDiv({ cls: "llm-wiki-forge-content-container" });

        const renderActiveTab = () => {
            contentContainer.empty();
            tabIngest.classList.toggle('active', this.activeTab === 'ingest');
            tabQuery.classList.toggle('active', this.activeTab === 'query');
            tabLint.classList.toggle('active', this.activeTab === 'lint');

            if (this.activeTab === 'ingest') {
                this.renderIngestTab(contentContainer);
            } else if (this.activeTab === 'query') {
                this.renderQueryTab(contentContainer);
            } else if (this.activeTab === 'lint') {
                this.renderLintTab(contentContainer);
            }
        };

        tabIngest.onclick = () => { this.activeTab = 'ingest'; renderActiveTab(); };
        tabQuery.onclick = () => { this.activeTab = 'query'; renderActiveTab(); };
        tabLint.onclick = () => { this.activeTab = 'lint'; renderActiveTab(); };

        renderActiveTab();
    }

    async renderIngestTab(container: HTMLElement) {
        container.empty();
        const { sourceFolder } = this.plugin.settings;

        container.createEl("p", { text: `Sources from: ${sourceFolder}` });

        const files = this.app.vault.getFiles().filter(file => file.path.startsWith(sourceFolder + '/'));

        if (files.length === 0) {
            container.createEl("p", { text: "No source files found." });
            return;
        }

        const list = container.createDiv();
        for (const file of files) {
            const listItem = list.createDiv({ cls: "llm-wiki-source-item" });
            listItem.style.display = "flex";
            listItem.style.justifyContent = "space-between";
            listItem.style.alignItems = "center";

            const nameSpan = listItem.createEl("span", { text: file.name });
            nameSpan.style.cursor = "pointer";
            nameSpan.onclick = () => {
                this.app.workspace.getLeaf(false).openFile(file);
            };

            const actionDiv = listItem.createDiv();
            const statusSpan = actionDiv.createEl("span", { text: "", cls: "ingest-status" });
            statusSpan.style.marginRight = "8px";
            statusSpan.style.fontSize = "0.8em";
            statusSpan.style.color = "var(--text-muted)";

            const ingestBtn = actionDiv.createEl("button", { text: "Ingest" });
            ingestBtn.onclick = async () => {
                ingestBtn.disabled = true;
                statusSpan.innerText = "Reading...";
                try {
                    // Update main plugin to return status or accept a callback for UI updates
                    await this.plugin.ingestSource(file, (status) => {
                        statusSpan.innerText = status;
                    });
                    statusSpan.innerText = "Done";
                    statusSpan.style.color = "var(--text-success)";
                } catch (e) {
                    console.error("Ingest failed", e);
                    statusSpan.innerText = "Failed";
                    statusSpan.style.color = "var(--text-error)";
                } finally {
                    ingestBtn.disabled = false;
                    ingestBtn.innerText = "Re-Ingest";
                }
            };
        }
    }

    chatHistory: {role: string, content: string}[] = [];

    async renderQueryTab(container: HTMLElement) {
        container.empty();

        const messagesContainer = container.createDiv({ cls: "llm-wiki-chat-messages" });

        for (const msg of this.chatHistory) {
            messagesContainer.createDiv({
                cls: `llm-wiki-chat-message ${msg.role}`,
                text: msg.content
            });
        }

        const inputContainer = container.createDiv({ cls: "llm-wiki-chat-input-container" });
        inputContainer.style.display = "flex";
        inputContainer.style.gap = "8px";
        inputContainer.style.marginTop = "auto";

        const inputEl = inputContainer.createEl("textarea", { cls: "llm-wiki-chat-input" });
        inputEl.placeholder = "Ask your wiki something...";
        inputEl.style.flexGrow = "1";
        inputEl.style.resize = "vertical";

        const sendBtn = inputContainer.createEl("button", { text: "Send" });

        const handleSend = async () => {
            const text = inputEl.value.trim();
            if(!text) return;

            inputEl.value = "";
            sendBtn.disabled = true;

            this.chatHistory.push({ role: 'user', content: text });
            messagesContainer.createDiv({ cls: "llm-wiki-chat-message user", text });
            messagesContainer.scrollTop = messagesContainer.scrollHeight;

            const assistantMsgDiv = messagesContainer.createDiv({ cls: "llm-wiki-chat-message assistant", text: "Thinking..." });
            messagesContainer.scrollTop = messagesContainer.scrollHeight;

            await this.plugin.handleQuery(text, (response) => {
                assistantMsgDiv.innerText = response;
                this.chatHistory.push({ role: 'assistant', content: response });
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            });

            sendBtn.disabled = false;
        };

        sendBtn.onclick = handleSend;
        inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
            }
        });
    }

    async renderLintTab(container: HTMLElement) {
        container.empty();

        container.createEl("p", { text: "Run a Health Check on your Wiki to find contradictions, orphan pages, and missing links." });

        const btnDiv = container.createDiv();
        btnDiv.style.marginBottom = "16px";
        const runBtn = btnDiv.createEl("button", { text: "Run Health Check" });

        const resultsContainer = container.createDiv({ cls: "llm-wiki-lint-results" });
        resultsContainer.style.whiteSpace = "pre-wrap";
        resultsContainer.style.backgroundColor = "var(--background-secondary)";
        resultsContainer.style.padding = "12px";
        resultsContainer.style.borderRadius = "8px";
        resultsContainer.style.display = "none";

        runBtn.onclick = async () => {
            runBtn.disabled = true;
            runBtn.innerText = "Analyzing...";
            resultsContainer.style.display = "block";
            resultsContainer.innerText = "Reading index and consulting LLM...";

            await this.plugin.handleLint((response) => {
                resultsContainer.innerText = response;
            });

            runBtn.disabled = false;
            runBtn.innerText = "Run Health Check";
        };
    }

    async onClose() {
        // Cleanup if needed
    }
}
