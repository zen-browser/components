class ZenViewSplitter extends ZenDOMOperatedFeature {
  currentView = -1;
  canChangeTabOnHover = false;

  _data = [];
  _tabBrowserPanel = null;
  __modifierElement = null;
  __hasSetMenuListener = false;

  init() {
    XPCOMUtils.defineLazyPreferenceGetter(this, 'canChangeTabOnHover', 'zen.splitView.change-on-hover', false);

    window.addEventListener('TabClose', this.handleTabClose.bind(this));
    this.initializeContextMenu();
    this.insertPageActionButton();
    this.insertIntoContextMenu();
  }

  insertIntoContextMenu() {
    const sibling = document.getElementById('context-stripOnShareLink');
    const menuitem = document.createXULElement('menuitem');
    menuitem.setAttribute('id', 'context-zenSplitLink');
    menuitem.setAttribute('hidden', 'true');
    menuitem.setAttribute('oncommand', 'gZenViewSplitter.splitLinkInNewTab();');
    menuitem.setAttribute('data-l10n-id', 'zen-split-link');
    sibling.insertAdjacentElement('afterend', document.createXULElement('menuseparator'));
    sibling.insertAdjacentElement('afterend', menuitem);
    sibling.insertAdjacentElement('afterend', document.createXULElement('menuseparator'));
  }

  /**
   * @param {Event} event - The event that triggered the tab close.
   * @description Handles the tab close event.7
   */
  handleTabClose(event) {
    const tab = event.target;
    const groupIndex = this._data.findIndex((group) => group.tabs.includes(tab));
    if (groupIndex < 0) {
      return;
    }
    this.removeTabFromGroup(tab, groupIndex, event.forUnsplit);
  }

  /**
   * Removes a tab from a group.
   *
   * @param {Tab} tab - The tab to remove.
   * @param {number} groupIndex - The index of the group.
   * @param {boolean} forUnsplit - Indicates if the tab is being removed for unsplitting.
   */
  removeTabFromGroup(tab, groupIndex, forUnsplit) {
    const group = this._data[groupIndex];
    const tabIndex = group.tabs.indexOf(tab);
    group.tabs.splice(tabIndex, 1);

    this.resetTabState(tab, forUnsplit);

    if (group.tabs.length < 2) {
      this.removeGroup(groupIndex);
    } else {
      this.updateSplitView(group.tabs[group.tabs.length - 1]);
    }
  }

  /**
   * Resets the state of a tab.
   *
   * @param {Tab} tab - The tab to reset.
   * @param {boolean} forUnsplit - Indicates if the tab is being reset for unsplitting.
   */
  resetTabState(tab, forUnsplit) {
    tab.splitView = false;
    tab.linkedBrowser.zenModeActive = false;
    const container = tab.linkedBrowser.closest('.browserSidebarContainer');
    container.removeAttribute('zen-split');
    container.removeAttribute('style');

    if (!forUnsplit) {
      tab.linkedBrowser.docShellIsActive = false;
    } else {
      container.style.gridArea = '1 / 1';
    }
  }

  /**
   * Removes a group.
   *
   * @param {number} groupIndex - The index of the group to remove.
   */
  removeGroup(groupIndex) {
    if (this.currentView === groupIndex) {
      this.resetSplitView(false);
    }
    for (const tab of this._data[groupIndex].tabs) {
      this.resetTabState(tab, true);
    }
    this._data.splice(groupIndex, 1);
  }

  /**
   * Resets the split view.
   */
  resetSplitView(resetTabState = true) {
    if (resetTabState) {
      for (const tab of this._data[this.currentView].tabs) {
        this.resetTabState(tab, true);
      }
    }
    this.removeSplitters();

    this.currentView = -1;
    this.tabBrowserPanel.removeAttribute('zen-split-view');
    this.tabBrowserPanel.style.gridTemplateAreas = '';
    this.tabBrowserPanel.style.gridTemplateColumns = '';
    this.tabBrowserPanel.style.gridTemplateRows = '';
  }

  /**
   * context menu item display update
   */
  insetUpdateContextMenuItems() {
    const contentAreaContextMenu = document.getElementById('tabContextMenu');
    contentAreaContextMenu.addEventListener('popupshowing', () => {
      const tabCountInfo = JSON.stringify({
        tabCount: window.gBrowser.selectedTabs.length,
      });
      document.getElementById('context_zenSplitTabs').setAttribute('data-l10n-args', tabCountInfo);
      document.getElementById('context_zenSplitTabs').disabled = !this.contextCanSplitTabs();
    });
  }

  /**
   * Inserts the split view tab context menu item.
   */
  insertSplitViewTabContextMenu() {
    const element = window.MozXULElement.parseXULToFragment(`
      <menuseparator/>
      <menuitem id="context_zenSplitTabs"
                data-lazy-l10n-id="tab-zen-split-tabs"
                oncommand="gZenViewSplitter.contextSplitTabs();"/>
      <menuseparator/>
    `);
    document.getElementById('context_closeDuplicateTabs').after(element);
  }

  /**
   * Initializes the context menu.
   */
  initializeContextMenu() {
    this.insertSplitViewTabContextMenu();
    this.insetUpdateContextMenuItems();
  }

  /**
   * Insert Page Action button
   */
  insertPageActionButton() {
    const element = window.MozXULElement.parseXULToFragment(`
      <hbox id="zen-split-views-box"
          hidden="true"
          role="button"
          class="urlbar-page-action"
          onclick="gZenViewSplitter.openSplitViewPanel(event);">
        <image id="zen-split-views-button"
              class="urlbar-icon"/>
      </hbox>
    `);
    document.getElementById('star-button-box').after(element);
  }

  /**
   * Gets the tab browser panel.
   *
   * @returns {Element} The tab browser panel.
   */
  get tabBrowserPanel() {
    if (!this._tabBrowserPanel) {
      this._tabBrowserPanel = document.getElementById('tabbrowser-tabpanels');
    }
    return this._tabBrowserPanel;
  }

  get minResizeWidth() {
    return Services.prefs.getIntPref('zen.splitView.min-resize-width');
  }

  /**
   * Splits a link in a new tab.
   */
  splitLinkInNewTab() {
    const url = window.gContextMenu.linkURL || window.gContextMenu.target.ownerDocument.location.href;
    const currentTab = window.gBrowser.selectedTab;
    const newTab = this.openAndSwitchToTab(url);
    this.splitTabs([currentTab, newTab]);
  }

  /**
   * Splits the selected tabs.
   */
  contextSplitTabs() {
    const tabs = window.gBrowser.selectedTabs;
    this.splitTabs(tabs);
  }

  /**
   * Checks if the selected tabs can be split.
   *
   * @returns {boolean} True if the tabs can be split, false otherwise.
   */
  contextCanSplitTabs() {
    if (window.gBrowser.selectedTabs.length < 2) {
      return false;
    }
    for (const tab of window.gBrowser.selectedTabs) {
      if (tab.splitView) {
        return false;
      }
    }
    return true;
  }

  /**
   * Handles the location change event.
   *
   * @param {Browser} browser - The browser instance.
   */
  async onLocationChange(browser) {
    const tab = window.gBrowser.getTabForBrowser(browser);
    this.updateSplitViewButton(!tab?.splitView);
    if (tab) {
      this.updateSplitView(tab);
      tab.linkedBrowser.docShellIsActive = true;
    }
  }

  /**
   * Splits the given tabs.
   *
   * @param {Tab[]} tabs - The tabs to split.
   * @param {string} gridType - The type of grid layout.
   */
  splitTabs(tabs, gridType = 'grid') {
    if (tabs.length < 2) {
      return;
    }

    const existingSplitTab = tabs.find((tab) => tab.splitView);
    if (existingSplitTab) {
      const groupIndex = this._data.findIndex((group) => group.tabs.includes(existingSplitTab));
      if (groupIndex >= 0) {
        // Add any tabs that are not already in the group
        for (const tab of tabs) {
          if (!this._data[groupIndex].tabs.includes(tab)) {
            this._data[groupIndex].tabs.push(tab);
          }
        }
        this._data[groupIndex].gridType = gridType;
        this.updateSplitView(existingSplitTab);
        return;
      }
    }

    this._data.push({
      tabs,
      gridType: gridType,
    });
    window.gBrowser.selectedTab = tabs[0];
    this.updateSplitView(tabs[0]);
  }

  /**
   * Updates the split view.
   *
   * @param {Tab} tab - The tab to update the split view for.
   */
  updateSplitView(tab) {
    const splitData = this._data.find((group) => group.tabs.includes(tab));
    if (!splitData || (this.currentView >= 0 && !this._data[this.currentView].tabs.includes(tab))) {
      this.updateSplitViewButton(true);
      if (this.currentView >= 0) {
        this.deactivateSplitView();
      }
      if (!splitData) {
        return;
      }
    }

    this.activateSplitView(splitData, tab);
  }

  /**
   * Deactivates the split view.
   */
  deactivateSplitView() {
    for (const tab of this._data[this.currentView].tabs) {
      const container = tab.linkedBrowser.closest('.browserSidebarContainer');
      this.resetContainerStyle(container);
      container.removeEventListener('click', this.handleTabEvent);
      container.removeEventListener('mouseover', this.handleTabEvent);
    }
    this.tabBrowserPanel.removeAttribute('zen-split-view');
    this.tabBrowserPanel.style.gridTemplateAreas = '';
    this.tabBrowserPanel.style.gridTemplateColumns = '';
    this.tabBrowserPanel.style.gridTemplateRows = '';
    this.setTabsDocShellState(this._data[this.currentView].tabs, false);
    this.currentView = -1;
  }

  /**
   * Activates the split view.
   *
   * @param {object} splitData - The split data.
   * @param {Tab} activeTab - The active tab.
   */
  activateSplitView(splitData, activeTab) {
    this.tabBrowserPanel.setAttribute('zen-split-view', 'true');
    this.currentView = this._data.indexOf(splitData);

    const gridType = splitData.gridType || 'grid';
    this.applyGridLayout(splitData.tabs, gridType, activeTab);

    this.setTabsDocShellState(splitData.tabs, true);
    this.updateSplitViewButton(false);
    this.updateGridSizes(splitData);
    this.applySplitters(splitData.widths.length, splitData.heights.length);
    this.applyGridSizes();
  }

  /**
   * Applies the grid layout to the tabs.
   *
   * @param {Tab[]} tabs - The tabs to apply the grid layout to.
   * @param {string} gridType - The type of grid layout.
   * @param {Tab} activeTab - The active tab.
   */
  applyGridLayout(tabs, gridType, activeTab) {
    const gridAreas = this.calculateGridAreas(tabs, gridType);
    this.tabBrowserPanel.style.gridTemplateAreas = gridAreas;

    tabs.forEach((tab, index) => {
      tab.splitView = true;
      const container = tab.linkedBrowser.closest('.browserSidebarContainer');
      this.styleContainer(container, tab === activeTab, index, gridType);
    });
  }

  /**
   * Adds splitters to tabBrowserPanel
   *
   * @param nrOfColumns number of columns in the grid
   * @param nrOfRows number of rows in the grid
   */
  applySplitters(nrOfColumns, nrOfRows) {
    this.removeSplitters();
    const vSplittersNeeded = (nrOfColumns - 1) * nrOfRows;
    const hSplittersNeeded = nrOfRows - 1;

    const insertSplitter = (i, orient, gridIdx) => {
      const splitter = document.createElement('div');
      splitter.className = 'zen-split-view-splitter';
      splitter.setAttribute('orient', orient);
      splitter.setAttribute('gridIdx', gridIdx);
      splitter.style.gridArea = `${orient === 'vertical' ? 'v' : 'h'}Splitter${i}`;
      splitter.addEventListener('mousedown', this.handleSplitterMouseDown);
      this.tabBrowserPanel.insertAdjacentElement('afterbegin', splitter);
    };
    for (let i = 1; i <= vSplittersNeeded; i++) {
      insertSplitter(i, 'vertical', Math.floor((i - 1) / nrOfRows) + 1);
    }
    for (let i = 1; i <= hSplittersNeeded; i++) {
      insertSplitter(i, 'horizontal', i);
    }
  }

  /**
   * Initialize splitData with default widths and heights if dimensions of grid don't match
   *
   * @param {object} splitData - The split data.
   */
  updateGridSizes(splitData) {
    const tabs = splitData.tabs;
    const gridType = splitData.gridType;

    let nrOfWidths = 1;
    let nrOfHeights = 1;
    if (gridType === 'vsep') {
      nrOfWidths = tabs.length;
    } else if (gridType === 'hsep') {
      nrOfHeights = tabs.length;
    } else if (gridType === 'grid') {
      nrOfWidths = tabs.length > 2 ? Math.ceil(tabs.length / 2) : 2;
      nrOfHeights = tabs.length > 2 ? 2 : 1;
    }
    if (splitData.widths?.length !== nrOfWidths || splitData.heights?.length !== nrOfHeights) {
      splitData.widths = Array(nrOfWidths).fill(100 / nrOfWidths);
      splitData.heights = Array(nrOfHeights).fill(100 / nrOfHeights);
    }
  }

  removeSplitters() {
    [...gZenViewSplitter.tabBrowserPanel.children]
      .filter((e) => e.classList.contains('zen-split-view-splitter'))
      .forEach((s) => s.remove());
  }

  /**
   * Calculates the grid areas for the tabs.
   *
   * @param {Tab[]} tabs - The tabs.
   * @param {string} gridType - The type of grid layout.
   * @returns {string} The calculated grid areas.
   */
  calculateGridAreas(tabs, gridType) {
    if (gridType === 'grid') {
      return this.calculateGridAreasForGrid(tabs);
    }
    if (gridType === 'vsep') {
      return `'${tabs
        .slice(0, -1)
        .map((_, j) => `tab${j + 1} vSplitter${j + 1}`)
        .join(' ')} tab${tabs.length}'`;
    }
    if (gridType === 'hsep') {
      return (
        tabs
          .slice(0, -1)
          .map((_, j) => `'tab${j + 1}' 'hSplitter${j + 1}'`)
          .join(' ') + `'tab${tabs.length}`
      );
    }
    return '';
  }

  /**
   * Calculates the grid areas for the tabs in a grid layout.
   *
   * @param {Tab[]} tabs - The tabs.
   * @returns {string} The calculated grid areas.
   */
  calculateGridAreasForGrid(tabs) {
    if (tabs.length === 2) {
      return "'tab1 vSplitter1 tab2'";
    }

    const rows = ['', ''];
    for (let i = 0; i < tabs.length - 2; i++) {
      if (i % 2 === 0) {
        rows[0] += ` tab${i + 1} vSplitter${i + 1}`;
      } else {
        rows[1] += ` tab${i + 1} vSplitter${i + 1}`;
      }
    }
    for (let i = tabs.length - 2; i < tabs.length; i++) {
      if (i % 2 === 0) {
        rows[0] += ` tab${i + 1}`;
      } else {
        rows[1] += ` tab${i + 1}`;
      }
    }

    let middleColumn = 'hSplitter1 '.repeat(tabs.length - 1);
    if (tabs.length % 2 !== 0) {
      rows[1] += ` vSplitter${tabs.length - 1} tab${tabs.length}`;
      middleColumn += ` tab${tabs.length}`;
    }
    return `'${rows[0].trim()}' '${middleColumn}' '${rows[1].trim()}'`;
  }

  /**
   * Styles the container for a tab.
   *
   * @param {Element} container - The container element.
   * @param {boolean} isActive - Indicates if the tab is active.
   * @param {number} index - The index of the tab.
   * @param {string} gridType - The type of grid layout.
   */
  styleContainer(container, isActive, index, gridType) {
    container.removeAttribute('zen-split-active');
    if (isActive) {
      container.setAttribute('zen-split-active', 'true');
    }
    container.setAttribute('zen-split-anim', 'true');
    container.addEventListener('click', this.handleTabEvent);
    container.addEventListener('mouseover', this.handleTabEvent);

    container.style.gridArea = `tab${index + 1}`;
  }

  /**
   * Handles tab events.
   *
   * @param {Event} event - The event.
   */
  handleTabEvent = (event) => {
    if (event.type === 'mouseover' && !this.canChangeTabOnHover) {
      return;
    }
    const container = event.currentTarget;
    const tab = window.gBrowser.tabs.find((t) => t.linkedBrowser.closest('.browserSidebarContainer') === container);
    if (tab) {
      window.gBrowser.selectedTab = tab;
    }
  };

  handleSplitterMouseDown = (event) => {
    const splitData = this._data[this.currentView];

    const isVertical = event.target.getAttribute('orient') === 'vertical';
    const dimension = isVertical ? 'widths' : 'heights';
    const clientAxis = isVertical ? 'screenX' : 'screenY';

    const gridIdx = event.target.getAttribute('gridIdx');
    let prevPosition = event[clientAxis];
    const dragFunc = (dEvent) => {
      requestAnimationFrame(() => {
        const movementX = dEvent[clientAxis] - prevPosition;
        let percentageChange =
          (movementX / this.tabBrowserPanel.getBoundingClientRect()[isVertical ? 'width' : 'height']) * 100;

        const currentSize = splitData[dimension][gridIdx - 1];
        const neighborSize = splitData[dimension][gridIdx];
        if (currentSize < this.minResizeWidth && neighborSize < this.minResizeWidth) {
          return;
        }
        let max = false;
        if (currentSize + percentageChange < this.minResizeWidth) {
          percentageChange = this.minResizeWidth - currentSize;
          max = true;
        } else if (neighborSize - percentageChange < this.minResizeWidth) {
          percentageChange = neighborSize - this.minResizeWidth;
          max = true;
        }
        splitData[dimension][gridIdx - 1] += percentageChange;
        splitData[dimension][gridIdx] -= percentageChange;
        this.applyGridSizes();
        if (!max) prevPosition = dEvent[clientAxis];
      });
    };
    const stopListeners = () => {
      removeEventListener('mousemove', dragFunc);
      removeEventListener('mouseup', stopListeners);
      setCursor('auto');
    };
    addEventListener('mousemove', dragFunc);
    addEventListener('mouseup', stopListeners);
    setCursor(isVertical ? 'ew-resize' : 'n-resize');
  };

  /**
   * Applies the grid column and row sizes
   */
  applyGridSizes() {
    const splitData = this._data[this.currentView];
    const columnGap = 'var(--zen-split-column-gap)';
    const rowGap = 'var(--zen-split-row-gap)';

    this.tabBrowserPanel.style.gridTemplateColumns = splitData.widths
      .slice(0, -1)
      .map((w) => `calc(${w}% - ${columnGap} * ${splitData.widths.length - 1}/${splitData.widths.length}) ${columnGap}`)
      .join(' ');

    this.tabBrowserPanel.style.gridTemplateRows = splitData.heights
      .slice(0, -1)
      .map((h) => `calc(${h}% - ${rowGap} * ${splitData.heights.length - 1}/${splitData.heights.length}) ${rowGap}`)
      .join(' ');
  }

  /**
   * Sets the docshell state for the tabs.
   *
   * @param {Tab[]} tabs - The tabs.
   * @param {boolean} active - Indicates if the tabs are active.
   */
  setTabsDocShellState(tabs, active) {
    for (const tab of tabs) {
      // zenModeActive allow us to avoid setting docShellisActive to false later on,
      // see browser-custom-elements.js's patch
      tab.linkedBrowser.zenModeActive = active;
      try {
        tab.linkedBrowser.docShellIsActive = active;
      } catch (e) {
        console.error(e);
      }
      const browser = tab.linkedBrowser.closest('.browserSidebarContainer');
      if (active) {
        browser.setAttribute('zen-split', 'true');
      } else {
        browser.removeAttribute('zen-split');
        browser.removeAttribute('style');
      }
    }
  }

  /**
   * Resets the container style.
   *
   * @param {Element} container - The container element.
   */
  resetContainerStyle(container) {
    container.removeAttribute('zen-split-active');
    container.classList.remove('deck-selected');
    container.style.gridArea = '';
  }

  /**
   * Updates the split view button visibility.
   *
   * @param {boolean} hidden - Indicates if the button should be hidden.
   */
  updateSplitViewButton(hidden) {
    const button = document.getElementById('zen-split-views-box');
    if (hidden) {
      button?.setAttribute('hidden', 'true');
    } else {
      button?.removeAttribute('hidden');
    }
  }

  /**
   * Gets the modifier element.
   *
   * @returns {Element} The modifier element.
   */
  get modifierElement() {
    if (!this.__modifierElement) {
      const wrapper = document.getElementById('template-zen-split-view-modifier');
      const panel = wrapper.content.firstElementChild;
      wrapper.replaceWith(wrapper.content);
      this.__modifierElement = panel;
    }
    return this.__modifierElement;
  }

  /**
   * Opens the split view panel.
   *
   * @param {Event} event - The event that triggered the panel opening.
   */
  async openSplitViewPanel(event) {
    const panel = this.modifierElement;
    const target = event.target.parentNode;
    this.updatePanelUI(panel);

    if (!this.__hasSetMenuListener) {
      this.setupPanelListeners(panel);
      this.__hasSetMenuListener = true;
    }

    window.PanelMultiView.openPopup(panel, target, {
      position: 'bottomright topright',
      triggerEvent: event,
    }).catch(console.error);
  }

  /**
   * Updates the UI of the panel.
   *
   * @param {Element} panel - The panel element.
   */
  updatePanelUI(panel) {
    for (const gridType of ['hsep', 'vsep', 'grid', 'unsplit']) {
      const selector = panel.querySelector(`.zen-split-view-modifier-preview.${gridType}`);
      selector.classList.remove('active');
      if (this.currentView >= 0 && this._data[this.currentView].gridType === gridType) {
        selector.classList.add('active');
      }
    }
  }

  /**
   * @description sets up the listeners for the panel.
   * @param {Element} panel - The panel element
   */
  setupPanelListeners(panel) {
    for (const gridType of ['hsep', 'vsep', 'grid', 'unsplit']) {
      const selector = panel.querySelector(`.zen-split-view-modifier-preview.${gridType}`);
      selector.addEventListener('click', () => this.handlePanelSelection(gridType, panel));
    }
  }

  /**
   * @description handles the panel selection.
   * @param {string} gridType - The grid type
   * @param {Element} panel - The panel element
   */
  handlePanelSelection(gridType, panel) {
    if (gridType === 'unsplit') {
      this.unsplitCurrentView();
    } else {
      this._data[this.currentView].gridType = gridType;
      this.updateSplitView(window.gBrowser.selectedTab);
    }
    panel.hidePopup();
  }

  /**
   * @description unsplit the current view.]
   */
  unsplitCurrentView() {
    if (this.currentView < 0) return;
    const currentTab = window.gBrowser.selectedTab;
    const tabs = this._data[this.currentView].tabs;
    // note: This MUST be an index loop, as we are removing tabs from the array
    for (let i = tabs.length - 1; i >= 0; i--) {
      this.handleTabClose({ target: tabs[i], forUnsplit: true });
    }
    window.gBrowser.selectedTab = currentTab;
    this.updateSplitViewButton(true);
  }

  /**
   * @description opens a new tab and switches to it.
   * @param {string} url - The url to open
   * @param {object} options - The options for the tab
   * @returns {tab} The tab that was opened
   */
  openAndSwitchToTab(url, options) {
    const parentWindow = window.ownerGlobal.parent;
    const targetWindow = parentWindow || window;
    const tab = targetWindow.gBrowser.addTrustedTab(url, options);
    targetWindow.gBrowser.selectedTab = tab;
    return tab;
  }

  toggleShortcut(gridType) {
    if (gridType === 'unsplit') {
      this.unsplitCurrentView();
      return;
    }
    const tabs = gBrowser.visibleTabs;
    if (tabs.length < 2) {
      return;
    }
    let nextTabIndex = tabs.indexOf(gBrowser.selectedTab) + 1;
    if (nextTabIndex >= tabs.length) {
      // Find the first non-hidden tab
      nextTabIndex = tabs.findIndex((tab) => !tab.hidden);
    } else if (nextTabIndex < 0) {
      // reverse find the first non-hidden tab
      nextTabIndex = tabs
        .slice()
        .reverse()
        .findIndex((tab) => !tab.hidden);
    }
    const selected_tabs = gBrowser.selectedTab.multiselected
      ? gBrowser.selectedTabs
      : [gBrowser.selectedTab, tabs[nextTabIndex]];
    this.splitTabs(selected_tabs, gridType);
  }
}

window.gZenViewSplitter = new ZenViewSplitter();
