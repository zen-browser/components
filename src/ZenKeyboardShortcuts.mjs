const kZKSActions = {
  // Note: If they start with "command:", it means that "command=" will be added to the key element,
  // otherwise "oncommand=" will be added.

  // Split view actions
  zenSplitViewGrid: ["gZenViewSplitter.toggleShortcut('grid')", 'zen-split-view-grid', 'split-view-action'],
  zenSplitViewVertical: ["gZenViewSplitter.toggleShortcut('vsep')", 'zen-split-view-vertical', 'split-view-action'],
  zenSplitViewHorizontal: ["gZenViewSplitter.toggleShortcut('hsep')", 'zen-split-view-horizontal', 'split-view-action'],
  zenSplitViewClose: ["gZenViewSplitter.toggleShortcut('unsplit')", 'zen-split-view-close', 'split-view-action'],

  // Workspace actions
  zenChangeWorkspace: ['ZenWorkspaces.changeWorkspaceShortcut()', 'zen-change-workspace', 'workspace-action'],
  zenChangeWorkspaceBack: ['ZenWorkspaces.changeWorkspaceShortcut(-1)', 'zen-change-workspace-back', 'workspace-action'],

  // manage actions
  openNewTab: ['command:cmd_newNavigatorTabNoEvent', 'open-new-tab', 'tab-action'],
  duplicateTab: ["duplicateTabIn(gBrowser.selectedTab, 'tab')", 'duplicate-tab', 'tab-action'],
  closeTab: ['command:cmd_close', 'close-tab', 'tab-action'],
  openNewWindow: ['command:cmd_newNavigator', 'open-new-window', 'tab-action'],
  openNewPrivateWindow: ['command:Tools:PrivateBrowsing', 'open-new-private-window', 'tab-action'],
  closeWindow: ['command:cmd_closeWindow', 'close-window', 'tab-action'],
  restoreLastTab: ['undoCloseTab()', 'restore-last-session', 'tab-action'],
  restoreLastWindow: ['command:History:UndoCloseWindow', 'restore-last-window', 'tab-action'],
  showNextTab: ['gBrowser.tabContainer.advanceSelectedTab(1, true)', 'show-next-tab', 'tab-action'],
  showPreviousTab: ['gBrowser.tabContainer.advanceSelectedTab(-1, true)', 'show-previous-tab', 'tab-action'],
  showAllTabsPanel: ['gTabsPanel.showAllTabsPanel()', 'show-all-tabs-panel', 'tab-action'],

  // Compact mode actions
  zenToggleCompactMode: ['gZenCompactModeManager.toggle()', 'zen-toggle-compact-mode', 'compact-mode-action'],
  zenToggleCompactModeSidebar: [
    'gZenCompactModeManager.toggleSidebar()',
    'zen-toggle-compact-mode-sidebar',
    'compact-mode-action',
  ],
  zenToggleCompactModeToolbar: [
    'gZenCompactModeManager.toggleToolbar()',
    'zen-toggle-compact-mode-toolbar',
    'compact-mode-action',
  ],

  // Page actions
  sendWithMail: ['command:Browser:SendLink', 'send-with-mail', 'page-action'],
  savePage: ['command:Browser:SavePage', 'save-page', 'page-action'],
  printPage: ['command:cmd_print', 'print-page', 'page-action'],
  muteCurrentTab: ['command:cmd_toggleMute', 'mute-current-tab', 'page-action'],
  showSourceOfPage: ['command:View:PageSource', 'show-source-of-page', 'page-action'],
  showPageInfo: ['command:View:PageInfo', 'show-page-info', 'page-action'],

  // Visible actions
  zoomIn: ['command:cmd_fullZoomEnlarge', 'zoom-in', 'visible-action'],
  zoomOut: ['command:cmd_fullZoomReduce', 'zoom-out', 'visible-action'],
  resetZoom: ['command:cmd_fullZoomReset', 'reset-zoom', 'visible-action'],

  // History actions
  back: ['command:Browser:Back', 'back', 'history-action'],
  forward: ['command:Browser:Forward', 'forward', 'history-action'],
  stop: ['command:Browser:Stop', 'stop', 'history-action'],
  reload: ['command:Browser:Reload', 'reload', 'history-action'],
  forceReload: ['command:Browser:ReloadSkipCache', 'force-reload', 'history-action'],

  // search actions
  searchInThisPage: ["gLazyFindCommand('onFindCommand')", 'search-in-this-page', 'search-action'],
  showNextSearchResult: ["gLazyFindCommand('onFindAgainCommand', false)", 'show-next-search-result', 'search-action'],
  showPreviousSearchResult: ["gLazyFindCommand('onFindAgainCommand', true)", 'show-previous-search-result', 'search-action'],
  searchTheWeb: ['command:Tools:Search', 'search-the-web', 'search-action'],

  // Tools actions
  openMigrationWizard: ['command:cmd_file_importFromAnotherBrowser', 'open-migration-wizard', 'tools-action'],
  quitFromApplication: ['command:goQuitApplication', 'quit-from-application', 'tools-action'],
  enterIntoCustomizeMode: ['gCustomizeMode.enter()', 'enter-into-customize-mode', 'tools-action'],
  enterIntoOfflineMode: ['command:cmd_toggleOfflineStatus', 'enter-into-offline-mode', 'tools-action'],
  openScreenCapture: ['command:Browser:Screenshot', 'open-screen-capture', 'tools-action'],

  // Bookmark actions
  bookmarkThisPage: [
    "BrowserPageActions.doCommandForAction(PageActions.actionForID('bookmark'), event, this);",
    'bookmark-this-page',
    'bookmark-action',
  ],
  openBookmarkAddTool: [
    'PlacesUIUtils.showBookmarkPagesDialog(PlacesCommandHook.uniqueCurrentPages)',
    'open-bookmark-add-tool',
    'bookmark-action',
  ],
  openBookmarksManager: ["SidebarController.toggle('viewBookmarksSidebar');", 'open-bookmarks-manager', 'bookmark-action'],
  toggleBookmarkToolbar: [
    "BookmarkingUI.toggleBookmarksToolbar('bookmark-tools')",
    'toggle-bookmark-toolbar',
    'bookmark-action',
  ],

  // Open Page actions
  openGeneralPreferences: ['openPreferences()', 'open-general-preferences', 'open-page-action'],
  openPrivacyPreferences: ["openPreferences('panePrivacy')", 'open-privacy-preferences', 'open-page-action'],
  openWorkspacesPreferences: ["openPreferences('paneWorkspaces')", 'open-workspaces-preferences', 'open-page-action'],
  openContainersPreferences: ["openPreferences('paneContainers')", 'open-containers-preferences', 'open-page-action'],
  openSearchPreferences: ["openPreferences('paneSearch')", 'open-search-preferences', 'open-page-action'],
  openSyncPreferences: ["openPreferences('paneSync')", 'open-sync-preferences', 'open-page-action'],
  openTaskManager: ['command:View:AboutProcesses', 'open-task-manager', 'open-page-action'],
  openAddonsManager: ['command:Tools:Addons', 'open-addons-manager', 'open-page-action'],
  openHomePage: ['BrowserHome()', 'open-home-page', 'open-page-action'],

  // History actions
  forgetHistory: ['command:Tools:Sanitize', 'forget-history', 'history-action'],
  quickForgetHistory: ['PlacesUtils.history.clear(true)', 'quick-forget-history', 'history-action'],
  clearRecentHistory: ['command:cmd_closeWindow', 'clear-recent-history', 'history-action'],
  restoreLastSession: ['command:Browser:RestoreLastSession', 'restore-last-session', 'history-action'],
  searchHistory: ['command:History:SearchHistory', 'search-history', 'history-action'],
  manageHistory: ["PlacesCommandHook.showPlacesOrganizer('History')", 'manage-history', 'history-action'],

  // Downloads actions
  openDownloads: ['DownloadsPanel.showDownloadsHistory()', 'open-downloads', 'downloads-action'],

  // Sidebar actions
  showBookmarkSidebar: ["SidebarController.show('viewBookmarksSidebar')", 'show-bookmark-sidebar', 'sidebar-action'],
  showHistorySidebar: ["SidebarController.show('viewHistorySidebar')", 'show-history-sidebar', 'sidebar-action'],
  showSyncedTabsSidebar: ["SidebarController.show('viewTabsSidebar')", 'show-synced-tabs-sidebar', 'sidebar-action'],
  reverseSidebarPosition: ['SidebarController.reversePosition()', 'reverse-sidebar', 'sidebar-action'],
  hideSidebar: ['SidebarController.hide()', 'hide-sidebar', 'sidebar-action'],
  toggleSidebar: ['SidebarController.toggle()', 'toggle-sidebar', 'sidebar-action'],
  zenToggleWebPanels: ['gZenBrowserManagerSidebar.toggle()', 'zen-toggle-web-panels', 'sidebar-action'],
};

const kZenDefaultShortcuts = {
  // Split view actions
  zenSplitViewGrid: 'Ctrl+Alt+G',
  zenSplitViewVertical: 'Ctrl+Alt+V',
  zenSplitViewHorizontal: 'Ctrl+Alt+H',
  zenSplitViewClose: 'Ctrl+Alt+U',

  // Workspace actions
  zenChangeWorkspace: 'Ctrl+E',
  zenChangeWorkspaceBack: 'Ctrl+Shift+E',

  // Compact mode actions
  zenToggleCompactMode: 'Ctrl+Alt+C',
  zenToggleCompactModeSidebar: 'Ctrl+Alt+S',
  zenToggleCompactModeToolbar: 'Ctrl+Alt+T',

  // manage actions
  zenToggleWebPanels: 'Alt+P',
};

// Section: ZenKeyboardShortcuts

const KEYCODE_MAP = {
  F1: 'VK_F1',
  F2: 'VK_F2',
  F3: 'VK_F3',
  F4: 'VK_F4',
  F5: 'VK_F5',
  F6: 'VK_F6',
  F7: 'VK_F7',
  F8: 'VK_F8',
  F9: 'VK_F9',
  F10: 'VK_F10',
  F11: 'VK_F11',
  F12: 'VK_F12',
  TAB: 'VK_TAB',
  ENTER: 'VK_RETURN',
  ESCAPE: 'VK_ESCAPE',
  SPACE: 'VK_SPACE',
  ARROWLEFT: 'VK_LEFT',
  ARROWRIGHT: 'VK_RIGHT',
  ARROWUP: 'VK_UP',
  ARROWDOWN: 'VK_DOWN',
  DELETE: 'VK_DELETE',
  BACKSPACE: 'VK_BACK',
};

const ZEN_SHORTCUTS_GROUP = 'zen';
const FIREFOX_SHORTCUTS_GROUP = 'firefox';
const VALID_SHORTCUT_GROUPS = [ZEN_SHORTCUTS_GROUP, FIREFOX_SHORTCUTS_GROUP];

class KeyShortcutModifiers {
  #ctrl = false;
  #alt = false;
  #shift = false;
  #meta = false;

  constructor(ctrl, alt, shift, meta) {
    this.#ctrl = ctrl;
    this.#alt = alt;
    this.#shift = shift;
    this.#meta = meta;
  }

  static parseFromJSON(modifiers) {
    if (!modifiers) {
      return new KeyShortcutModifiers(false, false, false, false);
    }

    return new KeyShortcutModifiers(
      modifiers['control'] == true,
      modifiers['alt'] == true,
      modifiers['shift'] == true,
      modifiers['meta'] == true || modifiers['accel'] == true
    );
  }

  static parseFromXHTMLAttribute(modifiers) {
    if (!modifiers) {
      return new KeyShortcutModifiers(false, false, false, false);
    }

    console.log(modifiers);

    return new KeyShortcutModifiers(
      modifiers.includes('control') || modifiers.includes('accel'),
      modifiers.includes('alt'),
      modifiers.includes('shift'),
      modifiers.includes('meta')
    );
  }

  toUserString() {
    let str = '';
    if (this.#ctrl) {
      str += 'Ctrl+';
    }
    if (this.#alt) {
      str += AppConstants.platform == 'macosx' ? 'Option+' : 'Alt+';
    }
    if (this.#shift) {
      str += 'Shift+';
    }
    if (this.#meta) {
      str += AppConstants.platform == 'macosx' ? 'Cmd+' : 'Win+';
    }
    return str;
  }

  toString() {
    let str = '';
    if (this.#ctrl) {
      str += 'control,';
    }
    if (this.#alt) {
      str += 'alt,';
    }
    if (this.#shift) {
      str += 'shift,';
    }
    if (this.#meta) {
      str += 'meta';
    }
    return str;
  }

  toJSONString() {
    return {
      ctrl: this.#ctrl,
      alt: this.#alt,
      shift: this.#shift,
      meta: this.#meta,
    };
  }

  areAnyActive() {
    return this.#ctrl || this.#alt || this.#shift || this.#meta;
  }
}

class KeyShortcut {
  #id = '';
  #key = '';
  #keycode = '';
  #group = FIREFOX_SHORTCUTS_GROUP;
  #modifiers = new KeyShortcutModifiers(false, false, false, false);
  #action = '';
  #l10nId = '';
  #disabled = false;
  #reserved = false;
  #internal = false;

  constructor(id, key, keycode, group, modifiers, action, l10nId, disabled, reserved, internal) {
    this.#id = id;
    this.#key = key;
    this.#keycode = keycode;

    if (!VALID_SHORTCUT_GROUPS.includes(group)) {
      throw new Error('Illegal group value: ' + group);
    }

    this.#group = group;
    this.#modifiers = modifiers;
    this.#action = action;
    this.#l10nId = l10nId;
    this.#disabled = disabled;
    this.#reserved = reserved;
    this.#internal = internal;
  }

  static parseFromSaved(json) {
    let rv = [];

    for (let key of json) {
      rv.push(this.#parseFromJSON(key));
    }

    return rv;
  }

  static #parseFromJSON(json) {
    return new KeyShortcut(
      json['id'],
      json['key'],
      json['keycode'],
      json['group'],
      KeyShortcutModifiers.parseFromJSON(json['modifiers']),
      json['action'],
      json['l10nId'],
      json['disabled'] == 'true',
      json['reserved'] == 'true',
      json['internal'] == 'true'
    );
  }

  static parseFromXHTML(key, group) {
    return new KeyShortcut(
      key.getAttribute('id'),
      key.getAttribute('key'),
      key.getAttribute('keycode'),
      group,
      KeyShortcutModifiers.parseFromXHTMLAttribute(key.getAttribute('modifiers')),
      key.getAttribute('command'),
      key.getAttribute('data-l10n-id'),
      key.getAttribute('disabled') == 'true',
      key.getAttribute('reserved') == 'true',
      key.getAttribute('internal') == 'true'
    );
  }

  toXHTMLElement() {
    let str = '<key';
    if (this.#id) {
      str += ` id="${this.#id}"`;
    }

    if (this.#key) {
      str += ` key="${this.#key}"`;
    }

    if (this.#keycode) {
      str += ` keycode="${this.#keycode}"`;
    }

    str += ` group="${this.#group}"`;

    if (this.#l10nId) {
      str += ` data-l10n-id="${this.#l10nId}"`;
    }

    if (this.#modifiers) {
      str += ` modifiers="${this.#modifiers.toString()}"`;
    }

    if (this.#action) {
      str += ` command="${this.#action}"`;
    }

    str += ` disabled="${this.#disabled}" reserved="${this.#reserved}" internal="${this.#internal}"/>`;

    return window.MozXULElement.parseXULToFragment(str);
  }

  getID() {
    return this.#id;
  }

  getAction() {
    return this.#action;
  }

  getL10NID() {
    return this.#l10nId;
  }

  getGroup() {
    return this.#group;
  }

  getModifiers() {
    return this.#modifiers;
  }

  setModifiers(modifiers) {
    if ((!modifiers) instanceof KeyShortcutModifiers) {
      throw new Error('Only KeyShortcutModifiers allowed');
    }
    this.#modifiers = modifiers;
  }

  toJSONForm() {
    return {
      id: this.#id,
      key: this.#key,
      keycode: this.#keycode,
      group: this.#group,
      l10nId: this.#l10nId,
      modifiers: this.#modifiers.toJSONString(),
      action: this.#action,
      disabled: this.#disabled,
      reserved: this.#reserved,
      internal: this.#internal,
    };
  }

  toUserString() {
    let str = this.#modifiers.toUserString();

    if (this.#key) {
      str += this.#key;
    } else if (this.#keycode) {
      str += this.#keycode;
    } else {
      return '';
    }
    return str;
  }

  isUserEditable() {
    if (
      !this.#id ||
      !this.#action ||
      this.#internal ||
      this.#reserved ||
      (this.#group == FIREFOX_SHORTCUTS_GROUP && this.#disabled)
    ) {
      return false;
    }
    return true;
  }

  clearKeybind() {
    this.#key = '';
    this.#keycode = '';
    this.#modifiers = new KeyShortcutModifiers(false, false, false, false);
  }

  setNewBinding(shortcut) {
    for (let keycode of Object.entries(KEYCODE_MAP)) {
      if (KEYCODE_MAP[keycode] == shortcut) {
        this.#keycode = shortcut;
        return;
      }
    }

    this.#key = shortcut;
  }
}

var gZenKeyboardShortcutsStorage = new class {
  init() {}

  get shortcutsFile() {
    return PathUtils.join(PathUtils.profileDir, 'zen-keyboard-shortcuts.json');
  }

  async save(data) {
    await IOUtils.writeJSON(this.shortcutsFile, {shortcuts: data});
  }

  async load() {
    try {
      return (await IOUtils.readJSON(this.shortcutsFile)).shortcuts;
    } catch (e) {
      console.error('Error loading shortcuts file', e);
      return null;
    }
  }
}

var gZenKeyboardShortcutsManager = {
  async init() {
    if (window.location.href == 'chrome://browser/content/browser.xhtml') {
      console.info('Zen CKS: Initializing shortcuts');

      this._currentShortcutList = await this._loadSaved();

      // TODO: add some sort of observer to listen for changes in the shortcuts file

      await this._saveShortcuts();

      console.info('Zen CKS: Initialized');
    }
  },

  async _loadSaved() {
    let data = await gZenKeyboardShortcutsStorage.load();
    if (!data || data.length == 0) {
      return this._loadDefaults();
    }

    try {
      return KeyShortcut.parseFromSaved(data);
    } catch (e) {
      console.error('Zen CKS: Error parsing saved shortcuts. Resetting to defaults...', e);
      return this._loadDefaults();
    }
  },

  _loadDefaults() {
    let keySet = document.getElementById('mainKeyset');
    let newShortcutList = [];

    // Firefox's standard keyset
    for (let key of keySet.children) {
      let parsed = KeyShortcut.parseFromXHTML(key, FIREFOX_SHORTCUTS_GROUP);
      newShortcutList.push(parsed);
    }

    // TODO: Add Zen's custom actions

    return newShortcutList;
  },

  _applyShortcuts() {
    console.debug('Applying shortcuts...');

    let mainKeyset = document.getElementById('mainKeyset');
    if (!mainKeyset) {
      throw new Error('Main keyset not found');
    }

    let parent = mainKeyset.parentElement;

    parent.removeChild(mainKeyset);
    mainKeyset.innerHTML = [];
    if (mainKeyset.children.length > 0) {
      throw new Error('Child list not empty');
    }

    for (let key of this._currentShortcutList) {
      let child = key.toXHTMLElement();
      mainKeyset.appendChild(child);
    }

    parent.prepend(mainKeyset);
    console.debug('Shortcuts applied...');
  },

  async _saveShortcuts() {
    let json = [];
    for (shortcut of this._currentShortcutList) {
      json.push(shortcut.toJSONForm());
    }

    await gZenKeyboardShortcutsStorage.save(json);
  },

  async setShortcut(action, shortcut, modifiers) {
    if (!action) {
      throw new Error('Action cannot be null');
    }

    // Unsetting shortcut
    let filteredShortcuts = this._currentShortcutList.filter((key) => key.getAction() == action);
    if (!filteredShortcuts) {
      throw new Error('Shortcut for action ' + action + ' not found');
    }

    for (let targetShortcut of filteredShortcuts) {
      if (!shortcut && !modifiers) {
        targetShortcut.clearKeybind();
      } else {
        targetShortcut.setNewBinding(shortcut);
        targetShortcut.setModifiers(modifiers);
      }
    }

    console.debug(this._currentShortcutList);

    await this._saveShortcuts();
  },

  getModifiableShortcuts() {
    let rv = [];

    if (!this._currentShortcutList) {
      this._currentShortcutList = this._loadSaved();
    }

    for (let shortcut of this._currentShortcutList) {
      if (shortcut.isUserEditable()) {
        rv.push(shortcut);
      }
    }

    return rv;
  },
};
