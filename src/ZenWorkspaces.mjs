var ZenWorkspaces = new (class extends ZenMultiWindowFeature {
  /**
   * Stores workspace IDs and their last selected tabs.
   */
  _lastSelectedWorkspaceTabs = {};
  _inChangingWorkspace = false;

  async init() {
    if (!this.shouldHaveWorkspaces) {
      console.warn('ZenWorkspaces: !!! ZenWorkspaces is disabled in hidden windows !!!');
      return; // We are in a hidden window, don't initialize ZenWorkspaces
    }
    console.info('ZenWorkspaces: Initializing ZenWorkspaces...');
    XPCOMUtils.defineLazyPreferenceGetter(
      this,
      'shouldShowIconStrip',
      'zen.workspaces.show-icon-strip',
      true,
      this._expandWorkspacesStrip.bind(this)
    );
    XPCOMUtils.defineLazyPreferenceGetter(
        this,
        'shouldForceContainerTabsToWorkspace',
        'zen.workspaces.force-container-workspace',
        true
    );
    ChromeUtils.defineLazyGetter(this, 'tabContainer', () => document.getElementById('tabbrowser-tabs'));
    await ZenWorkspacesStorage.init();
    if(!Weave.Service.engineManager.get("workspaces")) {
      Weave.Service.engineManager.register(ZenWorkspacesEngine);
      await ZenWorkspacesStorage.migrateWorkspacesFromJSON();
    }
    await this.initializeWorkspaces();
    console.info('ZenWorkspaces: ZenWorkspaces initialized');

    // Add observer for sync completion
    Services.obs.addObserver(this, "weave:engine:sync:finish");
  }

  async observe(subject, topic, data) {
    if (topic === "weave:engine:sync:finish" && data === "workspaces") {
      try {
        const lastChangeTimestamp = await ZenWorkspacesStorage.getLastChangeTimestamp();

        if (!this._workspaceCache || !this._workspaceCache.lastChangeTimestamp || lastChangeTimestamp > this._workspaceCache.lastChangeTimestamp) {
          this._workspaceCache = null;
          await this._propagateWorkspaceData();
        }
      } catch (error) {
        console.error("Error updating workspaces after sync:", error);
      }
    }
  }

  get shouldHaveWorkspaces() {
    if (typeof this._shouldHaveWorkspaces === 'undefined') {
      let docElement = document.documentElement;
      this._shouldHaveWorkspaces = !(
        docElement.hasAttribute('privatebrowsingmode') ||
        docElement.getAttribute('chromehidden').includes('toolbar') ||
        docElement.getAttribute('chromehidden').includes('menubar')
      );
      return this._shouldHaveWorkspaces;
    }
    return this._shouldHaveWorkspaces;
  }

  get workspaceEnabled() {
    if (typeof this._workspaceEnabled === 'undefined') {
      this._workspaceEnabled = Services.prefs.getBoolPref('zen.workspaces.enabled', false) && this.shouldHaveWorkspaces;
      return this._workspaceEnabled;
    }
    return this._workspaceEnabled;
  }

  getActiveWorkspaceFromCache() {
    try {
      const activeWorkspaceId = Services.prefs.getStringPref('zen.workspaces.active', '');
      return this._workspaceCache.workspaces.find((workspace) => workspace.uuid === activeWorkspaceId);
    } catch (e) {
      return null;
    }
  }

  async _workspaces() {
    if (this._workspaceCache) {
      return this._workspaceCache;
    }

    const [workspaces, lastChangeTimestamp] = await Promise.all([
      ZenWorkspacesStorage.getWorkspaces(),
      ZenWorkspacesStorage.getLastChangeTimestamp()
    ]);

    this._workspaceCache = { workspaces, lastChangeTimestamp };
    // Get the active workspace ID from preferences
    const activeWorkspaceId = Services.prefs.getStringPref('zen.workspaces.active', '');

    if (activeWorkspaceId) {
      const activeWorkspace = this._workspaceCache.workspaces.find((w) => w.uuid === activeWorkspaceId);
      // Set the active workspace ID to the first one if the one with selected id doesn't exist
      if (!activeWorkspace) {
        Services.prefs.setStringPref('zen.workspaces.active', this._workspaceCache.workspaces[0]?.uuid);
      }
    } else {
      // Set the active workspace ID to the first one if active workspace doesn't exist
      Services.prefs.setStringPref('zen.workspaces.active', this._workspaceCache.workspaces[0]?.uuid);
    }
    // sort by position
    this._workspaceCache.workspaces.sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity));

    return this._workspaceCache;
  }

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
  }

  async initializeWorkspaces() {
    Services.prefs.addObserver('zen.workspaces.enabled', this.onWorkspacesEnabledChanged.bind(this));

    await this.initializeWorkspacesButton();
    if (this.workspaceEnabled) {
      this._initializeWorkspaceCreationIcons();
      this._initializeWorkspaceEditIcons();
      this._initializeWorkspaceTabContextMenus();
      window.addEventListener('TabClose', this.handleTabClose.bind(this));
      window.addEventListener('TabBrowserInserted', this.onTabBrowserInserted.bind(this));
      let workspaces = await this._workspaces();
      if (workspaces.workspaces.length === 0) {
        await this.createAndSaveWorkspace('Default Workspace', true);
      } else {
        let activeWorkspace = await this.getActiveWorkspace();
        if (!activeWorkspace) {
          activeWorkspace = workspaces.workspaces.find((workspace) => workspace.default);
          Services.prefs.setStringPref('zen.workspaces.active', activeWorkspace.uuid);
        }
        if (!activeWorkspace) {
          activeWorkspace = workspaces.workspaces[0];
          Services.prefs.setStringPref('zen.workspaces.active', activeWorkspace.uuid);
        }
        await SessionStore.promiseInitialized;
        await this.changeWorkspace(activeWorkspace, true);
      }
    }
  }

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
  }

  _kIcons = JSON.parse(Services.prefs.getStringPref('zen.workspaces.icons')).map((icon) =>
    typeof Intl.Segmenter !== 'undefined' ? new Intl.Segmenter().segment(icon).containing().segment : Array.from(icon)[0]
  );

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
  }

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
  }

  async saveWorkspace(workspaceData) {
    await ZenWorkspacesStorage.saveWorkspace(workspaceData);
    this._workspaceCache = null;
    await this._propagateWorkspaceData();
    await this._updateWorkspacesChangeContextMenu();
  }

  async removeWorkspace(windowID) {
    let workspacesData = await this._workspaces();
    console.info('ZenWorkspaces: Removing workspace', windowID);
    await this.changeWorkspace(workspacesData.workspaces.find((workspace) => workspace.uuid !== windowID));
    this._deleteAllTabsInWorkspace(windowID);
    delete this._lastSelectedWorkspaceTabs[windowID];
    await ZenWorkspacesStorage.removeWorkspace(windowID);
    this._workspaceCache = null;
    await this._propagateWorkspaceData();
    await this._updateWorkspacesChangeContextMenu();
  }

  isWorkspaceActive(workspace) {
    const activeWorkspaceId = Services.prefs.getStringPref('zen.workspaces.active', '');
    return workspace.uuid === activeWorkspaceId;
  }

  async getActiveWorkspace() {
    const workspaces = await this._workspaces();
    const activeWorkspaceId = Services.prefs.getStringPref('zen.workspaces.active', '');
    return workspaces.workspaces.find((workspace) => workspace.uuid === activeWorkspaceId);
  }
  // Workspaces dialog UI management

  openSaveDialog() {
    let parentPanel = document.getElementById('PanelUI-zen-workspaces-multiview');
    PanelUI.showSubView('PanelUI-zen-workspaces-create', parentPanel);
  }

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
  }

  closeWorkspacesSubView() {
    let parentPanel = document.getElementById('PanelUI-zen-workspaces-multiview');
    parentPanel.goBack();
  }

  workspaceHasIcon(workspace) {
    return workspace.icon && workspace.icon !== '';
  }

  getWorkspaceIcon(workspace) {
    if (this.workspaceHasIcon(workspace)) {
      return workspace.icon;
    }
    if (typeof Intl.Segmenter !== 'undefined') {
      return new Intl.Segmenter().segment(workspace.name).containing().segment.toUpperCase();
    }
    return Array.from(workspace.name)[0].toUpperCase();
  }

  get shouldShowContainers() {
    return (
      Services.prefs.getBoolPref('privacy.userContext.ui.enabled') && ContextualIdentityService.getPublicIdentities().length > 0
    );
  }

  async _propagateWorkspaceData({ ignoreStrip = false } = {}) {
    await this.foreachWindowAsActive(async (browser) => {
      let currentContainer = browser.document.getElementById('PanelUI-zen-workspaces-current-info');
      let workspaceList = browser.document.getElementById('PanelUI-zen-workspaces-list');
      const createWorkspaceElement = (workspace) => {
        let element = browser.document.createXULElement('toolbarbutton');
        element.className = 'subviewbutton';
        element.setAttribute('tooltiptext', workspace.name);
        element.setAttribute('zen-workspace-id', workspace.uuid);
        if (this.isWorkspaceActive(workspace)) {
          element.setAttribute('active', 'true');
        }
        if (workspace.default) {
          element.setAttribute('default', 'true');
        }
        const containerGroup = browser.ContextualIdentityService.getPublicIdentities().find(
          (container) => container.userContextId === workspace.containerTabId
        );
        if (containerGroup) {
          element.classList.add('identity-color-' + containerGroup.color);
          element.setAttribute('data-usercontextid', containerGroup.userContextId);
        }
        let childs = browser.MozXULElement.parseXULToFragment(`
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
        childs.querySelector('.zen-workspace-icon').textContent = browser.ZenWorkspaces.getWorkspaceIcon(workspace);
        childs.querySelector('.zen-workspace-name').textContent = workspace.name;
        if (containerGroup) {
          childs.querySelector('.zen-workspace-container').textContent = ContextualIdentityService.getUserContextLabel(
            containerGroup.userContextId
          );
        }

        childs.querySelector('.zen-workspace-actions').addEventListener('command', (event) => {
          let button = event.target;
          browser.ZenWorkspaces._contextMenuId = button
            .closest('toolbarbutton[zen-workspace-id]')
            .getAttribute('zen-workspace-id');
          const popup = button.ownerDocument.getElementById('zenWorkspaceActionsMenu');
          popup.openPopup(button, 'after_end');
        });
        element.appendChild(childs);
        element.onclick = (async () => {
          if (event.target.closest('.zen-workspace-actions')) {
            return; // Ignore clicks on the actions button
          }
          await browser.ZenWorkspaces.changeWorkspace(workspace);
          let panel = browser.document.getElementById('PanelUI-zen-workspaces');
          PanelMultiView.hidePopup(panel);
          browser.document.getElementById('zen-workspaces-button').removeAttribute('open');
        }).bind(browser.ZenWorkspaces, workspace, browser);
        return element;
      };
      browser.ZenWorkspaces._workspaceCache = null;
      let workspaces = await browser.ZenWorkspaces._workspaces();
      let activeWorkspace = await this.getActiveWorkspace();
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
        if (this.isWorkspaceActive(workspace)) {
          continue;
        }
        let workspaceElement = createWorkspaceElement(workspace);
        workspaceList.appendChild(workspaceElement);
      }
      if (!ignoreStrip) {
        await browser.ZenWorkspaces._expandWorkspacesStrip(browser);
      }
    });
  }

  async openWorkspacesDialog(event) {
    if (!this.workspaceEnabled) {
      return;
    }
    let target = document.getElementById('zen-workspaces-button');
    let panel = document.getElementById('PanelUI-zen-workspaces');
    await this._propagateWorkspaceData({
      ignoreStrip: true,
    });
    PanelMultiView.openPopup(panel, target, {
      position: 'bottomright topright',
      triggerEvent: event,
    }).catch(console.error);
  }

  async initializeWorkspacesButton() {
    if (!this.workspaceEnabled) {
      return;
    } else if (document.getElementById('zen-workspaces-button')) {
      let button = document.getElementById('zen-workspaces-button');
      button.removeAttribute('hidden');
      return;
    }
    await this._expandWorkspacesStrip();
  }

  async _expandWorkspacesStrip(browser = undefined) {
    if (typeof browser === 'undefined' || typeof browser.ZenWorkspaces === 'undefined') {
      browser = window;
    }
    let workspaces = await browser.ZenWorkspaces._workspaces();
    let workspaceList = browser.document.getElementById('zen-workspaces-button');
    const newWorkspacesButton = browser.document.createXULElement('toolbarbutton');
    newWorkspacesButton.id = 'zen-workspaces-button';
    newWorkspacesButton.setAttribute('removable', 'true');
    newWorkspacesButton.setAttribute('showInPrivateBrowsing', 'false');
    newWorkspacesButton.setAttribute('tooltiptext', 'Workspaces');

    if (this.shouldShowIconStrip) {
      for (let workspace of workspaces.workspaces) {
        let button = browser.document.createXULElement('toolbarbutton');
        button.className = 'subviewbutton';
        button.setAttribute('tooltiptext', workspace.name);
        button.setAttribute('zen-workspace-id', workspace.uuid);
        if (this.isWorkspaceActive(workspace)) {
          button.setAttribute('active', 'true');
        }
        if (workspace.default) {
          button.setAttribute('default', 'true');
        }
        button.onclick = (async (_, event) => {
          // Make sure it's not a context menu event
          if (event.button !== 0) {
            return;
          }
          await this.changeWorkspace(workspace);
        }).bind(browser.ZenWorkspaces, workspace);
        let icon = browser.document.createXULElement('div');
        icon.className = 'zen-workspace-icon';
        icon.textContent = this.getWorkspaceIcon(workspace);
        button.appendChild(icon);
        newWorkspacesButton.appendChild(button);
      }
      // Listen for context menu events and open the all workspaces dialog
      newWorkspacesButton.addEventListener(
        'contextmenu',
        ((event) => {
          event.preventDefault();
          browser.ZenWorkspaces.openWorkspacesDialog(event);
        }).bind(this)
      );
    }

    workspaceList.after(newWorkspacesButton);
    workspaceList.remove();

    if (!this.shouldShowIconStrip) {
      await this._updateWorkspacesButton(browser);
    }
  }

  async _updateWorkspacesButton(browser = window) {
    let button = browser.document.getElementById('zen-workspaces-button');
    if (!button) {
      return;
    }
    let activeWorkspace = await this.getActiveWorkspace();
    if (activeWorkspace) {
      button.setAttribute('as-button', 'true');
      button.classList.add('toolbarbutton-1', 'zen-sidebar-action-button');

      button.addEventListener('click', browser.ZenWorkspaces.openWorkspacesDialog.bind(browser.ZenWorkspaces));

      const wrapper = browser.document.createXULElement('hbox');
      wrapper.className = 'zen-workspace-sidebar-wrapper';

      const icon = browser.document.createElement('div');
      icon.className = 'zen-workspace-sidebar-icon';
      icon.textContent = this.getWorkspaceIcon(activeWorkspace);

      // use text content instead of innerHTML to avoid XSS
      const name = browser.document.createElement('div');
      name.className = 'zen-workspace-sidebar-name';
      name.textContent = activeWorkspace.name;

      if (!this.workspaceHasIcon(activeWorkspace)) {
        icon.setAttribute('no-icon', 'true');
      }

      wrapper.appendChild(icon);
      wrapper.appendChild(name);

      button.innerHTML = '';
      button.appendChild(wrapper);
    }
  }

  // Workspaces management

  get _workspaceCreateInput() {
    return document.getElementById('PanelUI-zen-workspaces-create-input');
  }

  get _workspaceEditDialog() {
    return document.getElementById('PanelUI-zen-workspaces-edit');
  }

  get _workspaceEditInput() {
    return document.getElementById('PanelUI-zen-workspaces-edit-input');
  }

  get _workspaceEditIconsContainer() {
    return document.getElementById('PanelUI-zen-workspaces-edit-icons-container');
  }

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
  }

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
  }

  _createNewTabForWorkspace(window) {
    let tab = gZenUIManager.openAndChangeToTab(Services.prefs.getStringPref('browser.startup.homepage'));
    tab.setAttribute('zen-workspace-id', window.uuid);
  }

  async saveWorkspaceFromCreate() {
    let workspaceName = this._workspaceCreateInput.value;
    if (!workspaceName) {
      return;
    }
    this._workspaceCreateInput.value = '';
    let icon = document.querySelector('#PanelUI-zen-workspaces-create-icons-container [selected]');
    icon?.removeAttribute('selected');
    await this.createAndSaveWorkspace(workspaceName, false, icon?.label);
    await this._updateWorkspacesButton();
    await this._propagateWorkspaceData();
    this.closeWorkspacesSubView();
  }

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
    await this._propagateWorkspaceData();
    this.closeWorkspacesSubView();
  }

  onWorkspaceCreationNameChange(event) {
    let button = document.getElementById('PanelUI-zen-workspaces-create-save');
    if (this._workspaceCreateInput.value === '') {
      button.setAttribute('disabled', 'true');
      return;
    }
    button.removeAttribute('disabled');
  }

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
  }

  get _shouldAllowPinTab() {
    return Services.prefs.getBoolPref('zen.workspaces.individual-pinned-tabs');
  }

  async changeWorkspace(window, onInit = false) {
    if (!this.workspaceEnabled || this._inChangingWorkspace) {
      return;
    }

    this._inChangingWorkspace = true;
    Services.prefs.setStringPref('zen.workspaces.active', window.uuid);

    const shouldAllowPinnedTabs = this._shouldAllowPinTab;
    await this.foreachWindowAsActive(async (browser) => {
      browser.ZenWorkspaces.tabContainer._invalidateCachedTabs();
      let firstTab = undefined;
      console.info('ZenWorkspaces: Changing workspace to', window.uuid);
      for (let tab of browser.gBrowser.tabs) {
        if (
          (tab.getAttribute('zen-workspace-id') === window.uuid && !(tab.pinned && !shouldAllowPinnedTabs)) ||
          !tab.hasAttribute('zen-workspace-id')
        ) {
          if (!firstTab) {
            firstTab = tab;
          } else if (browser.gBrowser.selectedTab === tab) {
            // If the selected tab is already in the workspace, we don't want to change it
            firstTab = null; // note: Do not add "undefined" here, a new tab would be created
          }
          browser.gBrowser.showTab(tab);
          if (!tab.hasAttribute('zen-workspace-id')) {
            // We add the id to those tabs that got inserted before we initialize the workspaces
            // example use case: opening a link from an external app
            tab.setAttribute('zen-workspace-id', window.uuid);
          }
        }
      }
      if (firstTab) {
        browser.gBrowser.selectedTab = browser.ZenWorkspaces._lastSelectedWorkspaceTabs[window.uuid] ?? firstTab;
      }
      if (typeof firstTab === 'undefined' && !onInit) {
        browser.ZenWorkspaces._createNewTabForWorkspace(window);
      }
      for (let tab of browser.gBrowser.tabs) {
        if (tab.getAttribute('zen-workspace-id') !== window.uuid) {
          // FOR UNLOADING TABS:
          // gBrowser.discardBrowser(tab, true);
          browser.gBrowser.hideTab(tab, undefined, shouldAllowPinnedTabs);
        }
      }
      browser.ZenWorkspaces.tabContainer._invalidateCachedTabs();
      browser.document.documentElement.setAttribute('zen-workspace-id', window.uuid);
      await browser.ZenWorkspaces._updateWorkspacesChangeContextMenu();

      browser.document.getElementById('tabbrowser-tabs')._positionPinnedTabs();
    });

    await this._propagateWorkspaceData();
    this._inChangingWorkspace = false;
  }

  async _updateWorkspacesChangeContextMenu() {
    const workspaces = await this._workspaces();

    const menuPopup = document.getElementById('context-zen-change-workspace-tab-menu-popup');
    if (!menuPopup) {
      return;
    }
    menuPopup.innerHTML = '';

    const activeWorkspace = await this.getActiveWorkspace();

    for (let workspace of workspaces.workspaces) {
      const menuItem = document.createXULElement('menuitem');
      menuItem.setAttribute('label', workspace.name);
      menuItem.setAttribute('zen-workspace-id', workspace.uuid);

      if (workspace.uuid === activeWorkspace.uuid) {
        menuItem.setAttribute('disabled', 'true');
      }

      menuPopup.appendChild(menuItem);
    }
  }

  _createWorkspaceData(name, isDefault, icon) {
    let window = {
      uuid: gZenUIManager.generateUuidv4(),
      default: isDefault,
      icon: icon,
      name: name,
    };
    this._prepareNewWorkspace(window);
    return window;
  }

  async createAndSaveWorkspace(name = 'New Workspace', isDefault = false, icon = undefined) {
    if (!this.workspaceEnabled) {
      return;
    }
    let workspaceData = this._createWorkspaceData(name, isDefault, icon);
    await this.saveWorkspace(workspaceData);
    await this.changeWorkspace(workspaceData);
  }

  async onTabBrowserInserted(event) {
    let tab = event.originalTarget;
    if (tab.getAttribute('zen-workspace-id') || !this.workspaceEnabled) {
      return;
    }

    let activeWorkspace = await this.getActiveWorkspace();
    if (!activeWorkspace) {
      return;
    }
    tab.setAttribute('zen-workspace-id', activeWorkspace.uuid);
  }

  async onLocationChange(browser) {
    if (!this.workspaceEnabled || this._inChangingWorkspace) {
      return;
    }
    const parent = browser.ownerGlobal;
    let tab = gBrowser.getTabForBrowser(browser);
    let workspaceID = tab.getAttribute('zen-workspace-id');
    if (!workspaceID) {
      return;
    }
    let activeWorkspace = await parent.ZenWorkspaces.getActiveWorkspace();
    this._lastSelectedWorkspaceTabs[workspaceID] = tab;
    if (workspaceID === activeWorkspace.uuid) {
      return;
    }
    await parent.ZenWorkspaces.changeWorkspace({ uuid: workspaceID });
  }

  // Context menu management

  _contextMenuId = null;
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
    if (
      workspaces.workspaces.find((workspace) => workspace.uuid === this._contextMenuId && this.isWorkspaceActive(workspace))
    ) {
      openMenuItem.setAttribute('disabled', 'true');
    } else {
      openMenuItem.removeAttribute('disabled');
    }
    const openInContainerMenuItem = document.getElementById('context_zenWorkspacesOpenInContainerTab');
    if (this.shouldShowContainers) {
      openInContainerMenuItem.removeAttribute('hidden');
    } else {
      openInContainerMenuItem.setAttribute('hidden', 'true');
    }
  }

  async contextChangeContainerTab(event) {
    let workspaces = await this._workspaces();
    let workspace = workspaces.workspaces.find((workspace) => workspace.uuid === this._contextMenuId);
    let userContextId = parseInt(event.target.getAttribute('data-usercontextid'));
    workspace.containerTabId = userContextId;
    await this.saveWorkspace(workspace);
    await this._propagateWorkspaceData();
  }

  onContextMenuClose() {
    let target = document.querySelector(
      `#PanelUI-zen-workspaces [zen-workspace-id="${this._contextMenuId}"] .zen-workspace-actions`
    );
    if (target) {
      target.removeAttribute('active');
    }
    this._contextMenuId = null;
  }

  async setDefaultWorkspace() {
    await ZenWorkspacesStorage.setDefaultWorkspace(this._contextMenuId);
    this._workspaceCache = null;
    await this._propagateWorkspaceData();
  }

  async openWorkspace() {
    let workspaces = await this._workspaces();
    let workspace = workspaces.workspaces.find((workspace) => workspace.uuid === this._contextMenuId);
    await this.changeWorkspace(workspace);
  }

  async contextDelete(event) {
    this.__contextIsDelete = true;
    event.stopPropagation();
    await this.removeWorkspace(this._contextMenuId);
    this.__contextIsDelete = false;
  }

  async contextEdit(event) {
    event.stopPropagation();
    await this.openEditDialog(this._contextMenuId);
  }

  async changeWorkspaceShortcut(offset = 1) {
    // Cycle through workspaces
    let workspaces = await this._workspaces();
    let activeWorkspace = await this.getActiveWorkspace();
    let workspaceIndex = workspaces.workspaces.indexOf(activeWorkspace);
    // note: offset can be negative
    let nextWorkspace =
      workspaces.workspaces[(workspaceIndex + offset + workspaces.workspaces.length) % workspaces.workspaces.length];
    await this.changeWorkspace(nextWorkspace);
  }

  _initializeWorkspaceTabContextMenus() {
    const menu = document.createXULElement('menu');
    menu.setAttribute('id', 'context-zen-change-workspace-tab');
    menu.setAttribute('data-l10n-id', 'context-zen-change-workspace-tab');

    const menuPopup = document.createXULElement('menupopup');
    menuPopup.setAttribute('id', 'context-zen-change-workspace-tab-menu-popup');
    menuPopup.setAttribute('oncommand', "ZenWorkspaces.changeTabWorkspace(event.target.getAttribute('zen-workspace-id'))");

    menu.appendChild(menuPopup);

    document.getElementById('context_closeDuplicateTabs').after(menu);
  }

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
    this._workspaceCache = null;
    const workspaces = await this._workspaces();
    await this.changeWorkspace(workspaces.workspaces.find((workspace) => workspace.uuid === workspaceID));
  }

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
  }

  getContextIdIfNeeded(userContextId, fromExternal, allowInheritPrincipal) {
    if(!this.workspaceEnabled) {
      return [userContextId, false];
    }

    if(this.shouldForceContainerTabsToWorkspace && typeof userContextId !== 'undefined' && this._workspaceCache?.workspaces) {
      const workspace = this._workspaceCache.workspaces.find((workspace) => workspace.containerTabId === userContextId);
      if(workspace && workspace.uuid !== this.getActiveWorkspaceFromCache().uuid) {
        this.changeWorkspace(workspace);
        return [userContextId, true];
      }
    }

    const activeWorkspace = this.getActiveWorkspaceFromCache();
    const activeWorkspaceUserContextId = activeWorkspace?.containerTabId;

    if((fromExternal || allowInheritPrincipal === false) && !!activeWorkspaceUserContextId) {
      return [activeWorkspaceUserContextId, true];
    }

    if (typeof userContextId !== 'undefined' && userContextId !== activeWorkspaceUserContextId) {
      return [userContextId, false];
    }
    return [activeWorkspaceUserContextId, true];
  }

  async shortcutSwitchTo(index) {
    const workspaces = await this._workspaces();
    // The index may be out of bounds, if it doesnt exist, don't do anything
    if (index >= workspaces.workspaces.length || index < 0) {
      return;
    }
    const workspaceToSwitch = workspaces.workspaces[index];
    await this.changeWorkspace(workspaceToSwitch);
  }
})();
