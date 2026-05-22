import {
    App,
    FuzzySuggestModal,
    getIconIds,
    Modal,
    Notice,
    parseYaml,
    Plugin,
    PluginSettingTab,
    Setting,
    setIcon,
    TAbstractFile,
    TFile,
    View,
    WorkspaceLeaf
} from 'obsidian';

// ================== INTERFACES ==================

export interface ButtonConfig {
    icon: string;
    viewName: string;
    showText: boolean;
    isDefault?: boolean;
}

export interface FileConfig {
    buttons: ButtonConfig[];
    enableDefault: boolean;
    defaultPosition: 'left' | 'right';
    defaultViewName: string;
    hideResultCount: boolean;
    hideSearch: boolean;
    hideProperties: boolean;
    hideFilter: boolean;
    hideSort: boolean;
    enableCustomViewStyle: boolean;
}

export interface BvsSettings {
    fileConfigs: Record<string, FileConfig>;
}

// 扩展 Obsidian 官方的 View，以适应目标 Base 插件的私有方法
interface CustomBaseView extends View {
    file?: TFile;
    getState?: () => any;
    setState?: (state: any, result: { history: boolean }) => Promise<void>;
}

// ================== CONSTANTS & DEFAULTS ==================

const DEFAULT_FILE_CONFIG: FileConfig = {
    buttons: [],
    enableDefault: false,
    defaultPosition: 'left',
    defaultViewName: '主视图',
    hideResultCount: true,
    hideSearch: false,
    hideProperties: false,
    hideFilter: false,
    hideSort: false,
    enableCustomViewStyle: false
};

const DEFAULT_SETTINGS: BvsSettings = {
    fileConfigs: {}
};

function debounce<T extends (...args: any[]) => void>(func: T, wait: number): (...args: Parameters<T>) => void {
    let timeout: number | null = null;
    return function (this: any, ...args: Parameters<T>) {
        if (timeout !== null) window.clearTimeout(timeout);
        timeout = window.setTimeout(() => func.apply(this, args), wait);
    };
}

// ================== PLUGIN LOGIC ==================

export default class BaseViewSwitcherPlugin extends Plugin {
    settings: BvsSettings;
    viewNameCache: Record<string, string[]> = {};
    observer: MutationObserver;
    debouncedProcessAllViews: () => void;

    async onload() {
        await this.loadSettings();
        this.addSettingTab(new BaseViewSwitcherSettingTab(this.app, this));

        this.viewNameCache = {};

        this.debouncedProcessAllViews = debounce(this.processAllViews.bind(this), 250);
        this.observer = new MutationObserver(() => this.debouncedProcessAllViews());
        this.observer.observe(document.body, { childList: true, subtree: true });

        this.app.workspace.onLayoutReady(() => this.processAllViews());

        this.registerEvent(this.app.vault.on('rename', async (file: TAbstractFile, oldPath: string) => {
            if (file instanceof TFile && file.extension === 'base' && this.settings.fileConfigs[oldPath]) {
                this.settings.fileConfigs[file.path] = this.settings.fileConfigs[oldPath];
                delete this.settings.fileConfigs[oldPath];
                await this.saveSettings();
            }
        }));
    }

    onunload() {
        if (this.observer) this.observer.disconnect();
        this.app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
            const view = leaf.view as CustomBaseView;
            if (view && view.containerEl) {
                const el = view.containerEl;
                el.classList.remove(
                    'bvs-view', 'bvs-hide-result-count', 'bvs-hide-search',
                    'bvs-hide-properties', 'bvs-hide-filter', 'bvs-hide-sort', 'bvs-custom-view-style'
                );
            }
        });
        document.querySelectorAll('.my-base-btns-container').forEach(el => el.remove());
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        document.querySelectorAll('.my-base-btns-container').forEach(el => el.remove());
        this.processAllViews();
    }

    async getAvailableViewNamesForFile(filePath: string): Promise<string[]> {
        if (this.viewNameCache[filePath]) return this.viewNameCache[filePath];

        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!file || !(file instanceof TFile)) return [];

        const names = new Set<string>();
        try {
            const content = await this.app.vault.cachedRead(file);
            const parsed = parseYaml(content);
            if (parsed && parsed.views && Array.isArray(parsed.views)) {
                parsed.views.forEach((v: any) => { if (v.name) names.add(v.name); });
            }
        } catch (e) {
            console.error("YAML 解析失败", e);
        }

        this.viewNameCache[filePath] = Array.from(names);
        return this.viewNameCache[filePath];
    }

    processAllViews() {
        this.app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
            const view = leaf.view as CustomBaseView;
            if (view && view.file && view.file.extension === 'base') {
                this.injectIntoView(view);
            }
        });
    }

    injectIntoView(view: CustomBaseView) {
        if (!view.file) return;

        const filePath = view.file.path;
        const config = this.settings.fileConfigs[filePath];
        const container = view.containerEl;

        container.classList.add('bvs-view');
        container.classList.remove(
            'bvs-hide-result-count', 'bvs-hide-search', 'bvs-hide-properties',
            'bvs-hide-filter', 'bvs-hide-sort', 'bvs-custom-view-style'
        );

        const toolbar = container.querySelector('.bases-toolbar');

        if (!config) {
            if (toolbar) {
                const staleBtns = toolbar.querySelector('.my-base-btns-container');
                if (staleBtns) staleBtns.remove();
            }
            return;
        }

        container.classList.toggle('bvs-hide-result-count', config.hideResultCount);
        container.classList.toggle('bvs-hide-search', config.hideSearch);
        container.classList.toggle('bvs-hide-properties', config.hideProperties);
        container.classList.toggle('bvs-hide-filter', config.hideFilter);
        container.classList.toggle('bvs-hide-sort', config.hideSort);
        container.classList.toggle('bvs-custom-view-style', config.enableCustomViewStyle);

        if (!toolbar) return;

        const existingBtnContainer = toolbar.querySelector('.my-base-btns-container') as HTMLElement;
        if (existingBtnContainer) {
            if (existingBtnContainer.dataset.bvsPath === filePath) {
                return;
            } else {
                existingBtnContainer.remove();
            }
        }

        const firstElement = toolbar.firstElementChild;
        if (!firstElement || !firstElement.parentNode) return;

        const btnContainer = document.createElement('div');
        btnContainer.className = 'my-base-btns-container';
        btnContainer.dataset.bvsPath = filePath;

        let renderList: ButtonConfig[] = [...config.buttons];
        if (config.enableDefault) {
            const defaultBtn: ButtonConfig = { icon: 'home', viewName: config.defaultViewName, isDefault: true, showText: false };
            if (config.defaultPosition === 'left') renderList.unshift(defaultBtn);
            else renderList.push(defaultBtn);
        }

        renderList.forEach(btnConfig => {
            const btn = document.createElement('div');
            btn.className = 'clickable-icon my-base-btn';

            // 如果是文字模式，打上特定的 Class
            if (btnConfig.showText) {
                btn.classList.add('bvs-text-mode');
            }

            btn.setAttribute('aria-label', `${btnConfig.viewName}`);

            // 渲染图标
            setIcon(btn, btnConfig.icon || 'layout-grid');

            // 渲染文字DOM（由CSS控制显隐）
            const textSpan = document.createElement('span');
            textSpan.className = 'bvs-btn-text';
            textSpan.innerText = btnConfig.viewName;
            btn.appendChild(textSpan);

            btn.onclick = (e: MouseEvent) => {
                e.stopPropagation();
                this.switchView(view, btnConfig.viewName);
            };
            btnContainer.appendChild(btn);
        });

        firstElement.parentNode.insertBefore(btnContainer, firstElement.nextSibling);
    }

    async switchView(targetView: CustomBaseView, targetViewName: string) {
        try {
            if (targetView && typeof targetView.getState === 'function' && typeof targetView.setState === 'function') {
                let state = targetView.getState();
                state.viewName = targetViewName;
                await targetView.setState(state, { history: true });
            } else {
                new Notice("切换失败：无法锁定视图实例");
            }
        } catch (error) {
            console.error("Base视图切换器报错:", error);
        }
    }
}

// ================== MODALS ==================

class FileSuggestModal extends FuzzySuggestModal<TFile> {
    onChoose: (path: string) => void;

    constructor(app: App, onChoose: (path: string) => void) {
        super(app);
        this.onChoose = onChoose;
        this.setPlaceholder("选择需要配置的 Base 数据库文件...");
    }
    getItems(): TFile[] {
        return this.app.vault.getFiles().filter(f => f.extension === 'base');
    }
    getItemText(file: TFile): string { return file.path; }
    onChooseItem(file: TFile, evt: MouseEvent | KeyboardEvent) { this.onChoose(file.path); }
}

class ViewNameSuggestModal extends FuzzySuggestModal<string> {
    viewNames: string[];
    onChoose: (item: string) => void;

    constructor(app: App, viewNames: string[], onChoose: (item: string) => void) {
        super(app);
        this.viewNames = viewNames;
        this.onChoose = onChoose;
        this.setPlaceholder(this.viewNames.length > 0 ? "选择或搜索视图..." : "未找到视图，请检查文件是否为空");
    }
    getItems(): string[] { return this.viewNames; }
    getItemText(item: string): string { return item; }
    onChooseItem(item: string) { this.onChoose(item); }
}

class ConfirmModal extends Modal {
    message: string;
    onConfirm: () => void;

    constructor(app: App, message: string, onConfirm: () => void) {
        super(app);
        this.message = message;
        this.onConfirm = onConfirm;
    }
    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("p", { text: this.message });
        const btnContainer = contentEl.createDiv({ cls: "modal-button-container" });

        const cancelBtn = btnContainer.createEl("button", { text: "取消" });
        cancelBtn.onclick = () => this.close();

        const confirmBtn = btnContainer.createEl("button", { text: "删除", cls: "mod-warning" });
        confirmBtn.onclick = () => { this.onConfirm(); this.close(); };
    }
    onClose() { this.contentEl.empty(); }
}

class IconSuggestModal extends FuzzySuggestModal<string> {
    onChoose: (item: string) => void;

    constructor(app: App, onChoose: (item: string) => void) {
        super(app);
        this.onChoose = onChoose;
        this.setPlaceholder("搜索图标...");
    }
    getItems(): string[] { return getIconIds(); }
    getItemText(item: string): string { return item; }
    renderSuggestion(match: FuzzyMatch<string>, el: HTMLElement) {
        el.empty();
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        const iconEl = el.createSpan();
        iconEl.style.marginRight = '10px';
        iconEl.style.display = 'flex';
        setIcon(iconEl, match.item);
        el.createSpan({ text: match.item });
    }
    onChooseItem(item: string) { this.onChoose(item); }
}

// ================== SETTINGS UI ==================

class BaseViewSwitcherSettingTab extends PluginSettingTab {
    plugin: BaseViewSwitcherPlugin;
    currentTab: string | null;
    draggedIndex: number | null;

    constructor(app: App, plugin: BaseViewSwitcherPlugin) {
        super(app, plugin);
        this.plugin = plugin;
        this.currentTab = null;
        this.draggedIndex = null;
    }

    refreshUI() {
        const scrollContainer = this.containerEl.closest('.vertical-tab-content') || this.containerEl.parentElement;
        const currentScroll = scrollContainer ? scrollContainer.scrollTop : 0;

        const currentHeight = this.containerEl.clientHeight;
        if (currentHeight > 0) {
            this.containerEl.style.minHeight = `${currentHeight}px`;
        }

        this.display();

        requestAnimationFrame(() => {
            if (scrollContainer) scrollContainer.scrollTop = currentScroll;
            this.containerEl.style.minHeight = '';
        });
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();
        this.plugin.viewNameCache = {};

        containerEl.createEl('h2', { text: 'Base 视图切换器设置' });

        const filePaths = Object.keys(this.plugin.settings.fileConfigs);
        if (filePaths.length > 0 && !this.currentTab) {
            this.currentTab = filePaths[0];
        } else if (filePaths.length === 0) {
            this.currentTab = null;
        }

        const tabsContainer = containerEl.createDiv('bvs-settings-tabs-container');

        filePaths.forEach(path => {
            const fileName = path.split('/').pop()?.replace('.base', '') || path;
            const tabEl = tabsContainer.createDiv('bvs-settings-tab');
            tabEl.setText(fileName);
            if (path === this.currentTab) tabEl.classList.add('is-active');

            tabEl.onclick = () => { this.currentTab = path; this.refreshUI(); };
        });

        const addTabEl = tabsContainer.createDiv('bvs-settings-tab bvs-settings-tab-add');
        addTabEl.setText('+ 添加数据库');
        addTabEl.onclick = () => {
            new FileSuggestModal(this.app, async (selectedPath: string) => {
                if (!this.plugin.settings.fileConfigs[selectedPath]) {
                    this.plugin.settings.fileConfigs[selectedPath] = JSON.parse(JSON.stringify(DEFAULT_FILE_CONFIG));
                    await this.plugin.saveSettings();
                }
                this.currentTab = selectedPath;
                this.refreshUI();
            }).open();
        };

        if (!this.currentTab) {
            containerEl.createDiv('bvs-settings-empty-state').setText('请点击上方 "+ 添加数据库" 开始配置。');
            return;
        }

        const config = this.plugin.settings.fileConfigs[this.currentTab];
        const tabName = this.currentTab.split('/').pop() || this.currentTab;

        containerEl.createEl('h3', { text: `⚙️ 界面美化 (${tabName})` });
        this.addToggle(containerEl, '启用自定义视图菜单样式', 'enableCustomViewStyle', '解决小尺寸面板下挤压按钮的问题。', config);
        this.addToggle(containerEl, '隐藏 "X 个结果"', 'hideResultCount', null, config);
        this.addToggle(containerEl, '隐藏 "搜索" 按钮', 'hideSearch', null, config);
        this.addToggle(containerEl, '隐藏 "属性" 按钮', 'hideProperties', null, config);
        this.addToggle(containerEl, '隐藏 "筛选" 按钮', 'hideFilter', null, config);
        this.addToggle(containerEl, '隐藏 "排序" 按钮', 'hideSort', null, config);

        containerEl.createEl('h3', { text: '🏠 默认按钮' });
        this.addToggle(containerEl, '启用默认按钮', 'enableDefault', null, config, true);

        if (config.enableDefault) {
            new Setting(containerEl).setName('默认按钮位置')
                .addDropdown(drop => drop.addOption('left', '靠左 (排在第一)').addOption('right', '靠右 (排在最后)')
                    .setValue(config.defaultPosition).onChange(async (v: 'left' | 'right') => {
                        config.defaultPosition = v;
                        await this.plugin.saveSettings();
                    }));

            new Setting(containerEl).setName('选择默认视图')
                .addButton(btn => btn.setButtonText(config.defaultViewName || '选择视图').onClick(async () => {
                    const views = await this.plugin.getAvailableViewNamesForFile(this.currentTab!);
                    new ViewNameSuggestModal(this.app, views, async (v: string) => {
                        config.defaultViewName = v;
                        await this.plugin.saveSettings();
                        btn.setButtonText(v);
                    }).open();
                }));
        }

        containerEl.createEl('h3', { text: '✨ 自定义按钮' });
        new Setting(containerEl).setName('添加新按钮').addButton(btn => btn.setButtonText('+ 添加').setCta().onClick(async () => {
            // 新增按钮默认使用图标模式（睁眼）
            config.buttons.push({ icon: 'layout-list', viewName: '选择视图', showText: false });
            await this.plugin.saveSettings();
            this.refreshUI();
        }));

        config.buttons.forEach((btnConfig, index) => {
            const setting = new Setting(containerEl).setName(`按钮 ${index + 1}`)
                .addButton(btn => {
                    btn.setIcon(btnConfig.icon || 'star');
                    btn.setTooltip('更改图标');
                    btn.onClick(() => {
                        new IconSuggestModal(this.app, async (selectedIcon: string) => {
                            config.buttons[index].icon = selectedIcon;
                            await this.plugin.saveSettings();
                            btn.setIcon(selectedIcon);
                        }).open();
                    });
                })
                .addButton(btn => {
                    btn.setButtonText(btnConfig.viewName || '选择视图');
                    btn.setTooltip('绑定视图');
                    btn.onClick(async () => {
                        const views = await this.plugin.getAvailableViewNamesForFile(this.currentTab!);
                        new ViewNameSuggestModal(this.app, views, async (selectedView: string) => {
                            config.buttons[index].viewName = selectedView;
                            await this.plugin.saveSettings();
                            btn.setButtonText(selectedView);
                        }).open();
                    });
                })
                // 眼镜图标按钮
                .addButton(btn => {
                    btn.setIcon(btnConfig.showText ? 'eye-off' : 'eye');
                    btn.setTooltip(btnConfig.showText ? '当前: 用视图名称展示 (宽屏)' : '当前: 用图标展示');
                    btn.onClick(async () => {
                        btnConfig.showText = !btnConfig.showText;
                        btn.setIcon(btnConfig.showText ? 'eye-off' : 'eye');
                        btn.setTooltip(btnConfig.showText ? '当前: 用视图名称展示 (宽屏)' : '当前: 用图标展示');
                        await this.plugin.saveSettings();
                    });
                })
                .addButton(btn => btn.setIcon('trash').setTooltip('删除').onClick(async () => {
                    config.buttons.splice(index, 1);
                    await this.plugin.saveSettings();
                    this.refreshUI();
                }));

            const el = setting.settingEl;
            el.draggable = true;
            el.classList.add('bvs-draggable-item');

            const nameContainer = el.querySelector('.setting-item-name');
            if (nameContainer) {
                const dragIcon = document.createElement('span');
                dragIcon.className = 'bvs-drag-handle';
                setIcon(dragIcon, 'grip-vertical');
                nameContainer.prepend(dragIcon);
            }

            el.addEventListener('dragstart', (e: DragEvent) => {
                this.draggedIndex = index;
                if (e.dataTransfer) {
                    e.dataTransfer.effectAllowed = 'move';
                }
                setTimeout(() => el.classList.add('is-dragging'), 0);
            });

            el.addEventListener('dragover', (e: DragEvent) => {
                e.preventDefault();
                if (e.dataTransfer) {
                    e.dataTransfer.dropEffect = 'move';
                }

                const bounding = el.getBoundingClientRect();
                const offset = bounding.y + (bounding.height / 2);
                if (e.clientY - offset > 0) {
                    el.classList.add('drag-over-bottom');
                    el.classList.remove('drag-over-top');
                } else {
                    el.classList.add('drag-over-top');
                    el.classList.remove('drag-over-bottom');
                }
            });

            el.addEventListener('dragleave', () => {
                el.classList.remove('drag-over-top', 'drag-over-bottom');
            });

            el.addEventListener('drop', async (e: DragEvent) => {
                e.preventDefault();
                el.classList.remove('drag-over-top', 'drag-over-bottom');

                if (this.draggedIndex === null || this.draggedIndex === index) return;

                const bounding = el.getBoundingClientRect();
                const offset = bounding.y + (bounding.height / 2);
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

            el.addEventListener('dragend', () => {
                el.classList.remove('is-dragging');
                this.draggedIndex = null;
                containerEl.querySelectorAll('.bvs-draggable-item').forEach(item => {
                    item.classList.remove('drag-over-top', 'drag-over-bottom');
                });
            });
        });

        containerEl.createEl('br');
        containerEl.createEl('hr');
        new Setting(containerEl).setName('危险操作').setDesc('删除当前数据库的专属视图配置。')
            .addButton(btn => btn.setButtonText('删除此配置').setWarning().onClick(() => {
                new ConfirmModal(this.app, `确定要删除 "${this.currentTab}" 的所有自定义配置吗？`, async () => {
                    delete this.plugin.settings.fileConfigs[this.currentTab!];
                    this.currentTab = null;
                    await this.plugin.saveSettings();
                    this.refreshUI();
                }).open();
            }));
    }

    addToggle(containerEl: HTMLElement, name: string, key: keyof FileConfig, desc: string | null, config: FileConfig, refresh = false) {
        const setting = new Setting(containerEl).setName(name);
        if (desc) setting.setDesc(desc);
        setting.addToggle(toggle => toggle.setValue(config[key] as boolean).onChange(async (value) => {
            (config[key] as boolean) = value;
            await this.plugin.saveSettings();
            if (refresh) this.refreshUI();
        }));
    }
}