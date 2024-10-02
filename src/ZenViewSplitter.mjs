
class SplitNode {
  constructor(direction, widthInParent = 100, heightInParent = 100) {
    this.direction = direction; // row or column
    this.children = [];
    this.splitters = [];
    this.widthInParent = widthInParent;
    this.heightInParent = heightInParent;
  }
}
class SplitLeafNode {
  constructor(tabContainerId,widthInParent = 100, heightInParent = 100) {
    this.id = tabContainerId;
    this.widthInParent = widthInParent;
    this.heightInParent = heightInParent;
  }
}
var gZenViewSplitter = new class {
  constructor() {
    this._data = [];
    this.currentView = -1;
    this._tabBrowserPanel = null;
    this.__modifierElement = null;
    this.__hasSetMenuListener = false;
    this.canChangeTabOnHover = null;
    this.splitterBox = null;
    this._splitNodeToSplitters = new Map();

    XPCOMUtils.defineLazyPreferenceGetter(
      this,
      "canChangeTabOnHover",
      "zen.splitView.change-on-hover",
      false
    );

    ChromeUtils.defineLazyGetter(
      this,
      'splitterBox',
      () => document.getElementById('zen-splitview-splitterbox')
    );

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

  enableTabSwitchView() {
    if (!this._thumnailCanvas) {
      this._thumnailCanvas = document.createElement("canvas");
      this._thumnailCanvas.width = 280 * devicePixelRatio;
      this._thumnailCanvas.height = 140 * devicePixelRatio;
    }

    this.tabBrowserPanel.addEventListener('dragstart', this.onBrowserDragStart);
    this.tabBrowserPanel.addEventListener('dragover', this.onBrowserDragOver);
    this.tabBrowserPanel.addEventListener('drop', this.onBrowserDrop);
  }

  disableTabSwitchView = () => {
    this.switchViewEnabled = false;

    this.tabBrowserPanel.removeEventListener('dragstart', this.onBrowserDragStart);
    this.tabBrowserPanel.removeEventListener('dragover', this.onBrowserDragOver);
    this.tabBrowserPanel.removeEventListener('drop', this.onBrowserDrop);
    const browsers = this._data[this.currentView].tabs.map(t => t.linkedBrowser);
    browsers.forEach(b => {
      b.style.pointerEvents = '';
      b.style.opacity = '';
    });
  }

  onBrowserDragStart = (event) => {
    if (!this.splitViewActive) return;
    let browser = event.target.querySelector('browser');
    if (!browser) {
      return;
    }
    const browserContainer = browser.closest('.browserSidebarContainer');
    event.dataTransfer.setData('text/plain', browserContainer.id);

    let dt = event.dataTransfer;
    let scale = window.devicePixelRatio;
    let canvas = this._dndCanvas;
    if (!canvas) {
      this._dndCanvas = canvas = document.createElementNS(
        "http://www.w3.org/1999/xhtml",
        "canvas"
      );
      canvas.style.width = "100%";
      canvas.style.height = "100%";
    }

    canvas.width = 160 * scale;
    canvas.height = 90 * scale;
    let toDrag = canvas;
    let dragImageOffset = -16;
    if (gMultiProcessBrowser) {
      var context = canvas.getContext("2d");
      context.fillStyle = "white";
      context.fillRect(0, 0, canvas.width, canvas.height);

      let captureListener;
      let platform = AppConstants.platform;
      // On Windows and Mac we can update the drag image during a drag
      // using updateDragImage. On Linux, we can use a panel.
      if (platform === "win" || platform === "macosx") {
        captureListener = function () {
          dt.updateDragImage(canvas, dragImageOffset, dragImageOffset);
        };
      } else {
        // Create a panel to use it in setDragImage
        // which will tell xul to render a panel that follows
        // the pointer while a dnd session is on.
        if (!this._dndPanel) {
          this._dndCanvas = canvas;
          this._dndPanel = document.createXULElement("panel");
          this._dndPanel.className = "dragfeedback-tab";
          this._dndPanel.setAttribute("type", "drag");
          let wrapper = document.createElementNS(
            "http://www.w3.org/1999/xhtml",
            "div"
          );
          wrapper.style.width = "160px";
          wrapper.style.height = "90px";
          wrapper.appendChild(canvas);
          this._dndPanel.appendChild(wrapper);
          document.documentElement.appendChild(this._dndPanel);
        }
        toDrag = this._dndPanel;
      }
      // PageThumb is async with e10s but that's fine
      // since we can update the image during the dnd.
      PageThumbs.captureToCanvas(browser, canvas)
        .then(captureListener)
        .catch(e => console.error(e));
    } else {
      // For the non e10s case we can just use PageThumbs
      // sync, so let's use the canvas for setDragImage.
      PageThumbs.captureToCanvas(browser, canvas).catch(e =>
        console.error(e)
      );
      dragImageOffset = dragImageOffset * scale;
    }
    dt.setDragImage(toDrag, dragImageOffset, dragImageOffset);
    return true;
  }

  onBrowserDragOver = (event) => {
    if (!this.splitViewActive) return;
    event.preventDefault();
  }

  onBrowserDrop = (event) => {
    if (!this.splitViewActive) return;
    console.log(event);
    const containerId = event.dataTransfer.getData('text/plain');

    const startTab = gBrowser.getTabForBrowser(
      document.getElementById(containerId).querySelector('browser')
    );
    const endTab = gBrowser.getTabForBrowser(
      event.target.querySelector('browser')
    );
    if (!startTab || !endTab) {
      return;
    }

    const currentData = this._data[this.currentView];

    const startIdx = currentData.tabs.indexOf(startTab);
    const endIdx = currentData.tabs.indexOf(endTab);

    currentData.tabs[startIdx] = endTab;
    currentData.tabs[endIdx] = startTab;
    this.applyGridToTabs(currentData.tabs, currentData.gridType, gBrowser.selectedTab);
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

  get splitViewActive() {
    return this.currentView >= 0;
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
    if (tab && this.splitViewActive) {
      this._data[this.currentView].tabs.forEach(t => {
        const container = t.linkedBrowser.closest('.browserSidebarContainer');
        if (t === tab) {
          container.setAttribute('zen-split-active', true);
        } else if (container.hasAttribute('zen-split-active')) {
          container.removeAttribute('zen-split-active');
        }
      });
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

    const splitData = {
      tabs,
      gridType
    }
    this._data.push(splitData);
    window.gBrowser.selectedTab = tabs[0];
    this.activateSplitView(splitData, tabs[0]);
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

    this.setTabsDocShellState(splitData.tabs, true);
    this.updateSplitViewButton(false);

    this.applyGridToTabs(splitData.tabs, activeTab);

    const layout = this.calculateLayoutTree(splitData.tabs, gridType);
    splitData.layoutTree = layout;
    this.applyGridLayout(layout);
  }

  calculateLayoutTree(tabs, gridType) {
    const containerIds = tabs.map(t => t.linkedBrowser.closest('.browserSidebarContainer').id);
    let rootNode;
    if (gridType === 'vsep') {
      rootNode = new SplitNode('row');
      rootNode.children = containerIds.map(id => new SplitLeafNode(id, 100 / tabs.length, 100));
    } else if (gridType === 'hsep' || (tabs.length === 2 && gridType === 'grid')) {
      rootNode = new SplitNode('column');
      rootNode.children = containerIds.map(id => new SplitLeafNode(id, 100, 100 / tabs.length));
    } else if (gridType === 'grid') {
      rootNode = new SplitNode('row');
      const rowWidth = 100 / Math.ceil(tabs.length / 2);
      for (let i = 0; i < tabs.length - 1; i += 2) {
        const columnNode = new SplitNode('column', rowWidth, 100);
        columnNode.children = [new SplitLeafNode(containerIds[i], 100, 50), new SplitLeafNode(containerIds[i + 1], 100, 50)];
        rootNode.children.push(columnNode);
      }
      if (tabs.length % 2 !== 0) {
        rootNode.children.push(new SplitLeafNode(containerIds[tabs.length - 1], rowWidth, 100));
      }
    }

    return rootNode;
  }

  /**
   * Applies the grid layout to the tabs.
   *
   * @param {Tab[]} tabs - The tabs to apply the grid layout to.
   * @param {Tab} activeTab - The active tab.
   */
  applyGridToTabs(tabs,activeTab) {
    tabs.forEach((tab, index) => {
      tab.splitView = true;
      const container = tab.linkedBrowser.closest('.browserSidebarContainer');
      this.styleContainer(container, tab === activeTab, index);
    });
  }

  /**
   * Apply grid layout to tabBrowserPanel
   *
   * @param {SplitNode} splitNode SplitNode
   * @param {{top, bottom, left, right}} nodeRootPosition position of node relative to root of split
   */
  applyGridLayout(splitNode,  nodeRootPosition = {top: 0, bottom: 0, left: 0, right: 0}) {
    if (!splitNode.children) {
      const browserContainer = document.getElementById(splitNode.id);
      browserContainer.style.inset = `${nodeRootPosition.top}% ${nodeRootPosition.right}% ${nodeRootPosition.bottom}% ${nodeRootPosition.left}%`;
      return;
    }

    const rootToNodeWidthRatio = ((100 - nodeRootPosition.right) - nodeRootPosition.left) / 100;
    const rootToNodeHeightRatio = ((100 - nodeRootPosition.bottom) - nodeRootPosition.top) / 100;

    const currentSplitters = this.getSplitters(splitNode);

    let leftOffset = nodeRootPosition.left;
    let topOffset = nodeRootPosition.top;
    splitNode.children.forEach((childNode, i) => {
      const childRootPosition = {top: topOffset, right: 100 - (leftOffset + childNode.widthInParent * rootToNodeWidthRatio), bottom: 100 - (topOffset + childNode.heightInParent * rootToNodeHeightRatio), left: leftOffset};
      this.applyGridLayout(childNode, childRootPosition);

      if (splitNode.direction === 'column') {
        topOffset += childNode.heightInParent * rootToNodeHeightRatio;
      } else {
        leftOffset += childNode.widthInParent * rootToNodeWidthRatio;
      }

      // splitters get inserted by parent
      const isLastNode = i === (splitNode.children.length - 1);
      if (!isLastNode) {
        let splitter = currentSplitters?.[i];
        if (!splitter) {
          splitter = this.createSplitter(splitNode.direction === 'column' ? 'horizontal' : 'vertical', childNode, i);
        }
        if (splitNode.direction === 'column') {
          splitter.style.inset = `${100 - childRootPosition.bottom}% ${childRootPosition.right}% 0% ${childRootPosition.left}%`;
        } else {
          splitter.style.inset = `${childRootPosition.top}% 0% ${childRootPosition.bottom}% ${100 - childRootPosition.right}%`;
        }
      }
    });
  }

  /**
   *
   * @param {String} orient
   * @param {SplitNode} parentNode
   * @param {Number} idx
   */
  createSplitter(orient, parentNode, idx) {
    const splitter = document.createElement('div');
    splitter.className = 'zen-split-view-splitter';
    splitter.setAttribute('orient', orient);
    splitter.setAttribute('gridIdx', idx);
    this.splitterBox.insertAdjacentElement("afterbegin", splitter);

    splitter.parentSplitNode = parentNode;
    if (!this._splitNodeToSplitters.has(parentNode)) {
      this._splitNodeToSplitters.set(parentNode, []);
    }
    this._splitNodeToSplitters.get(parentNode).push(splitter);

    splitter.addEventListener('mousedown', this.handleSplitterMouseDown);
    return splitter;
  }
  getSplitters(parentNode) {
    return this._splitNodeToSplitters.get(parentNode);
  }

  removeSplitters() {
    [...gZenViewSplitter.tabBrowserPanel.children]
      .filter(e => e.classList.contains('zen-split-view-splitter'))
      .forEach(s => s.remove());
  }

  /**
   * Styles the container for a tab.
   *
   * @param {Element} container - The container element.
   * @param {boolean} isActive - Indicates if the tab is active.
   * @param {number} index - The index of the tab.
   */
  styleContainer(container, isActive, index) {
    container.removeAttribute('zen-split-active');
    if (isActive) {
      container.setAttribute('zen-split-active', 'true');
    }
    container.setAttribute('zen-split-anim', 'true');
    container.addEventListener('click', this.handleTabEvent);
    container.addEventListener('mouseover', this.handleTabEvent);
  }

  /**
   * Handles tab events.
   *
   * @param {Event} event - The event.
   */
  handleTabEvent = (event) => {
    if (this.switchViewEnabled || (event.type === 'mouseover' && !this.canChangeTabOnHover)) {
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
        let percentageChange = (movementX / this.tabBrowserPanel.getBoundingClientRect()[isVertical ? 'width' : 'height']) * 100;

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
    }
    const stopListeners = () => {
      removeEventListener('mousemove', dragFunc);
      removeEventListener('mouseup', stopListeners);
      setCursor('auto');
    }
    addEventListener('mousemove', dragFunc);
    addEventListener('mouseup', stopListeners);
    setCursor(isVertical ? 'ew-resize' : 'n-resize');
  }

  /**
   * Applies the grid column and row sizes
   */
  applyGridSizes() {
    const splitData = this._data[this.currentView];
    const columnGap = 'var(--zen-split-column-gap)';
    const rowGap = 'var(--zen-split-row-gap)';

    this.tabBrowserPanel.style.gridTemplateColumns = splitData.widths.slice(0, -1).map(
        (w) => `calc(${w}% - ${columnGap} * ${splitData.widths.length - 1}/${splitData.widths.length}) ${columnGap}`
    ).join(' ');

    this.tabBrowserPanel.style.gridTemplateRows = splitData.heights.slice(0, -1).map(
        (h) => `calc(${h}% - ${rowGap} * ${splitData.heights.length - 1}/${splitData.heights.length}) ${rowGap}`
    ).join(' ');
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
};
