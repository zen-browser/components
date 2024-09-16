
var ZenWorkspaces = {
  /**
   * Stores workspace IDs and their last selected tabs.
   */
  _lastSelectedWorkspaceTabs: {},

  async init() {
    let docElement = document.documentElement;
    if (
      docElement.getAttribute('chromehidden').includes('toolbar') ||
      docElement.getAttribute('chromehidden').includes('menubar') ||
      docElement.hasAttribute('privatebrowsingmode')
    ) {
      console.warn('ZenWorkspaces: !!! ZenWorkspaces is disabled in hidden windows !!!');
      return; // We are in a hidden window, don't initialize ZenWorkspaces
    }
    console.info('ZenWorkspaces: Initializing ZenWorkspaces...');
    window.SessionStore.promiseInitialized.then(async () => {
      await this.initializeWorkspaces();
      console.info('ZenWorkspaces: ZenWorkspaces initialized');
    });
  },

  get workspaceEnabled() {
    return Services.prefs.getBoolPref('zen.workspaces.enabled', false);
  },

  getActiveWorkspaceFromCache() {
    return this._workspaceCache.workspaces.find((workspace) => workspace.used);
  },

  // Wrorkspaces saving/loading
  get _storeFile() {
    return PathUtils.join(PathUtils.profileDir, 'zen-workspaces', 'Workspaces.json');
  },

  async _workspaces() {
    if (!this._workspaceCache) {
      this._workspaceCache = await IOUtils.readJSON(this._storeFile);
      if (!this._workspaceCache.workspaces) {
        this._workspaceCache.workspaces = [];
      }
    }
    return this._workspaceCache;
  },

  async onWorkspacesEnabledChanged() {
    if (this.workspaceEnabled) {
      throw Error("Shoud've had reloaded the window");
    } else {
      this._workspaceCache = null;
      document.getElementById('zen-workspaces-button')?.remove();
      for (let tab of gBrowser.tabs) {
        gBrowser.showTab(tab);
      }
    }
  },

  async initializeWorkspaces() {
    Services.prefs.addObserver('zen.workspaces.enabled', this.onWorkspacesEnabledChanged.bind(this));
    this.initializeWorkspacesButton();
    let file = new FileUtils.File(this._storeFile);
    if (!file.exists()) {
      await IOUtils.writeJSON(this._storeFile, {});
    }
    if (this.workspaceEnabled) {
      this._initializeWorkspaceCreationIcons();
      this._initializeWorkspaceEditIcons();
      this._initializeWorkspaceTabContextMenus();
      window.addEventListener('TabClose', this.handleTabClose.bind(this));
      let workspaces = await this._workspaces();
      if (workspaces.workspaces.length === 0) {
        await this.createAndSaveWorkspace('Default Workspace', true);
      } else {
        let activeWorkspace = workspaces.workspaces.find((workspace) => workspace.used);
        if (!activeWorkspace) {
          activeWorkspace = workspaces.workspaces.find((workspace) => workspace.default);
          activeWorkspace.used = true;
          await this.saveWorkspaces();
        }
        if (!activeWorkspace) {
          activeWorkspace = workspaces.workspaces[0];
          activeWorkspace.used = true;
          await this.saveWorkspaces();
        }
        this.changeWorkspace(activeWorkspace, true);
      }
    }
  },

  handleTabClose(event) {
    if (this.__contextIsDelete) {
      return; // Bug when closing tabs from the context menu
    }
    let tab = event.target;
    let workspaceID = tab.getAttribute('zen-workspace-id');
    // If the tab is the last one in the workspace, create a new tab
    if (workspaceID) {
      let tabs = gBrowser.tabs.filter((tab) => tab.getAttribute('zen-workspace-id') === workspaceID);
      if (tabs.length === 1) {
        this._createNewTabForWorkspace({ uuid: workspaceID });
        // We still need to close other tabs in the workspace
        this.changeWorkspace({ uuid: workspaceID }, true);
      }
    }
  },

  _kIcons: JSON.parse(Services.prefs.getStringPref("zen.workspaces.icons")).map((icon) => icon),

  _initializeWorkspaceCreationIcons() {
    let container = document.getElementById('PanelUI-zen-workspaces-create-icons-container');
    for (let icon of this._kIcons) {
      let button = document.createXULElement('toolbarbutton');
      button.className = 'toolbarbutton-1';
      button.setAttribute('label', icon);
      button.onclick = ((event) => {
        let wasSelected = button.hasAttribute('selected');
        for (let button of container.children) {
          button.removeAttribute('selected');
        }
        if (!wasSelected) {
          button.setAttribute('selected', 'true');
        }
      }).bind(this, button);
      container.appendChild(button);
    }
  },

  _initializeWorkspaceEditIcons() {
    let container = this._workspaceEditIconsContainer;
    for (let icon of this._kIcons) {
      let button = document.createXULElement('toolbarbutton');
      button.className = 'toolbarbutton-1';
      button.setAttribute('label', icon);
      button.onclick = ((event) => {
        let wasSelected = button.hasAttribute('selected');
        for (let button of container.children) {
          button.removeAttribute('selected');
        }
        if (!wasSelected) {
          button.setAttribute('selected', 'true');
        }
        this.onWorkspaceEditChange();
      }).bind(this, button);
      container.appendChild(button);
    }
  },

  async saveWorkspace(workspaceData) {
    let json = await IOUtils.readJSON(this._storeFile);
    if (typeof json.workspaces === 'undefined') {
      json.workspaces = [];
    }
    let existing = json.workspaces.findIndex((workspace) => workspace.uuid === workspaceData.uuid);
    if (existing >= 0) {
      json.workspaces[existing] = workspaceData;
    } else {
      json.workspaces.push(workspaceData);
    }
    console.info('ZenWorkspaces: Saving workspace', workspaceData);
    await IOUtils.writeJSON(this._storeFile, json);
    this._workspaceCache = null;

    await this._updateWorkspacesChangeContextMenu();
  },

  async removeWorkspace(windowID) {
    let json = await this._workspaces();
    console.info('ZenWorkspaces: Removing workspace', windowID);
    await this.changeWorkspace(json.workspaces.find((workspace) => workspace.uuid !== windowID));
    this._deleteAllTabsInWorkspace(windowID);
    delete this._lastSelectedWorkspaceTabs[windowID];
    json.workspaces = json.workspaces.filter((workspace) => workspace.uuid !== windowID);
    await this.unsafeSaveWorkspaces(json);
    await this._propagateWorkspaceData();
    await this._updateWorkspacesChangeContextMenu();
  },

  async saveWorkspaces() {
    await IOUtils.writeJSON(this._storeFile, await this._workspaces());
    this._workspaceCache = null;
  },

  async unsafeSaveWorkspaces(workspaces) {
    await IOUtils.writeJSON(this._storeFile, workspaces);
    this._workspaceCache = workspaces;
  },

  // Workspaces dialog UI management

  openSaveDialog() {
    let parentPanel = document.getElementById('PanelUI-zen-workspaces-multiview');
    PanelUI.showSubView('PanelUI-zen-workspaces-create', parentPanel);
  },

  async openEditDialog(workspaceUuid) {
    this._workspaceEditDialog.setAttribute('data-workspace-uuid', workspaceUuid);
    document.getElementById('PanelUI-zen-workspaces-edit-save').setAttribute('disabled', 'true');
    let workspaces = (await this._workspaces()).workspaces;
    let workspaceData = workspaces.find((workspace) => workspace.uuid === workspaceUuid);
    this._workspaceEditInput.textContent = workspaceData.name;
    this._workspaceEditInput.value = workspaceData.name;
    this._workspaceEditInput.setAttribute('data-initial-value', workspaceData.name);
    this._workspaceEditIconsContainer.setAttribute('data-initial-value', workspaceData.icon);
    document.querySelectorAll('#PanelUI-zen-workspaces-edit-icons-container toolbarbutton').forEach((button) => {
      if (button.label === workspaceData.icon) {
        button.setAttribute('selected', 'true');
      } else {
        button.removeAttribute('selected');
      }
    });
    let parentPanel = document.getElementById('PanelUI-zen-workspaces-multiview');
    PanelUI.showSubView('PanelUI-zen-workspaces-edit', parentPanel);
  },

  closeWorkspacesSubView() {
    let parentPanel = document.getElementById('PanelUI-zen-workspaces-multiview');
    parentPanel.goBack();
  },

  workspaceHasIcon(workspace) {
    return typeof workspace.icon !== 'undefined' && workspace.icon !== '';
  },

  getWorkspaceIcon(workspace) {
    if (this.workspaceHasIcon(workspace)) {
      return workspace.icon;
    }
    return workspace.name[0].toUpperCase();
  },

  async _propagateWorkspaceData() {
    let currentContainer = document.getElementById('PanelUI-zen-workspaces-current-info');
    let workspaceList = document.getElementById('PanelUI-zen-workspaces-list');
    const createWorkspaceElement = (workspace) => {
      let element = document.createXULElement('toolbarbutton');
      element.className = 'subviewbutton';
      element.setAttribute('tooltiptext', workspace.name);
      element.setAttribute('zen-workspace-id', workspace.uuid);
      if (workspace.used) {
        element.setAttribute('active', 'true');
      }
      if (workspace.default) {
        element.setAttribute('default', 'true');
      }
      const containerGroup = ContextualIdentityService.getPublicIdentities().find(
        (container) => container.userContextId === workspace.containerTabId
      );
      if (containerGroup) {
        element.classList.add('identity-color-' + containerGroup.color);
        element.setAttribute('data-usercontextid', containerGroup.userContextId);
      }
      let childs = window.MozXULElement.parseXULToFragment(`
        <div class="zen-workspace-icon">
        </div>
        <vbox>
          <div class="zen-workspace-name">
          </div>
          <div class="zen-workspace-container" ${containerGroup ? '' : 'hidden="true"'}>
          </div>
        </vbox>
        <toolbarbutton closemenu="none" class="toolbarbutton-1 zen-workspace-actions">
          <image class="toolbarbutton-icon" id="zen-workspace-actions-menu-icon"></image>
        </toolbarbutton>
      `);

      // use text content instead of innerHTML to avoid XSS
      childs.querySelector('.zen-workspace-icon').textContent = this.getWorkspaceIcon(workspace);
      childs.querySelector('.zen-workspace-name').textContent = workspace.name;
      if (containerGroup) {
        childs.querySelector('.zen-workspace-container').textContent = ContextualIdentityService.getUserContextLabel(
          containerGroup.userContextId
        );
      }

      childs.querySelector('.zen-workspace-actions').addEventListener('command', (event) => {
        let button = event.target;
        this._contextMenuId = button.closest('toolbarbutton[zen-workspace-id]').getAttribute('zen-workspace-id');
        const popup = button.ownerDocument.getElementById('zenWorkspaceActionsMenu');
        popup.openPopup(button, 'after_end');
      });
      element.appendChild(childs);
      element.onclick = (async () => {
        if (event.target.closest('.zen-workspace-actions')) {
          return; // Ignore clicks on the actions button
        }
        await this.changeWorkspace(workspace);
        let panel = document.getElementById('PanelUI-zen-workspaces');
        PanelMultiView.hidePopup(panel);
        document.getElementById('zen-workspaces-button').removeAttribute('open');
      }).bind(this, workspace);
      return element;
    };
    let workspaces = await this._workspaces();
    let activeWorkspace = workspaces.workspaces.find((workspace) => workspace.used);
    currentContainer.innerHTML = '';
    workspaceList.innerHTML = '';
    workspaceList.parentNode.style.display = 'flex';
    if (workspaces.workspaces.length - 1 <= 0) {
      workspaceList.innerHTML = 'No workspaces available';
      workspaceList.setAttribute('empty', 'true');
    } else {
      workspaceList.removeAttribute('empty');
    }
    if (activeWorkspace) {
      let currentWorkspace = createWorkspaceElement(activeWorkspace);
      currentContainer.appendChild(currentWorkspace);
    }
    for (let workspace of workspaces.workspaces) {
      if (workspace.used) {
        continue;
      }
      let workspaceElement = createWorkspaceElement(workspace);
      workspaceList.appendChild(workspaceElement);
    }
  },

  async openWorkspacesDialog(event) {
    if (!this.workspaceEnabled) {
      return;
    }
    let target = event.target;
    let panel = document.getElementById('PanelUI-zen-workspaces');
    await this._propagateWorkspaceData();
    PanelMultiView.openPopup(panel, target, {
      position: 'bottomright topright',
      triggerEvent: event,
    }).catch(console.error);
  },

  initializeWorkspacesButton() {
    if (!this.workspaceEnabled) {
      return;
    } else if (document.getElementById('zen-workspaces-button')) {
      let button = document.getElementById('zen-workspaces-button');
      button.removeAttribute('hidden');
      return;
    }
    let browserTabs = document.getElementById('tabbrowser-tabs');
    let button = document.createElement('toolbarbutton');
    button.id = 'zen-workspaces-button';
    button.className = 'toolbarbutton-1 chromeclass-toolbar-additional';
    button.setAttribute('label', 'Workspaces');
    button.setAttribute('tooltiptext', 'Workspaces');
    button.onclick = this.openWorkspacesDialog.bind(this);
    browserTabs.insertAdjacentElement('beforebegin', button);
  },

  async _updateWorkspacesButton() {
    let button = document.getElementById('zen-workspaces-button');
    if (!button) {
      return;
    }
    let activeWorkspace = (await this._workspaces()).workspaces.find((workspace) => workspace.used);
    if (activeWorkspace) {
      button.innerHTML = `
        <div class="zen-workspace-sidebar-icon">
        </div>
        <div class="zen-workspace-sidebar-name">
        </div>
      `;

      // use text content instead of innerHTML to avoid XSS
      button.querySelector('.zen-workspace-sidebar-name').textContent = activeWorkspace.name;
      button.querySelector('.zen-workspace-sidebar-icon').textContent = this.getWorkspaceIcon(activeWorkspace);

      if (!this.workspaceHasIcon(activeWorkspace)) {
        button.querySelector('.zen-workspace-sidebar-icon').setAttribute('no-icon', 'true');
      }
    }
  },

  // Workspaces management

  get _workspaceCreateInput() {
    return document.getElementById('PanelUI-zen-workspaces-create-input');
  },

  get _workspaceEditDialog() {
    return document.getElementById('PanelUI-zen-workspaces-edit');
  },

  get _workspaceEditInput() {
    return document.getElementById('PanelUI-zen-workspaces-edit-input');
  },

  get _workspaceEditIconsContainer() {
    return document.getElementById('PanelUI-zen-workspaces-edit-icons-container');
  },

  _deleteAllTabsInWorkspace(workspaceID) {
    for (let tab of gBrowser.tabs) {
      if (tab.getAttribute('zen-workspace-id') === workspaceID) {
        gBrowser.removeTab(tab, {
          animate: true,
          skipSessionStore: true,
          closeWindowWithLastTab: false,
        });
      }
    }
  },

  _prepareNewWorkspace(window) {
    document.documentElement.setAttribute('zen-workspace-id', window.uuid);
    let tabCount = 0;
    for (let tab of gBrowser.tabs) {
      if (!tab.hasAttribute('zen-workspace-id')) {
        tab.setAttribute('zen-workspace-id', window.uuid);
        tabCount++;
      }
    }
    if (tabCount === 0) {
      this._createNewTabForWorkspace(window);
    }
  },

  _createNewTabForWorkspace(window) {
    let tab = gZenUIManager.openAndChangeToTab(Services.prefs.getStringPref('browser.startup.homepage'));
    tab.setAttribute('zen-workspace-id', window.uuid);
  },

  async saveWorkspaceFromCreate() {
    let workspaceName = this._workspaceCreateInput.value;
    if (!workspaceName) {
      return;
    }
    this._workspaceCreateInput.value = '';
    let icon = document.querySelector('#PanelUI-zen-workspaces-create-icons-container [selected]');
    icon?.removeAttribute('selected');
    await this.createAndSaveWorkspace(workspaceName, false, icon?.label);
    document.getElementById('PanelUI-zen-workspaces').hidePopup(true);
  },

  async saveWorkspaceFromEdit() {
    let workspaceUuid = this._workspaceEditDialog.getAttribute('data-workspace-uuid');
    let workspaceName = this._workspaceEditInput.value;
    if (!workspaceName) {
      return;
    }
    this._workspaceEditInput.value = '';
    let icon = document.querySelector('#PanelUI-zen-workspaces-edit-icons-container [selected]');
    icon?.removeAttribute('selected');
    let workspaces = (await this._workspaces()).workspaces;
    let workspaceData = workspaces.find((workspace) => workspace.uuid === workspaceUuid);
    workspaceData.name = workspaceName;
    workspaceData.icon = icon?.label;
    await this.saveWorkspace(workspaceData);
    await this._updateWorkspacesButton();
    await this._propagateWorkspaceData();
    this.closeWorkspacesSubView();
  },

  onWorkspaceCreationNameChange(event) {
    let button = document.getElementById('PanelUI-zen-workspaces-create-save');
    if (this._workspaceCreateInput.value === '') {
      button.setAttribute('disabled', 'true');
      return;
    }
    button.removeAttribute('disabled');
  },

  onWorkspaceEditChange() {
    let button = document.getElementById('PanelUI-zen-workspaces-edit-save');
    let name = this._workspaceEditInput.value;
    let icon = document.querySelector('#PanelUI-zen-workspaces-edit-icons-container [selected]')?.label;
    if (
      name === this._workspaceEditInput.getAttribute('data-initial-value') &&
      icon === this._workspaceEditIconsContainer.getAttribute('data-initial-value')
    ) {
      button.setAttribute('disabled', 'true');
      return;
    }
    button.removeAttribute('disabled');
  },

  get _shouldAllowPinTab() {
    return Services.prefs.getBoolPref('zen.workspaces.individual-pinned-tabs');
  },

  async changeWorkspace(window, onInit = false) {
    if (!this.workspaceEnabled) {
      return;
    }
    const shouldAllowPinnedTabs = this._shouldAllowPinTab;
    let firstTab = undefined;
    let workspaces = await this._workspaces();
    for (let workspace of workspaces.workspaces) {
      workspace.used = workspace.uuid === window.uuid;
    }
    this.unsafeSaveWorkspaces(workspaces);
    console.info('ZenWorkspaces: Changing workspace to', window.uuid);
    for (let i = 0; i < gBrowser.tabs.length; i++) {
      let tab = gBrowser.tabs[i];
      if ((tab.getAttribute('zen-workspace-id') === window.uuid && !(tab.pinned && !shouldAllowPinnedTabs)) || !tab.hasAttribute('zen-workspace-id')) {
        if (!firstTab) {
          firstTab = tab;
        } else if (gBrowser.selectedTab === tab) {
          // If the selected tab is already in the workspace, we don't want to change it
          firstTab = null; // note: Do not add "undefined" here, a new tab would be created
        }
        gBrowser.showTab(tab);
        if (!tab.hasAttribute('zen-workspace-id')) {
          // We add the id to those tabs that got inserted before we initialize the workspaces
          // example use case: opening a link from an external app
          tab.setAttribute('zen-workspace-id', window.uuid);
        }
      }
    }
    if (firstTab) {
      gBrowser.selectedTab = this._lastSelectedWorkspaceTabs[window.uuid] ?? firstTab;
    }
    if (typeof firstTab === 'undefined' && !onInit) {
      this._createNewTabForWorkspace(window);
    }
    for (let i = 0; i < gBrowser.tabs.length; i++) {
      let tab = gBrowser.tabs[i];
      if (tab.getAttribute('zen-workspace-id') !== window.uuid) {
        // FOR UNLOADING TABS:
        // gBrowser.discardBrowser(tab, true);
        gBrowser.hideTab(tab, undefined, shouldAllowPinnedTabs);
      }
    }
    document.documentElement.setAttribute('zen-workspace-id', window.uuid);
    await this.saveWorkspaces();
    await this._updateWorkspacesButton();
    await this._propagateWorkspaceData();
    await this._updateWorkspacesChangeContextMenu();

    document.getElementById('tabbrowser-tabs')._positionPinnedTabs();
  },

  async _updateWorkspacesChangeContextMenu() {
    const workspaces = await this._workspaces();

    const menuPopup = document.getElementById('context-zen-change-workspace-tab-menu-popup');

    menuPopup.innerHTML = '';

    const activeWorkspace = workspaces.workspaces.find((workspace) => workspace.used);

    for (let workspace of workspaces.workspaces) {
      const menuItem = document.createXULElement('menuitem');
      menuItem.setAttribute('label', workspace.name);
      menuItem.setAttribute('zen-workspace-id', workspace.uuid);

      if (workspace.uuid === activeWorkspace.uuid) {
        menuItem.setAttribute('disabled', 'true');
      }

      menuPopup.appendChild(menuItem);
    }
  },

  _createWorkspaceData(name, isDefault, icon) {
    let window = {
      uuid: gZenUIManager.generateUuidv4(),
      default: isDefault,
      used: true,
      icon: icon,
      name: name,
    };
    this._prepareNewWorkspace(window);
    return window;
  },

  async createAndSaveWorkspace(name = 'New Workspace', isDefault = false, icon = undefined) {
    if (!this.workspaceEnabled) {
      return;
    }
    let workspaceData = this._createWorkspaceData(name, isDefault, icon);
    await this.saveWorkspace(workspaceData);
    await this.changeWorkspace(workspaceData);
  },

  async onLocationChange(browser) {
    let tab = gBrowser.getTabForBrowser(browser);
    let workspaceID = tab.getAttribute('zen-workspace-id');
    if (!workspaceID) {
      let workspaces = await this._workspaces();
      let activeWorkspace = workspaces.workspaces.find((workspace) => workspace.used);
      if (!activeWorkspace || tab.hasAttribute('hidden')) {
        return;
      }
      tab.setAttribute('zen-workspace-id', activeWorkspace.uuid);
      workspaceID = activeWorkspace.uuid;
    }
    this._lastSelectedWorkspaceTabs[workspaceID] = tab;
  },

  // Context menu management

  _contextMenuId: null,
  async updateContextMenu(_) {
    console.assert(this._contextMenuId, 'No context menu ID set');
    document
      .querySelector(`#PanelUI-zen-workspaces [zen-workspace-id="${this._contextMenuId}"] .zen-workspace-actions`)
      .setAttribute('active', 'true');
    const workspaces = await this._workspaces();
    let deleteMenuItem = document.getElementById('context_zenDeleteWorkspace');
    if (
      workspaces.workspaces.length <= 1 ||
      workspaces.workspaces.find((workspace) => workspace.uuid === this._contextMenuId).default
    ) {
      deleteMenuItem.setAttribute('disabled', 'true');
    } else {
      deleteMenuItem.removeAttribute('disabled');
    }
    let defaultMenuItem = document.getElementById('context_zenSetAsDefaultWorkspace');
    if (workspaces.workspaces.find((workspace) => workspace.uuid === this._contextMenuId).default) {
      defaultMenuItem.setAttribute('disabled', 'true');
    } else {
      defaultMenuItem.removeAttribute('disabled');
    }
    let openMenuItem = document.getElementById('context_zenOpenWorkspace');
    if (workspaces.workspaces.find((workspace) => workspace.uuid === this._contextMenuId).used) {
      openMenuItem.setAttribute('disabled', 'true');
    } else {
      openMenuItem.removeAttribute('disabled');
    }
  },

  async contextChangeContainerTab(event) {
    let workspaces = await this._workspaces();
    let workspace = workspaces.workspaces.find((workspace) => workspace.uuid === this._contextMenuId);
    let userContextId = parseInt(event.target.getAttribute('data-usercontextid'));
    workspace.containerTabId = userContextId;
    await this.saveWorkspace(workspace);
    await this._propagateWorkspaceData();
  },

  onContextMenuClose() {
    let target = document.querySelector(
      `#PanelUI-zen-workspaces [zen-workspace-id="${this._contextMenuId}"] .zen-workspace-actions`
    );
    if (target) {
      target.removeAttribute('active');
    }
    this._contextMenuId = null;
  },

  async setDefaultWorkspace() {
    let workspaces = await this._workspaces();
    for (let workspace of workspaces.workspaces) {
      workspace.default = workspace.uuid === this._contextMenuId;
    }
    await this.unsafeSaveWorkspaces(workspaces);
    await this._propagateWorkspaceData();
  },

  async openWorkspace() {
    let workspaces = await this._workspaces();
    let workspace = workspaces.workspaces.find((workspace) => workspace.uuid === this._contextMenuId);
    await this.changeWorkspace(workspace);
  },

  async contextDelete(event) {
    this.__contextIsDelete = true;
    event.stopPropagation();
    await this.removeWorkspace(this._contextMenuId);
    this.__contextIsDelete = false;
  },

  async contextEdit(event) {
    event.stopPropagation();
    await this.openEditDialog(this._contextMenuId);
  },

  async changeWorkspaceShortcut() {
    // Cycle through workspaces
    let workspaces = await this._workspaces();
    let activeWorkspace = workspaces.workspaces.find((workspace) => workspace.used);
    let workspaceIndex = workspaces.workspaces.indexOf(activeWorkspace);
    let nextWorkspace = workspaces.workspaces[workspaceIndex + 1] || workspaces.workspaces[0];
    this.changeWorkspace(nextWorkspace);
  },

  _initializeWorkspaceTabContextMenus() {
    const menu = document.createXULElement('menu');
    menu.setAttribute('id', 'context-zen-change-workspace-tab');
    menu.setAttribute('data-l10n-id', 'context-zen-change-workspace-tab');

    const menuPopup = document.createXULElement('menupopup');
    menuPopup.setAttribute('id', 'context-zen-change-workspace-tab-menu-popup');
    menuPopup.setAttribute('oncommand', "ZenWorkspaces.changeTabWorkspace(event.target.getAttribute('zen-workspace-id'))");

    menu.appendChild(menuPopup);

    document.getElementById('context_closeDuplicateTabs').after(menu);
  },

  async changeTabWorkspace(workspaceID) {
    const tabs = TabContextMenu.contextTab.multiselected ? gBrowser.selectedTabs : [TabContextMenu.contextTab];
    const previousWorkspaceID = document.documentElement.getAttribute('zen-workspace-id');
    for (let tab of tabs) {
      tab.setAttribute('zen-workspace-id', workspaceID);
      if (this._lastSelectedWorkspaceTabs[previousWorkspaceID] === tab) {
        // This tab is no longer the last selected tab in the previous workspace because it's being moved to
        // the current workspace
        delete this._lastSelectedWorkspaceTabs[previousWorkspaceID];
      }
    }
    const workspaces = await this._workspaces();
    await this.changeWorkspace(workspaces.workspaces.find((workspace) => workspace.uuid === workspaceID));
  },

  // Tab browser utilities
  createContainerTabMenu(event) {
    let window = event.target.ownerGlobal;
    const workspace = this._workspaceCache.workspaces.find((workspace) => this._contextMenuId === workspace.uuid);
    let containerTabId = workspace.containerTabId;
    return window.createUserContextMenu(event, {
      isContextMenu: true,
      excludeUserContextId: containerTabId,
      showDefaultTab: true,
    });
  },

  getContextIdIfNeeded(userContextId) {
    if (typeof userContextId !== 'undefined' || !this.workspaceEnabled) {
      return [userContextId, false];
    }
    const activeWorkspace = this.getActiveWorkspaceFromCache();
    return [activeWorkspace?.containerTabId, true];
  },
};

ZenWorkspaces.init();
