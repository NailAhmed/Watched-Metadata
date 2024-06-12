import { Plugin, FuzzySuggestModal, PluginSettingTab, Setting } from "obsidian";

const DEFAULT_SETTINGS = {
  headerGroups: [
    {
      watchedField: "exampleField",
      header: "",
      active: true,
    },
  ],
  commandGroups: [
    {
      watchedField: "exampleField",
      command: "",
      active: true,
    },
  ],
};

class MetadataWatcherPlugin extends Plugin {
  settings: typeof DEFAULT_SETTINGS;
  lastMetadataValues: { [key: string]: any } = {};

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new MetadataWatcherSettingTab(this.app, this));
    this.registerEvent(this.app.metadataCache.on("changed", this.onMetadataChanged.bind(this)));
    this.registerEvent(this.app.workspace.on("file-open", this.onFileOpen.bind(this)));
    await this.initializeLastMetadataValues();
  }

  async initializeLastMetadataValues() {
    const files = this.app.vault.getMarkdownFiles();
    for (const file of files) {
      await this.updateLastMetadataValues(file);
    }
  }

  async onFileOpen(file) {
    await this.updateLastMetadataValues(file);
  }

  async updateLastMetadataValues(file) {
    const metadata = this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (metadata) {
      for (const group of [...this.settings.headerGroups, ...this.settings.commandGroups]) {
        if (group.active && metadata[group.watchedField]) {
          this.lastMetadataValues[`${file.path}-${group.watchedField}`] = metadata[group.watchedField];
        }
      }
    }
  }

  async onMetadataChanged(file) {
    const metadata = this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (metadata) {
      await this.processHeaderGroups(file, metadata);
      await this.processCommandGroups(file, metadata);
    }
  }

  async processHeaderGroups(file, metadata) {
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

  async processCommandGroups(file, metadata) {
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

  replaceHeaderWithMetadataValue(content, header, valueToInsert) {
    const headerRegex = new RegExp(`^(${header})(.*)$`, "m");
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

class CommandSuggestModal extends FuzzySuggestModal {
  plugin: MetadataWatcherPlugin;
  onChooseItem: (item: any) => void;

  constructor(app, plugin, onChooseItem) {
    super(app);
    this.plugin = plugin;
    this.onChooseItem = onChooseItem;
  }

  getItems() {
    return this.app.commands.listCommands();
  }

  getItemText(item) {
    return item.name;
  }

  onChooseItem(item, evt) {
    this.onChooseItem(item);
  }

  renderSuggestion(item, el) {
    const command = item.item;
    const query = this.inputEl.value;
    const matchedName = this.highlight(command.name, query);
    const div = el.createEl("div", { cls: "suggestion-content" });
    div.innerHTML = matchedName;
  }

  highlight(text, query) {
    const regex = new RegExp(`(${this.escapeRegExp(query)})`, "gi");
    return text.replace(regex, "<mark>$1</mark>");
  }

  escapeRegExp(text) {
    return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
  }

  normalizeText(text) {
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  getSuggestions(query) {
    const normalizedQuery = this.normalizeText(query);
    return this.getItems()
      .map((item) => ({
        item,
        score: this.fuzzyMatch(this.normalizeText(item.name), normalizedQuery),
      }))
      .filter((match) => match.score > -1)
      .sort((a, b) => a.score - b.score);
  }

  fuzzyMatch(text, query) {
    const index = text.indexOf(query);
    return index > -1 ? index : Number.MAX_SAFE_INTEGER;
  }
}

class MetadataWatcherSettingTab extends PluginSettingTab {
  plugin: MetadataWatcherPlugin;
  activeTab: string;

  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.activeTab = "header";
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    const tabsEl = containerEl.createEl("div", { cls: "mod-setting-tabs" });

    const headerTab = tabsEl.createEl("button", { text: "Header groups" });
    const commandTab = tabsEl.createEl("button", { text: "Command groups", cls: "mod-setting-tab" });

    const headerSection = containerEl.createEl("div", { cls: "" });
    const commandSection = containerEl.createEl("div", { cls: "mod-setting-section" });

    const switchToHeaderTab = () => {
      headerSection.show();
      commandSection.hide();
      this.activeTab = "header";
      headerTab.classList.add("mod-cta");
      commandTab.classList.remove("mod-cta");
    };

    const switchToCommandTab = () => {
      headerSection.hide();
      commandSection.show();
      this.activeTab = "command";
      commandTab.classList.add("mod-cta");
      headerTab.classList.remove("mod-cta");
    };

    headerTab.addEventListener("click", switchToHeaderTab);
    commandTab.addEventListener("click", switchToCommandTab);

    if (this.activeTab === "header") {
      switchToHeaderTab();
    } else {
      switchToCommandTab();
    }

    this.createHeaderGroupSettings(headerSection);
    this.createCommandGroupSettings(commandSection);
  }

  createHeaderGroupSettings(containerEl) {
    const headerSetting = new Setting(containerEl);
    headerSetting.setName('Header replacement groups').setHeading();

    containerEl.createEl("p", { text: "Configure header replacement groups based on metadata fields." });
    this.plugin.settings.headerGroups.forEach((group, index) => {
      this.createHeaderGroupSetting(containerEl, group, index);
    });

    const addHeaderGroupButton = containerEl.createEl("button", { text: "Add header group" });
    addHeaderGroupButton.classList.add("mod-cta");
    addHeaderGroupButton.addEventListener("click", async () => {
      this.plugin.settings.headerGroups.push({
        watchedField: "",
        header: "",
        active: true,
      });
      await this.plugin.saveSettings();
      this.display();
    });
    containerEl.appendChild(addHeaderGroupButton);

    // Add donation section
    this.addDonationSection(containerEl);
  }

  createCommandGroupSettings(containerEl) {
    const commandSetting = new Setting(containerEl);
    commandSetting.setName('Command execution groups').setHeading();

    containerEl.createEl("p", { text: "Configure command execution groups based on metadata fields." });
    this.plugin.settings.commandGroups.forEach((group, index) => {
      this.createCommandGroupSetting(containerEl, group, index);
    });

    const addCommandGroupButton = containerEl.createEl("button", { text: "Add command group" });
    addCommandGroupButton.classList.add("mod-cta");
    addCommandGroupButton.addEventListener("click", async () => {
      this.plugin.settings.commandGroups.push({
        watchedField: "",
        command: "",
        active: true,
      });
      await this.plugin.saveSettings();
      this.display();
    });
    containerEl.appendChild(addCommandGroupButton);

    // Add donation section
    this.addDonationSection(containerEl);
  }

  createHeaderGroupSetting(containerEl, group, index) {
    const groupEl = containerEl.createEl("div", { cls: "mod-metadata-watcher-group" });
    groupEl.addClass("metadata-watcher-group");
    const setting = new Setting(groupEl)
      .setName(`Header group ${index + 1}`)
      .addText((text) =>
        text
          .setPlaceholder("Enter field name")
          .setValue(group.watchedField)
          .onChange(async (value) => {
            group.watchedField = value;
            await this.plugin.saveSettings();
          })
      )
      .addText((text) =>
        text
          .setPlaceholder("Enter header text")
          .setValue(group.header)
          .onChange(async (value) => {
            group.header = value;
            await this.plugin.saveSettings();
          })
      )
      .addToggle((toggle) => toggle.setValue(group.active).onChange(async (value) => {
        group.active = value;
        await this.plugin.saveSettings();
      }));

    const removeButton = groupEl.createEl("button", { text: "Remove group", cls: "mod-warning" });
    removeButton.addEventListener("click", async () => {
      this.plugin.settings.headerGroups.splice(index, 1);
      await this.plugin.saveSettings();
      this.display();
    });
    setting.controlEl.appendChild(removeButton);
    const addButton = containerEl.querySelector("button.mod-cta");
    containerEl.insertBefore(groupEl, addButton);
  }

  createCommandGroupSetting(containerEl, group, index) {
    const groupEl = containerEl.createEl("div", { cls: "mod-metadata-watcher-group" });
    groupEl.addClass("metadata-watcher-group");
    const setting = new Setting(groupEl)
      .setName(`Command group ${index + 1}`)
      .addText((text) =>
        text
          .setPlaceholder("Enter field name")
          .setValue(group.watchedField)
          .onChange(async (value) => {
            group.watchedField = value;
            await this.plugin.saveSettings();
          })
      )
      .addButton((button) => {
        const commandName = this.plugin.app.commands.findCommand(group.command)?.name || "Select command";
        button.setButtonText(commandName).onClick(() => {
          new CommandSuggestModal(this.app, this.plugin, (command) => {
            group.command = command.id;
            this.plugin.saveSettings();
            this.display();
          }).open();
        });
      })
      .addToggle((toggle) => toggle.setValue(group.active).onChange(async (value) => {
        group.active = value;
        await this.plugin.saveSettings();
      }));

    const removeButton = groupEl.createEl("button", { text: "Remove group", cls: "mod-warning" });
    removeButton.addEventListener("click", async () => {
      this.plugin.settings.commandGroups.splice(index, 1);
      await this.plugin.saveSettings();
      this.display();
    });
    setting.controlEl.appendChild(removeButton);
    const addButton = containerEl.querySelector("button.mod-cta-secondary");
    containerEl.insertBefore(groupEl, addButton);
  }

  addDonationSection(containerEl) {
    const donateSection = containerEl.createEl("div", { cls: "donate-section" });
    donateSection.createEl("p", {
      text: "If you find this plugin useful, click below to support its development!",
    });
    const donateButton = donateSection.createEl("a", {
      href: "https://www.buymeacoffee.com/NailAhmed",
      target: "_blank",
    });
    donateButton.createEl("img", {
      attr: {
        src: "https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png",
        alt: "Buy Me A Coffee",
        class: "donate-img"
      }
    });
    containerEl.appendChild(donateSection);
  }
}

export default MetadataWatcherPlugin;
