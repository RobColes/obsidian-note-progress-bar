const {
  Plugin,
  PluginSettingTab,
  Setting,
  MarkdownRenderChild,
  MarkdownView,
} = require("obsidian");

const DEFAULT_SETTINGS = {
  // Each character in these strings is treated as one recognised checkbox state.
  // A checkbox whose char isn't in either string is ignored entirely (not counted).

  checkedChars: "xX",
  uncheckedChars: " ?>-/",
};

const CHECKBOX_REGEX = /^[ \t]*(?:[-*+]|\d+[.)]) \[(.)\]/gm;

class ProgressBarChild extends MarkdownRenderChild {
  constructor(plugin, containerEl, filePath) {
    super(containerEl);
    this.plugin = plugin;
    this.filePath = filePath;
  }

  onload() {
    this.refresh();
    this.registerEvent(
      this.plugin.app.workspace.on("editor-change", (editor, info) => {
        if (info && info.file && info.file.path === this.filePath)
          this.refresh();
      }),
    );
    this.registerEvent(
      this.plugin.app.vault.on("modify", (file) => {
        if (file.path === this.filePath) this.refresh();
      }),
    );
  }

  async refresh() {
    const file = this.plugin.app.vault.getAbstractFileByPath(this.filePath);
    if (!file) return;

    let content;
    const activeView =
      this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    if (
      activeView &&
      activeView.file &&
      activeView.file.path === this.filePath
    ) {
      content = activeView.editor.getValue();
    } else {
      content = await this.plugin.app.vault.cachedRead(file);
    }
    this.render(content);
  }

  render(content) {
    const settings = this.plugin.settings;
    const checked = new Set(Array.from(settings.checkedChars));
    const unchecked = new Set(Array.from(settings.uncheckedChars));

    let total = 0;
    let done = 0;
    let match;
    CHECKBOX_REGEX.lastIndex = 0;
    while ((match = CHECKBOX_REGEX.exec(content)) !== null) {
      const ch = match[1];
      if (checked.has(ch)) {
        total++;
        done++;
      } else if (unchecked.has(ch)) {
        total++;
      }
    }
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);

    this.containerEl.empty();
    const container = this.containerEl.createDiv({ cls: "npb-container" });
    container.createDiv({
      cls: "npb-label",
      text: `Progress: ${done}/${total} completed, ${pct}%`,
    });
    const track = container.createDiv({ cls: "npb-track" });
    const fill = track.createDiv({ cls: "npb-fill" });
    fill.setCssProps({ width: pct + "%" });
  }
}

class NoteProgressBarSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("p", {
      text:
        "Enter every checkbox character that should count, with no separators. " +
        'A space represents the default empty checkbox "[ ]". ' +
        "Characters left out of both fields are ignored (not counted).",
    });

    new Setting(containerEl)
      .setName("Checked characters")
      .setDesc("e.g. xX")
      .addText((text) =>
        text
          .setPlaceholder("xX")
          .setValue(this.plugin.settings.checkedChars)
          .onChange(async (value) => {
            this.plugin.settings.checkedChars = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Unchecked characters")
      .setDesc("e.g. (space)?>-/")
      .addText((text) =>
        text
          .setPlaceholder(" ?>-/")
          .setValue(this.plugin.settings.uncheckedChars)
          .onChange(async (value) => {
            this.plugin.settings.uncheckedChars = value;
            await this.plugin.saveSettings();
          }),
      );
  }
}

module.exports = class NoteProgressBarPlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new NoteProgressBarSettingTab(this.app, this));

    this.registerMarkdownCodeBlockProcessor(
      "progress-bar",
      (source, el, ctx) => {
        const child = new ProgressBarChild(this, el, ctx.sourcePath);
        ctx.addChild(child);
      },
    );
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
};
