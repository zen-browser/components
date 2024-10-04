var ZenWorkspaces = new (class extends ZenMultiWindowFeature {
  /**
   * Stores workspace IDs and their last selected tabs.
   */
  _lastSelectedWorkspaceTabs = {};

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
    ChromeUtils.defineLazyGetter(this, 'tabContainer', () => document.getElementById('tabbrowser-tabs'));
    await ZenWorkspacesStorage.init();
    await this.initializeWorkspaces();
    console.info('ZenWorkspaces: ZenWorkspaces initialized');
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
    if (!this._workspaceCache) {
      this._workspaceCache = { workspaces: await ZenWorkspacesStorage.getWorkspaces() };
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
    }
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
        this.changeWorkspace(activeWorkspace, true);
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

    this.initializeZenColorPicker('PanelUI-zen-workspaces-create-color-picker', (color) => {
      this._workspaceCreateColor = color;
      this.onWorkspaceCreationNameChange();
    });
  }

  async openEditDialog(workspaceUuid) {
    this._workspaceEditDialog.setAttribute('data-workspace-uuid', workspaceUuid);
    document.getElementById('PanelUI-zen-workspaces-edit-save').setAttribute('disabled', 'true');
    let workspaces = (await this._workspaces()).workspaces;
    let workspaceData = workspaces.find((workspace) => workspace.uuid === workspaceUuid);
    this._workspaceEditInput.textContent = workspaceData.name;
    this._workspaceEditInput.value = workspaceData.name;
    this._workspaceEditColor = workspaceData.themeColor;
    this._workspaceEditInput.setAttribute('data-initial-value', workspaceData.name);
    this._workspaceEditColorPicker.setAttribute('data-initial-value', workspaceData.themeColor);
    this._workspaceEditIconsContainer.setAttribute('data-initial-value', workspaceData.icon);
    this.initializeZenColorPicker('PanelUI-zen-workspaces-edit-color-picker', (color) => {
      this._workspaceEditColor = color;
      this.onWorkspaceEditChange();
    }, workspaceData.themeColor);

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

        if (activeWorkspace.themeColor) {
          this.generateZenColorsComplementary(activeWorkspace.themeColor);
        } else {
          // If no themeColor is set, reset to default colors
          this.resetZenColors();
        }
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

  async _expandWorkspacesStrip(browser = window) {
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

  get _workspaceEditColorPicker() {
    return document.getElementById('PanelUI-zen-workspaces-edit-color-picker');
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

    let themeColor = this._workspaceCreateColor || null;

    this._workspaceCreateInput.value = '';
    this._workspaceCreateColor = null;
    let icon = document.querySelector('#PanelUI-zen-workspaces-create-icons-container [selected]');
    icon?.removeAttribute('selected');
    await this.createAndSaveWorkspace(workspaceName, false, icon?.label, themeColor);
    document.getElementById('PanelUI-zen-workspaces').hidePopup(true);
    await this._updateWorkspacesButton();
    await this._propagateWorkspaceData();
  }

  async saveWorkspaceFromEdit() {
    let workspaceUuid = this._workspaceEditDialog.getAttribute('data-workspace-uuid');
    let workspaceName = this._workspaceEditInput.value;
    if (!workspaceName) {
      return;
    }
    let themeColor = this._workspaceEditColor || null;
    this._workspaceEditInput.value = '';
    let icon = document.querySelector('#PanelUI-zen-workspaces-edit-icons-container [selected]');
    icon?.removeAttribute('selected');
    let workspaces = (await this._workspaces()).workspaces;
    let workspaceData = workspaces.find((workspace) => workspace.uuid === workspaceUuid);
    workspaceData.name = workspaceName;
    workspaceData.icon = icon?.label;
    workspaceData.themeColor = themeColor;
    await this.saveWorkspace(workspaceData);
    await this._propagateWorkspaceData();
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
    let themeColor = this._workspaceEditColor;
    if (
        name === this._workspaceEditInput.getAttribute('data-initial-value') &&
        icon === this._workspaceEditIconsContainer.getAttribute('data-initial-value') &&
        themeColor === this._workspaceEditColorPicker.getAttribute('data-initial-value')
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
    if (!this.workspaceEnabled) {
      return;
    }

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
  }

  async _updateWorkspacesChangeContextMenu() {
    const workspaces = await this._workspaces();

    const menuPopup = document.getElementById('context-zen-change-workspace-tab-menu-popup');

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

  _createWorkspaceData(name, isDefault, icon, themeColor) {
    let workspace = {
      uuid: gZenUIManager.generateUuidv4(),
      default: isDefault,
      used: true,
      icon: icon,
      name: name,
      themeColor: themeColor
    };
    this._prepareNewWorkspace(workspace);
    return workspace;
  }


  async createAndSaveWorkspace(name = 'New Workspace', isDefault = false, icon = undefined, themeColor = null) {
    if (!this.workspaceEnabled) {
      return;
    }
    let workspaceData = this._createWorkspaceData(name, isDefault, icon, themeColor);
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
    let tab = gBrowser.getTabForBrowser(browser);
    let workspaceID = tab.getAttribute('zen-workspace-id');
    if (!workspaceID) {
      let activeWorkspace = await this.getActiveWorkspace();
      if (!activeWorkspace || tab.hasAttribute('hidden')) {
        return;
      }
      tab.setAttribute('zen-workspace-id', activeWorkspace.uuid);
      workspaceID = activeWorkspace.uuid;
    }
    this._lastSelectedWorkspaceTabs[workspaceID] = tab;
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

  getContextIdIfNeeded(userContextId) {
    const activeWorkspace = this.getActiveWorkspaceFromCache();
    const activeWorkspaceUserContextId = activeWorkspace?.containerTabId;
    if ((typeof userContextId !== 'undefined' && userContextId !== activeWorkspaceUserContextId) || !this.workspaceEnabled) {
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

  // Utility functions for color conversion and manipulation
  hexToHsl = (hex) => {
    hex = hex.replace('#', '');
    if (hex.length === 3) {
      hex = hex.split('').map((h) => h + h).join('');
    }
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;

    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
      h = s = 0; // achromatic
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
        case g: h = ((b - r) / d + 2); break;
        case b: h = ((r - g) / d + 4); break;
      }
      h *= 60;
    }
    return [h, s * 100, l * 100]; // [hue, saturation, lightness]
  };

  hslToHex = (h, s, l) => {
    s /= 100;
    l /= 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const hh = h / 60;
    const x = c * (1 - Math.abs(hh % 2 - 1));
    let r = 0, g = 0, b = 0;

    if (0 <= hh && hh < 1) { r = c; g = x; b = 0; }
    else if (1 <= hh && hh < 2) { r = x; g = c; b = 0; }
    else if (2 <= hh && hh < 3) { r = 0; g = c; b = x; }
    else if (3 <= hh && hh < 4) { r = 0; g = x; b = c; }
    else if (4 <= hh && hh < 5) { r = x; g = 0; b = c; }
    else if (5 <= hh && hh < 6) { r = c; g = 0; b = x; }

    const m = l - c / 2;
    r = Math.round((r + m) * 255);
    g = Math.round((g + m) * 255);
    b = Math.round((b + m) * 255);

    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
  };

  shiftHue = (h, shift) => (h + shift + 360) % 360; // Ensuring positive hue values

  generateZenColorsComplementary(baseHex) {
    const isDarkTheme = window.matchMedia('(prefers-color-scheme: dark)').matches;

    // Get HSL from base hex color
    let [h, s, l] = this.hexToHsl(baseHex);

    // Apply desaturation and adjust lightness for pastel effect
    s = Math.min(s, 40); // Cap saturation at 40%

    if (!isDarkTheme) {
      l = Math.max(l, 70); // Ensure lightness is at least 70% in light mode
    } else {
      l = 30; // Set base lightness to 30% in dark mode
    }
    baseHex = this.hslToHex(h, s, l);

    let colors = {};

    if (s < 15) {
      // Neutral color selected (e.g., grey shade)
      // Generate a primary color that pops
      const popHues = [0, 30, 60, 120, 180, 240, 300]; // Array of hues for vibrant colors
      const popHue = popHues[Math.floor(Math.random() * popHues.length)]; // Randomly select a hue
      const popSaturation = 80; // High saturation for popping color
      const popLightness = isDarkTheme ? 40 : 50; // Adjusted lightness based on theme

      const l_tertiary = isDarkTheme ? 15 : l; // Much darker in dark mode

      colors = {
        "--zen-colors-primary": this.hslToHex(popHue, popSaturation, popLightness), // Vibrant color
        "--zen-colors-secondary": this.hslToHex(h, s, Math.min(l_tertiary + 10, 100)), // Slightly lighter neutral
        "--zen-colors-tertiary": this.hslToHex(h, s, l_tertiary), // Darker neutral color (background)
        "--zen-colors-border": this.hslToHex(h, s, Math.max(l_tertiary - 5, 0)), // Even darker neutral
        "--zen-dialog-background": this.hslToHex(h, s, Math.min(l_tertiary + 5, 100)), // Slightly lighter neutral
      };
    } else {
      // Non-neutral color selected
      const primaryH = this.shiftHue(h, isDarkTheme ? 0 : -10); // No hue shift in dark mode
      const secondaryH = this.shiftHue(h, isDarkTheme ? 0 : 10);

      if (!isDarkTheme) {
        // Light mode
        colors = {
          "--zen-colors-primary": this.hslToHex(primaryH, s, Math.max(l - 10, 0)), // Slightly darker shade with shifted hue
          "--zen-colors-secondary": this.hslToHex(secondaryH, s, Math.min(l + 10, 100)), // Slightly lighter shade with shifted hue
          "--zen-colors-tertiary": baseHex, // Base color (background)
          "--zen-colors-border": this.hslToHex(h, s, Math.max(l - 20, 0)), // Darker version for border
          "--zen-dialog-background": this.hslToHex(h, s, Math.min(l + 5, 100)), // Slightly lighter
        };
      } else {
        // Dark mode
        const l_tertiary = 15; // Much darker for tertiary color
        const l_primary = 40;  // Lightness adjusted for white text

        colors = {
          "--zen-colors-primary": this.hslToHex(h, s, l_primary), // Similar to baseHex but dark enough for white text
          "--zen-colors-secondary": this.hslToHex(h, s, Math.max(l_primary - 10, 0)), // Slightly darker than primary
          "--zen-colors-tertiary": this.hslToHex(h, s, l_tertiary), // Much darker base color (background)
          "--zen-colors-border": this.hslToHex(h, s, Math.max(l_tertiary - 5, 0)), // Even darker for border
          "--zen-dialog-background": this.hslToHex(h, s, Math.min(l_tertiary + 5, 100)), // Slightly lighter
        };
      }
    }

    // Apply the colors to the document's root style
    Object.keys(colors).forEach(key => {
      document.documentElement.style.setProperty(key, colors[key]);
    });

    return colors;
  }

  resetZenColors() {
    // Remove custom properties
    const properties = [
      "--zen-colors-primary",
      "--zen-colors-secondary",
      "--zen-colors-tertiary",
      "--zen-colors-border",
      "--zen-dialog-background"
    ];
    properties.forEach(prop => {
      document.documentElement.style.removeProperty(prop);
    });
  }

  zenColorOptions = [
    null,
    "#FFD1DC", // Pastel Pink
    "#FFB347", // Pastel Orange
    "#FFFF99", // Pastel Yellow
    "#77DD77", // Pastel Green
    "#AEC6CF", // Pastel Blue
    "#D8BFD8", // Pastel Lilac
    "#98FF98", // Pastel Mint
    "#FFDAB9", // Pastel Peach
    "#E6E6FA", // Pastel Lavender
    "#F5F5DC", // Pastel Beige
    "#F0E68C", // Khaki
    "#E0FFFF", // Light Cyan
    "#FFB6C1", // Light Pink
    "#ADD8E6", // Light Blue
    "#CD5C5C", // Darker Red
    "#F08080", // Light Coral
    "#AFEEEE", // Pale Turquoise
    "#20B2AA", // Light Sea Green
    "#8470FF", // Light Slate Blue
    "#FFA07A", // Light Salmon
    "#000000" // Black
  ];

// Function to initialize the color picker
  initializeZenColorPicker(containerId, onColorSelected, initialColor = null) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    this.zenColorOptions.forEach(color => {
      const colorOption = document.createElement('div');
      colorOption.className = 'zen-color-option';
      colorOption.style.backgroundColor = color;
      colorOption.setAttribute('data-color', color);

      if (color === initialColor) {
        colorOption.setAttribute('selected', 'true');
      }

      colorOption.addEventListener('click', () => {
        container.querySelectorAll('.zen-color-option').forEach(option => {
          option.removeAttribute('selected');
        });

        colorOption.setAttribute('selected', 'true');
        onColorSelected(color);
      });

      container.appendChild(colorOption);
    });
  }


})();

