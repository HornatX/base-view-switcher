var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => BaseViewSwitcherPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var DEFAULT_FILE_CONFIG = {
  buttons: [],
  enableDefault: false,
  defaultPosition: "left",
  defaultViewName: "\u4E3B\u89C6\u56FE",
  hideResultCount: true,
  hideSearch: false,
  hideProperties: false,
  hideFilter: false,
  hideSort: false,
  enableCustomViewStyle: false
};
var DEFAULT_SETTINGS = {
  fileConfigs: {}
};
function debounce(func, wait) {
  let timeout = null;
  return function(...args) {
    if (timeout !== null) window.clearTimeout(timeout);
    timeout = window.setTimeout(() => func.apply(this, args), wait);
  };
}
var BaseViewSwitcherPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.viewNameCache = {};
  }
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new BaseViewSwitcherSettingTab(this.app, this));
    this.viewNameCache = {};
    this.debouncedProcessAllViews = debounce(this.processAllViews.bind(this), 250);
    this.observer = new MutationObserver(() => this.debouncedProcessAllViews());
    this.observer.observe(document.body, { childList: true, subtree: true });
    this.app.workspace.onLayoutReady(() => this.processAllViews());
    this.registerEvent(this.app.vault.on("rename", async (file, oldPath) => {
      if (file instanceof import_obsidian.TFile && file.extension === "base" && this.settings.fileConfigs[oldPath]) {
        this.settings.fileConfigs[file.path] = this.settings.fileConfigs[oldPath];
        delete this.settings.fileConfigs[oldPath];
        await this.saveSettings();
      }
    }));
  }
  onunload() {
    if (this.observer) this.observer.disconnect();
    this.app.workspace.iterateAllLeaves((leaf) => {
      const view = leaf.view;
      if (view && view.containerEl) {
        const el = view.containerEl;
        el.classList.remove(
          "bvs-view",
          "bvs-hide-result-count",
          "bvs-hide-search",
          "bvs-hide-properties",
          "bvs-hide-filter",
          "bvs-hide-sort",
          "bvs-custom-view-style"
        );
      }
    });
    document.querySelectorAll(".my-base-btns-container").forEach((el) => el.remove());
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
    document.querySelectorAll(".my-base-btns-container").forEach((el) => el.remove());
    this.processAllViews();
  }
  async getAvailableViewNamesForFile(filePath) {
    if (this.viewNameCache[filePath]) return this.viewNameCache[filePath];
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!file || !(file instanceof import_obsidian.TFile)) return [];
    const names = /* @__PURE__ */ new Set();
    try {
      const content = await this.app.vault.cachedRead(file);
      const parsed = (0, import_obsidian.parseYaml)(content);
      if (parsed && parsed.views && Array.isArray(parsed.views)) {
        parsed.views.forEach((v) => {
          if (v.name) names.add(v.name);
        });
      }
    } catch (e) {
      console.error("YAML \u89E3\u6790\u5931\u8D25", e);
    }
    this.viewNameCache[filePath] = Array.from(names);
    return this.viewNameCache[filePath];
  }
  processAllViews() {
    this.app.workspace.iterateAllLeaves((leaf) => {
      const view = leaf.view;
      if (view && view.file && view.file.extension === "base") {
        this.injectIntoView(view);
      }
    });
  }
  injectIntoView(view) {
    if (!view.file) return;
    const filePath = view.file.path;
    const config = this.settings.fileConfigs[filePath];
    const container = view.containerEl;
    container.classList.add("bvs-view");
    container.classList.remove(
      "bvs-hide-result-count",
      "bvs-hide-search",
      "bvs-hide-properties",
      "bvs-hide-filter",
      "bvs-hide-sort",
      "bvs-custom-view-style"
    );
    const toolbar = container.querySelector(".bases-toolbar");
    if (!config) {
      if (toolbar) {
        const staleBtns = toolbar.querySelector(".my-base-btns-container");
        if (staleBtns) staleBtns.remove();
      }
      return;
    }
    container.classList.toggle("bvs-hide-result-count", config.hideResultCount);
    container.classList.toggle("bvs-hide-search", config.hideSearch);
    container.classList.toggle("bvs-hide-properties", config.hideProperties);
    container.classList.toggle("bvs-hide-filter", config.hideFilter);
    container.classList.toggle("bvs-hide-sort", config.hideSort);
    container.classList.toggle("bvs-custom-view-style", config.enableCustomViewStyle);
    if (!toolbar) return;
    const existingBtnContainer = toolbar.querySelector(".my-base-btns-container");
    if (existingBtnContainer) {
      if (existingBtnContainer.dataset.bvsPath === filePath) {
        return;
      } else {
        existingBtnContainer.remove();
      }
    }
    const firstElement = toolbar.firstElementChild;
    if (!firstElement || !firstElement.parentNode) return;
    const btnContainer = document.createElement("div");
    btnContainer.className = "my-base-btns-container";
    btnContainer.dataset.bvsPath = filePath;
    let renderList = [...config.buttons];
    if (config.enableDefault) {
      const defaultBtn = { icon: "home", viewName: config.defaultViewName, isDefault: true, showText: false };
      if (config.defaultPosition === "left") renderList.unshift(defaultBtn);
      else renderList.push(defaultBtn);
    }
    renderList.forEach((btnConfig) => {
      const btn = document.createElement("div");
      btn.className = "clickable-icon my-base-btn";
      if (btnConfig.showText) {
        btn.classList.add("bvs-text-mode");
      }
      btn.setAttribute("aria-label", `${btnConfig.viewName}`);
      (0, import_obsidian.setIcon)(btn, btnConfig.icon || "layout-grid");
      const textSpan = document.createElement("span");
      textSpan.className = "bvs-btn-text";
      textSpan.innerText = btnConfig.viewName;
      btn.appendChild(textSpan);
      btn.onclick = (e) => {
        e.stopPropagation();
        this.switchView(view, btnConfig.viewName);
      };
      btnContainer.appendChild(btn);
    });
    firstElement.parentNode.insertBefore(btnContainer, firstElement.nextSibling);
  }
  async switchView(targetView, targetViewName) {
    try {
      if (targetView && typeof targetView.getState === "function" && typeof targetView.setState === "function") {
        let state = targetView.getState();
        state.viewName = targetViewName;
        await targetView.setState(state, { history: true });
      } else {
        new import_obsidian.Notice("\u5207\u6362\u5931\u8D25\uFF1A\u65E0\u6CD5\u9501\u5B9A\u89C6\u56FE\u5B9E\u4F8B");
      }
    } catch (error) {
      console.error("Base\u89C6\u56FE\u5207\u6362\u5668\u62A5\u9519:", error);
    }
  }
};
var FileSuggestModal = class extends import_obsidian.FuzzySuggestModal {
  constructor(app, onChoose) {
    super(app);
    this.onChoose = onChoose;
    this.setPlaceholder("\u9009\u62E9\u9700\u8981\u914D\u7F6E\u7684 Base \u6570\u636E\u5E93\u6587\u4EF6...");
  }
  getItems() {
    return this.app.vault.getFiles().filter((f) => f.extension === "base");
  }
  getItemText(file) {
    return file.path;
  }
  onChooseItem(file, evt) {
    this.onChoose(file.path);
  }
};
var ViewNameSuggestModal = class extends import_obsidian.FuzzySuggestModal {
  constructor(app, viewNames, onChoose) {
    super(app);
    this.viewNames = viewNames;
    this.onChoose = onChoose;
    this.setPlaceholder(this.viewNames.length > 0 ? "\u9009\u62E9\u6216\u641C\u7D22\u89C6\u56FE..." : "\u672A\u627E\u5230\u89C6\u56FE\uFF0C\u8BF7\u68C0\u67E5\u6587\u4EF6\u662F\u5426\u4E3A\u7A7A");
  }
  getItems() {
    return this.viewNames;
  }
  getItemText(item) {
    return item;
  }
  onChooseItem(item) {
    this.onChoose(item);
  }
};
var ConfirmModal = class extends import_obsidian.Modal {
  constructor(app, message, onConfirm) {
    super(app);
    this.message = message;
    this.onConfirm = onConfirm;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("p", { text: this.message });
    const btnContainer = contentEl.createDiv({ cls: "modal-button-container" });
    const cancelBtn = btnContainer.createEl("button", { text: "\u53D6\u6D88" });
    cancelBtn.onclick = () => this.close();
    const confirmBtn = btnContainer.createEl("button", { text: "\u5220\u9664", cls: "mod-warning" });
    confirmBtn.onclick = () => {
      this.onConfirm();
      this.close();
    };
  }
  onClose() {
    this.contentEl.empty();
  }
};
var IconSuggestModal = class extends import_obsidian.FuzzySuggestModal {
  constructor(app, onChoose) {
    super(app);
    this.onChoose = onChoose;
    this.setPlaceholder("\u641C\u7D22\u56FE\u6807...");
  }
  getItems() {
    return (0, import_obsidian.getIconIds)();
  }
  getItemText(item) {
    return item;
  }
  renderSuggestion(match, el) {
    el.empty();
    el.style.display = "flex";
    el.style.alignItems = "center";
    const iconEl = el.createSpan();
    iconEl.style.marginRight = "10px";
    iconEl.style.display = "flex";
    (0, import_obsidian.setIcon)(iconEl, match.item);
    el.createSpan({ text: match.item });
  }
  onChooseItem(item) {
    this.onChoose(item);
  }
};
var BaseViewSwitcherSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.currentTab = null;
    this.draggedIndex = null;
  }
  refreshUI() {
    const scrollContainer = this.containerEl.closest(".vertical-tab-content") || this.containerEl.parentElement;
    const currentScroll = scrollContainer ? scrollContainer.scrollTop : 0;
    const currentHeight = this.containerEl.clientHeight;
    if (currentHeight > 0) {
      this.containerEl.style.minHeight = `${currentHeight}px`;
    }
    this.display();
    requestAnimationFrame(() => {
      if (scrollContainer) scrollContainer.scrollTop = currentScroll;
      this.containerEl.style.minHeight = "";
    });
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    this.plugin.viewNameCache = {};
    containerEl.createEl("h2", { text: "Base \u89C6\u56FE\u5207\u6362\u5668\u8BBE\u7F6E" });
    const filePaths = Object.keys(this.plugin.settings.fileConfigs);
    if (filePaths.length > 0 && !this.currentTab) {
      this.currentTab = filePaths[0];
    } else if (filePaths.length === 0) {
      this.currentTab = null;
    }
    const tabsContainer = containerEl.createDiv("bvs-settings-tabs-container");
    filePaths.forEach((path) => {
      const fileName = path.split("/").pop()?.replace(".base", "") || path;
      const tabEl = tabsContainer.createDiv("bvs-settings-tab");
      tabEl.setText(fileName);
      if (path === this.currentTab) tabEl.classList.add("is-active");
      tabEl.onclick = () => {
        this.currentTab = path;
        this.refreshUI();
      };
    });
    const addTabEl = tabsContainer.createDiv("bvs-settings-tab bvs-settings-tab-add");
    addTabEl.setText("+ \u6DFB\u52A0\u6570\u636E\u5E93");
    addTabEl.onclick = () => {
      new FileSuggestModal(this.app, async (selectedPath) => {
        if (!this.plugin.settings.fileConfigs[selectedPath]) {
          this.plugin.settings.fileConfigs[selectedPath] = JSON.parse(JSON.stringify(DEFAULT_FILE_CONFIG));
          await this.plugin.saveSettings();
        }
        this.currentTab = selectedPath;
        this.refreshUI();
      }).open();
    };
    if (!this.currentTab) {
      containerEl.createDiv("bvs-settings-empty-state").setText('\u8BF7\u70B9\u51FB\u4E0A\u65B9 "+ \u6DFB\u52A0\u6570\u636E\u5E93" \u5F00\u59CB\u914D\u7F6E\u3002');
      return;
    }
    const config = this.plugin.settings.fileConfigs[this.currentTab];
    const tabName = this.currentTab.split("/").pop() || this.currentTab;
    containerEl.createEl("h3", { text: `\u2699\uFE0F \u754C\u9762\u7F8E\u5316 (${tabName})` });
    this.addToggle(containerEl, "\u542F\u7528\u81EA\u5B9A\u4E49\u89C6\u56FE\u83DC\u5355\u6837\u5F0F", "enableCustomViewStyle", "\u89E3\u51B3\u5C0F\u5C3A\u5BF8\u9762\u677F\u4E0B\u6324\u538B\u6309\u94AE\u7684\u95EE\u9898\u3002", config);
    this.addToggle(containerEl, '\u9690\u85CF "X \u4E2A\u7ED3\u679C"', "hideResultCount", null, config);
    this.addToggle(containerEl, '\u9690\u85CF "\u641C\u7D22" \u6309\u94AE', "hideSearch", null, config);
    this.addToggle(containerEl, '\u9690\u85CF "\u5C5E\u6027" \u6309\u94AE', "hideProperties", null, config);
    this.addToggle(containerEl, '\u9690\u85CF "\u7B5B\u9009" \u6309\u94AE', "hideFilter", null, config);
    this.addToggle(containerEl, '\u9690\u85CF "\u6392\u5E8F" \u6309\u94AE', "hideSort", null, config);
    containerEl.createEl("h3", { text: "\u{1F3E0} \u9ED8\u8BA4\u6309\u94AE" });
    this.addToggle(containerEl, "\u542F\u7528\u9ED8\u8BA4\u6309\u94AE", "enableDefault", null, config, true);
    if (config.enableDefault) {
      new import_obsidian.Setting(containerEl).setName("\u9ED8\u8BA4\u6309\u94AE\u4F4D\u7F6E").addDropdown((drop) => drop.addOption("left", "\u9760\u5DE6 (\u6392\u5728\u7B2C\u4E00)").addOption("right", "\u9760\u53F3 (\u6392\u5728\u6700\u540E)").setValue(config.defaultPosition).onChange(async (v) => {
        config.defaultPosition = v;
        await this.plugin.saveSettings();
      }));
      new import_obsidian.Setting(containerEl).setName("\u9009\u62E9\u9ED8\u8BA4\u89C6\u56FE").addButton((btn) => btn.setButtonText(config.defaultViewName || "\u9009\u62E9\u89C6\u56FE").onClick(async () => {
        const views = await this.plugin.getAvailableViewNamesForFile(this.currentTab);
        new ViewNameSuggestModal(this.app, views, async (v) => {
          config.defaultViewName = v;
          await this.plugin.saveSettings();
          btn.setButtonText(v);
        }).open();
      }));
    }
    containerEl.createEl("h3", { text: "\u2728 \u81EA\u5B9A\u4E49\u6309\u94AE" });
    new import_obsidian.Setting(containerEl).setName("\u6DFB\u52A0\u65B0\u6309\u94AE").addButton((btn) => btn.setButtonText("+ \u6DFB\u52A0").setCta().onClick(async () => {
      config.buttons.push({ icon: "layout-list", viewName: "\u9009\u62E9\u89C6\u56FE", showText: false });
      await this.plugin.saveSettings();
      this.refreshUI();
    }));
    config.buttons.forEach((btnConfig, index) => {
      const setting = new import_obsidian.Setting(containerEl).setName(`\u6309\u94AE ${index + 1}`).addButton((btn) => {
        btn.setIcon(btnConfig.icon || "star");
        btn.setTooltip("\u66F4\u6539\u56FE\u6807");
        btn.onClick(() => {
          new IconSuggestModal(this.app, async (selectedIcon) => {
            config.buttons[index].icon = selectedIcon;
            await this.plugin.saveSettings();
            btn.setIcon(selectedIcon);
          }).open();
        });
      }).addButton((btn) => {
        btn.setButtonText(btnConfig.viewName || "\u9009\u62E9\u89C6\u56FE");
        btn.setTooltip("\u7ED1\u5B9A\u89C6\u56FE");
        btn.onClick(async () => {
          const views = await this.plugin.getAvailableViewNamesForFile(this.currentTab);
          new ViewNameSuggestModal(this.app, views, async (selectedView) => {
            config.buttons[index].viewName = selectedView;
            await this.plugin.saveSettings();
            btn.setButtonText(selectedView);
          }).open();
        });
      }).addButton((btn) => {
        btn.setIcon(btnConfig.showText ? "eye-off" : "eye");
        btn.setTooltip(btnConfig.showText ? "\u5F53\u524D: \u7528\u89C6\u56FE\u540D\u79F0\u5C55\u793A (\u5BBD\u5C4F)" : "\u5F53\u524D: \u7528\u56FE\u6807\u5C55\u793A");
        btn.onClick(async () => {
          btnConfig.showText = !btnConfig.showText;
          btn.setIcon(btnConfig.showText ? "eye-off" : "eye");
          btn.setTooltip(btnConfig.showText ? "\u5F53\u524D: \u7528\u89C6\u56FE\u540D\u79F0\u5C55\u793A (\u5BBD\u5C4F)" : "\u5F53\u524D: \u7528\u56FE\u6807\u5C55\u793A");
          await this.plugin.saveSettings();
        });
      }).addButton((btn) => btn.setIcon("trash").setTooltip("\u5220\u9664").onClick(async () => {
        config.buttons.splice(index, 1);
        await this.plugin.saveSettings();
        this.refreshUI();
      }));
      const el = setting.settingEl;
      el.draggable = true;
      el.classList.add("bvs-draggable-item");
      const nameContainer = el.querySelector(".setting-item-name");
      if (nameContainer) {
        const dragIcon = document.createElement("span");
        dragIcon.className = "bvs-drag-handle";
        (0, import_obsidian.setIcon)(dragIcon, "grip-vertical");
        nameContainer.prepend(dragIcon);
      }
      el.addEventListener("dragstart", (e) => {
        this.draggedIndex = index;
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = "move";
        }
        setTimeout(() => el.classList.add("is-dragging"), 0);
      });
      el.addEventListener("dragover", (e) => {
        e.preventDefault();
        if (e.dataTransfer) {
          e.dataTransfer.dropEffect = "move";
        }
        const bounding = el.getBoundingClientRect();
        const offset = bounding.y + bounding.height / 2;
        if (e.clientY - offset > 0) {
          el.classList.add("drag-over-bottom");
          el.classList.remove("drag-over-top");
        } else {
          el.classList.add("drag-over-top");
          el.classList.remove("drag-over-bottom");
        }
      });
      el.addEventListener("dragleave", () => {
        el.classList.remove("drag-over-top", "drag-over-bottom");
      });
      el.addEventListener("drop", async (e) => {
        e.preventDefault();
        el.classList.remove("drag-over-top", "drag-over-bottom");
        if (this.draggedIndex === null || this.draggedIndex === index) return;
        const bounding = el.getBoundingClientRect();
        const offset = bounding.y + bounding.height / 2;
        let targetIndex = index;
        if (e.clientY - offset > 0) {
          targetIndex = index + 1;
        }
        if (this.draggedIndex < targetIndex) {
          targetIndex--;
        }
        const [movedItem] = config.buttons.splice(this.draggedIndex, 1);
        config.buttons.splice(targetIndex, 0, movedItem);
        this.draggedIndex = null;
        await this.plugin.saveSettings();
        this.refreshUI();
      });
      el.addEventListener("dragend", () => {
        el.classList.remove("is-dragging");
        this.draggedIndex = null;
        containerEl.querySelectorAll(".bvs-draggable-item").forEach((item) => {
          item.classList.remove("drag-over-top", "drag-over-bottom");
        });
      });
    });
    containerEl.createEl("br");
    containerEl.createEl("hr");
    new import_obsidian.Setting(containerEl).setName("\u5371\u9669\u64CD\u4F5C").setDesc("\u5220\u9664\u5F53\u524D\u6570\u636E\u5E93\u7684\u4E13\u5C5E\u89C6\u56FE\u914D\u7F6E\u3002").addButton((btn) => btn.setButtonText("\u5220\u9664\u6B64\u914D\u7F6E").setWarning().onClick(() => {
      new ConfirmModal(this.app, `\u786E\u5B9A\u8981\u5220\u9664 "${this.currentTab}" \u7684\u6240\u6709\u81EA\u5B9A\u4E49\u914D\u7F6E\u5417\uFF1F`, async () => {
        delete this.plugin.settings.fileConfigs[this.currentTab];
        this.currentTab = null;
        await this.plugin.saveSettings();
        this.refreshUI();
      }).open();
    }));
  }
  addToggle(containerEl, name, key, desc, config, refresh = false) {
    const setting = new import_obsidian.Setting(containerEl).setName(name);
    if (desc) setting.setDesc(desc);
    setting.addToggle((toggle) => toggle.setValue(config[key]).onChange(async (value) => {
      config[key] = value;
      await this.plugin.saveSettings();
      if (refresh) this.refreshUI();
    }));
  }
};
