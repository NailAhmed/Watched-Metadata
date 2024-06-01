import { Plugin, PluginSettingTab, Setting, TFile, Notice, FuzzySuggestModal, Command } from 'obsidian';

const DEFAULT_SETTINGS = {
    headerGroups: [
        {
            watchedField: 'exampleField',
            header: '## Дата Начало',
            active: true
        }
    ],
    commandGroups: [
        {
            watchedField: 'exampleField',
            command: '',
            active: true
        }
    ]
};

class MetadataWatcherPlugin extends Plugin {
    settings: typeof DEFAULT_SETTINGS;
    lastMetadataValues: Record<string, any>;

    async onload() {
        await this.loadSettings();
        this.addSettingTab(new MetadataWatcherSettingTab(this.app, this));

        this.registerEvent(
            this.app.metadataCache.on('changed', this.onMetadataChanged.bind(this))
        );

        this.registerEvent(
            this.app.workspace.on('file-open', this.onFileOpen.bind(this))
        );

        this.lastMetadataValues = {};

        await this.initializeLastMetadataValues();
    }

    async initializeLastMetadataValues() {
        const files = this.app.vault.getMarkdownFiles();
        for (const file of files) {
            await this.updateLastMetadataValues(file);
        }
    }

    async onFileOpen(file: TFile) {
        await this.updateLastMetadataValues(file);
    }

    async updateLastMetadataValues(file: TFile) {
        const metadata = this.app.metadataCache.getFileCache(file)?.frontmatter;
        if (metadata) {
            for (const group of [...this.settings.headerGroups, ...this.settings.commandGroups]) {
                if (group.active && metadata[group.watchedField]) {
                    this.lastMetadataValues[`${file.path}-${group.watchedField}`] = metadata[group.watchedField];
                }
            }
        }
    }

    async onMetadataChanged(file: TFile) {
        const metadata = this.app.metadataCache.getFileCache(file)?.frontmatter;
        if (metadata) {
            await this.processHeaderGroups(file, metadata);
            await this.processCommandGroups(file, metadata);
        }
    }

    async processHeaderGroups(file: TFile, metadata: any) {
        for (const group of this.settings.headerGroups) {
            if (group.active && metadata[group.watchedField]) {
                const currentValue = metadata[group.watchedField];
                const previousValue = this.lastMetadataValues[`${file.path}-${group.watchedField}`];
                if (currentValue !== previousValue) {
                    const fileContent = await this.app.vault.read(file);
                    const updatedContent = this.replaceHeaderWithMetadataValue(fileContent, group.header, currentValue);
                    await this.app.vault.modify(file, updatedContent);
                    this.lastMetadataValues[`${file.path}-${group.watchedField}`] = currentValue;
                }
            }
        }
    }

    async processCommandGroups(file: TFile, metadata: any) {
        for (const group of this.settings.commandGroups) {
            if (group.active && metadata[group.watchedField]) {
                const currentValue = metadata[group.watchedField];
                const previousValue = this.lastMetadataValues[`${file.path}-${group.watchedField}`];
                if (currentValue !== previousValue) {
                    if (previousValue !== undefined) {
                        this.app.commands.executeCommandById(group.command);
                    }
                }
                this.lastMetadataValues[`${file.path}-${group.watchedField}`] = currentValue;
            }
        }
    }

    replaceHeaderWithMetadataValue(content: string, header: string, valueToInsert: string): string {
        const headerRegex = new RegExp(`^(${header})(.*)$`, 'm');
        const replacementText = `$1 ${valueToInsert}`;
        return content.replace(headerRegex, replacementText);
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

class CommandSuggestModal extends FuzzySuggestModal<Command> {
    plugin: MetadataWatcherPlugin;
    onChooseItem: (item: Command) => void;

    constructor(app: App, plugin: MetadataWatcherPlugin, onChooseItem: (item: Command) => void) {
        super(app);
        this.plugin = plugin;
        this.onChooseItem = onChooseItem;
    }

    getItems(): Command[] {
        return this.app.commands.listCommands();
    }

    getItemText(item: Command): string {
        return item.name;
    }

    onChooseItem(item: Command, evt: MouseEvent | KeyboardEvent): void {
        this.onChooseItem(item);
    }

    renderSuggestion(item: FuzzySuggestModal.FuzzyMatch<Command>, el: HTMLElement) {
        const command = item.item;
        const query = this.inputEl.value;
        const matchedName = this.highlight(command.name, query);
        el.createEl('div', { cls: 'suggestion-content' }).innerHTML = matchedName;
    }

    highlight(text: string, query: string): string {
        const regex = new RegExp(`(${this.escapeRegExp(query)})`, 'gi');
        return text.replace(regex, '<mark>$1</mark>');
    }

    escapeRegExp(text: string): string {
        return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    }

    // Normalize text for more flexible matching
    normalizeText(text: string): string {
        return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    }

    getSuggestions(query: string): FuzzySuggestModal.FuzzyMatch<Command>[] {
        const normalizedQuery = this.normalizeText(query);
        return this.getItems()
            .map((item) => ({
                item,
                score: this.fuzzyMatch(this.normalizeText(item.name), normalizedQuery)
            }))
            .filter((match) => match.score > -1)
            .sort((a, b) => a.score - b.score);
    }

    fuzzyMatch(text: string, query: string): number {
        const index = text.indexOf(query);
        return index > -1 ? index : Number.MAX_SAFE_INTEGER;
    }
}

class MetadataWatcherSettingTab extends PluginSettingTab {
    plugin: MetadataWatcherPlugin;
    activeTab: 'header' | 'command';

    constructor(app: App, plugin: MetadataWatcherPlugin) {
        super(app, plugin);
        this.plugin = plugin;
        this.activeTab = 'header'; // По умолчанию активная вкладка "Header Groups"
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();

        // Add tabs for settings categories
        const tabsEl = containerEl.createEl('div', { cls: 'mod-setting-tabs' });
        const headerTab = tabsEl.createEl('button', { text: 'Header Groups' });
        const commandTab = tabsEl.createEl('button', { text: 'Command Groups', cls: 'mod-setting-tab' });

        const headerSection = containerEl.createEl('div', { cls: '' });
        const commandSection = containerEl.createEl('div', { cls: 'mod-setting-section' });

        // Function to switch tabs
        const switchToHeaderTab = () => {
            headerSection.show();
            commandSection.hide();
            this.activeTab = 'header';
            headerTab.classList.add('mod-cta');
            commandTab.classList.remove('mod-cta');
        };

        const switchToCommandTab = () => {
            headerSection.hide();
            commandSection.show();
            this.activeTab = 'command';
            commandTab.classList.add('mod-cta');
            headerTab.classList.remove('mod-cta');
        };

        headerTab.addEventListener('click', switchToHeaderTab);
        commandTab.addEventListener('click', switchToCommandTab);

        // Check and switch to the last active tab
        if (this.activeTab === 'header') {
            switchToHeaderTab();
        } else {
            switchToCommandTab();
        }

        // Header Groups Settings
        this.createHeaderGroupSettings(headerSection);

        // Command Groups Settings
        this.createCommandGroupSettings(commandSection);
    }

    createHeaderGroupSettings(containerEl: HTMLElement) {
        containerEl.createEl('h2', { text: 'Header Replacement Groups' });
        containerEl.createEl('p', { text: 'Configure header replacement groups based on metadata fields.' });

        this.plugin.settings.headerGroups.forEach((group, index) => {
            this.createHeaderGroupSetting(containerEl, group, index);
        });

        const addHeaderGroupButton = containerEl.createEl('button', { text: 'Add Header Group' });
        addHeaderGroupButton.classList.add('mod-cta');
        addHeaderGroupButton.addEventListener('click', async () => {
            this.plugin.settings.headerGroups.push({
                watchedField: '',
                header: '',
                active: true
            });
            await this.plugin.saveSettings();
            this.display();
        });

        // Append the button at the end
        containerEl.appendChild(addHeaderGroupButton);
    }

    createCommandGroupSettings(containerEl: HTMLElement) {
        containerEl.createEl('h2', { text: 'Command Execution Groups' });
        containerEl.createEl('p', { text: 'Configure command execution groups based on metadata fields.' });

        this.plugin.settings.commandGroups.forEach((group, index) => {
            this.createCommandGroupSetting(containerEl, group, index);
        });

        const addCommandGroupButton = containerEl.createEl('button', { text: 'Add Command Group' });
        addCommandGroupButton.classList.add('mod-cta');
        addCommandGroupButton.addEventListener('click', async () => {
            this.plugin.settings.commandGroups.push({
                watchedField: '',
                command: '',
                active: true
            });
            await this.plugin.saveSettings();
            this.display();
        });

        // Append the button at the end
        containerEl.appendChild(addCommandGroupButton);
    }

    createHeaderGroupSetting(containerEl: HTMLElement, group: any, index: number) {
        const groupEl = containerEl.createEl('div', { cls: 'mod-metadata-watcher-group' });
        groupEl.style.borderTop = ' 1px solid var(--background-modifier-border)'; // Установка стиля верхней границы
        groupEl.style.paddingTop = '20px'; // Установка отступа от верхней границы
        groupEl.style.paddingBottom = '5px'; // Установка отступа от верхней границы

        const setting = new Setting(groupEl)
            .setName(`Header Group ${index + 1}`)
            .addText(text => text
                .setPlaceholder('Enter field name')
                .setValue(group.watchedField)
                .onChange(async (value) => {
                    group.watchedField = value;
                    await this.plugin.saveSettings();
                }))
            .addText(text => text
                .setPlaceholder('Enter header text')
                .setValue(group.header)
                .onChange(async (value) => {
                    group.header = value;
                    await this.plugin.saveSettings();
                }))
            .addToggle(toggle => toggle
                .setValue(group.active)
                .onChange(async (value) => {
                    group.active = value;
                    await this.plugin.saveSettings();
                }));

        const removeButton = groupEl.createEl('button', { text: 'Remove Group', cls: 'mod-warning' });
        removeButton.addEventListener('click', async () => {
            this.plugin.settings.headerGroups.splice(index, 1);
            await this.plugin.saveSettings();
            this.display();
        });

        // Move the remove button next to the toggle
        setting.controlEl.appendChild(removeButton);

        // Insert the group element before the add button
        const addButton = containerEl.querySelector('button.mod-cta');
        containerEl.insertBefore(groupEl, addButton);
    }

    createCommandGroupSetting(containerEl: HTMLElement, group: any, index: number) {
        const groupEl = containerEl.createEl('div', { cls: 'mod-metadata-watcher-group' });
        groupEl.style.borderTop = ' 1px solid var(--background-modifier-border)'; // Установка стиля верхней границы
        groupEl.style.paddingTop = '20px'; // Установка отступа от верхней границы
        groupEl.style.paddingBottom = '5px'; // Установка отступа от верхней границы
       
        const setting = new Setting(groupEl)
            .setName(`Command Group ${index + 1}`)
            .addText(text => text
                .setPlaceholder('Enter field name')
                .setValue(group.watchedField)
                .onChange(async (value) => {
                    group.watchedField = value;
                    await this.plugin.saveSettings();
                }))
            .addButton(button => {
                button
                    .setButtonText(group.command ? this.plugin.app.commands.findCommand(group.command)?.name ?? 'Select Command' : 'Select Command')
                    .onClick(() => {
                        new CommandSuggestModal(this.app, this.plugin, (command) => {
                            group.command = command.id;
                            this.plugin.saveSettings();
                            this.display();
                        }).open();
                    });
            })
            .addToggle(toggle => toggle
                .setValue(group.active)
                .onChange(async (value) => {
                    group.active = value;
                    await this.plugin.saveSettings();
                }));

        const removeButton = groupEl.createEl('button', { text: 'Remove Group', cls: 'mod-warning' });
        removeButton.addEventListener('click', async () => {
            this.plugin.settings.commandGroups.splice(index, 1);
            await this.plugin.saveSettings();
            this.display();
        });

        // Move the remove button next to the toggle
        setting.controlEl.appendChild(removeButton);

        // Insert the group element before the add button
        const addButton = containerEl.querySelector('button.mod-cta-secondary');
        containerEl.insertBefore(groupEl, addButton);
    }
}



module.exports = MetadataWatcherPlugin;