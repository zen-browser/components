class SplitNode {
  /**
   * @type {number}
   * @type
   */
  widthInParent ;
  /**
   * @type {number}
   */
  heightInParent ;
  /**
   * @type {Object}
   */
  positionToRoot; // position relative to root node
  /**
   * @type {SplitNode}
   */
  parent;
  /**
   * @type {string}
   */
  direction;

  constructor(direction, widthInParent = 100, heightInParent = 100) {
    this.widthInParent = widthInParent;
    this.heightInParent = heightInParent;
    this.direction = direction; // row or column
    this._children = [];
  }

  set children(children) {
    if (children) children.forEach(c => c.parent = this);
    this._children = children;
  }

  get children() {
    return this._children;
  }

  addChild(child) {
    child.parent = this;
    this._children.push(child);
  }
}
class SplitLeafNode {
  constructor(tab, widthInParent = 100, heightInParent = 100) {
    this.tab = tab;
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
    this._tabToSplitNode = new Map();

    XPCOMUtils.defineLazyPreferenceGetter(
      this,
      "canChangeTabOnHover",
      "zen.splitView.change-on-hover",
      false
    );

    XPCOMUtils.defineLazyPreferenceGetter(
      this,
      'minResizeWidth',
      'zen.splitView.min-resize-width',
      7
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
      const node = this._tabToSplitNode.get(tab);
      this.applyRemoveNode(node);
    }
  }

  /**
   * Remove a SplitNode from its tree and the view
   * @param {SplitNode} toRemove
   */
  applyRemoveNode(toRemove) {
    this._removeNodeSplitters(toRemove, true);
    const parent = toRemove.parent;
    const childIndex = parent.children.indexOf(toRemove);
    parent.children.splice(childIndex, 1);
    if (parent.children.length !== 1) {
      const nodeToResize = parent.children[Math.max(0, childIndex - 1)];
      if (parent.direction === 'column') nodeToResize.heightInParent += toRemove.heightInParent;
      else nodeToResize.widthInParent += toRemove.widthInParent;
      this.applyGridLayout(parent);
      return;
    }
    // node that is not a leaf cannot have less than 2 children, this makes for better resizing
    // node takes place of parent
    const leftOverChild = parent.children[0];
    leftOverChild.widthInParent = parent.widthInParent;
    leftOverChild.heightInParent = parent.heightInParent;
    if (parent.parent) {
      leftOverChild.parent = parent.parent;
      parent.parent.children[parent.parent.children.indexOf(parent)] = leftOverChild;
      this._removeNodeSplitters(parent, false);
      this.applyGridLayout(parent.parent);
    } else {
      const viewData = Object.values(this._data).find(s => s.layoutTree === parent);
      viewData.layoutTree = parent;
      parent.positionToRoot = null;
      this.applyGridLayout(parent);
    }
  }

  /**
   * @param node
   * @param {boolean} recursive
   * @private
   */
  _removeNodeSplitters(node, recursive ) {
    this.getSplitters(node)?.forEach(s => s.remove());
    this._splitNodeToSplitters.delete(node);
    if (!recursive) return;
    if (node.children) node.children.forEach(c => this._removeNodeSplitters(c));
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
    this.applyGridToTabs(currentData.tabs, currentData.gridType);
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
    this.resetContainerStyle(container);
    container.removeEventListener('click', this.handleTabEvent);
    container.removeEventListener('mouseover', this.handleTabEvent);
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
      this.deactivateCurrentSplitView();
    }
    for (const tab of this._data[groupIndex].tabs) {
      this.resetTabState(tab, true);
    }
    this._data.splice(groupIndex, 1);
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
      const group = this._data[groupIndex];
      if (group.gridType === gridType) {
        // Add any tabs that are not already in the group
        for (const tab of tabs) {
          if (!group.tabs.includes(tab)) {
            group.tabs.push(tab);
            this.addTabToSplit(tab, group.layoutTree);
          }
        }
      } else {
        group.gridType = gridType;
        group.layoutTree = this.calculateLayoutTree(tabs, gridType);
      }
      this.activateSplitView(group);
      return;
    }

    const splitData = {
      tabs,
      gridType,
      layoutTree: this.calculateLayoutTree(tabs, gridType),
    }
    this._data.push(splitData);
    window.gBrowser.selectedTab = tabs[0];
    this.activateSplitView(splitData);
  }

  addTabToSplit(tab, splitNode) {
    if (splitNode.direction === 'row') {
      const reduce = splitNode.children.length / (splitNode.children.length + 1);
      splitNode.children.forEach(c => c.widthInParent *= reduce);
      splitNode.addChild(new SplitLeafNode(tab, (1 - reduce) * 100, 100));
    } else if (splitNode.direction === 'column') {
      const reduce = splitNode.children.length / (splitNode.children.length + 1);
      splitNode.children.forEach(c => c.heightInParent *= reduce);
      splitNode.addChild(new SplitLeafNode(tab, (1 - reduce) * 100, 100));
    }
  }

  /**
   * Updates the split view.
   *
   * @param {Tab} tab - The tab to update the split view for.
   */
  updateSplitView(tab) {
    const oldView = this.currentView;
    const newView = this._data.findIndex((group) => group.tabs.includes(tab));

    if (oldView === newView) return;
    if (newView < 0 && oldView >= 0) {
      this.updateSplitViewButton(true);
      this.deactivateCurrentSplitView();
      return;
    }
    this.activateSplitView(this._data[newView]);
  }

  /**
   * Deactivates the split view.
   */
  deactivateCurrentSplitView() {
    for (const tab of this._data[this.currentView].tabs) {
      const container = tab.linkedBrowser.closest('.browserSidebarContainer');
      this.resetContainerStyle(container);
    }
    this.removeSplitters();
    this.tabBrowserPanel.removeAttribute('zen-split-view');
    this.setTabsDocShellState(this._data[this.currentView].tabs, false);
    this.currentView = -1;
  }

  /**
   * Activates the split view.
   *
   * @param {object} splitData - The split data.
   */
  activateSplitView(splitData, reset = false) {
    const oldView = this.currentView;
    const newView = this._data.indexOf(splitData);
    if (oldView >= 0 && oldView !== newView) this.deactivateCurrentSplitView();
    this.currentView = newView;
    if (reset) this.removeSplitters();
    splitData.tabs.forEach((tab) => {
      if (tab.hasAttribute('pending')) {
        gBrowser.getBrowserForTab(tab).reload();
      }
    });

    this.tabBrowserPanel.setAttribute('zen-split-view', 'true');

    this.setTabsDocShellState(splitData.tabs, true);
    this.updateSplitViewButton(false);
    this.applyGridToTabs(splitData.tabs);
    this.applyGridLayout(splitData.layoutTree);
  }

  calculateLayoutTree(tabs, gridType) {
    let rootNode;
    if (gridType === 'vsep') {
      rootNode = new SplitNode('row');
      rootNode.children = tabs.map(tab => new SplitLeafNode(tab, 100 / tabs.length, 100));
    } else if (gridType === 'hsep' || (tabs.length === 2 && gridType === 'grid')) {
      rootNode = new SplitNode('column');
      rootNode.children = tabs.map(tab => new SplitLeafNode(tab, 100, 100 / tabs.length));
    } else if (gridType === 'grid') {
      rootNode = new SplitNode('row');
      const rowWidth = 100 / Math.ceil(tabs.length / 2);
      for (let i = 0; i < tabs.length - 1; i += 2) {
        const columnNode = new SplitNode('column', rowWidth, 100);
        columnNode.children = [new SplitLeafNode(tabs[i], 100, 50), new SplitLeafNode(tabs[i + 1], 100, 50)];
        rootNode.addChild(columnNode);
      }
      if (tabs.length % 2 !== 0) {
        rootNode.addChild(new SplitLeafNode(tabs[tabs.length - 1], rowWidth, 100));
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
  applyGridToTabs(tabs) {
    tabs.forEach((tab, index) => {
      tab.splitView = true;
      const container = tab.linkedBrowser.closest('.browserSidebarContainer');
      this.styleContainer(container);
    });
  }

  /**
   * Apply grid layout to tabBrowserPanel
   *
   * @param {SplitNode} splitNode SplitNode
   */
  applyGridLayout(splitNode) {
    if (!splitNode.positionToRoot) {
      splitNode.positionToRoot = {top: 0, bottom: 0, left: 0, right: 0};
    }
    const nodeRootPosition = splitNode.positionToRoot;
    if (!splitNode.children) {
      const browserContainer = splitNode.tab.linkedBrowser.closest('.browserSidebarContainer');
      browserContainer.style.inset = `${nodeRootPosition.top}% ${nodeRootPosition.right}% ${nodeRootPosition.bottom}% ${nodeRootPosition.left}%`;
      this._tabToSplitNode.set(splitNode.tab, splitNode);
      return;
    }

    const rootToNodeWidthRatio = ((100 - nodeRootPosition.right) - nodeRootPosition.left) / 100;
    const rootToNodeHeightRatio = ((100 - nodeRootPosition.bottom) - nodeRootPosition.top) / 100;

    const splittersNeeded = splitNode.children.length - 1;
    const currentSplitters = this.getSplitters(splitNode, splittersNeeded);

    let leftOffset = nodeRootPosition.left;
    let topOffset = nodeRootPosition.top;
    splitNode.children.forEach((childNode, i) => {
      const childRootPosition = {top: topOffset, right: 100 - (leftOffset + childNode.widthInParent * rootToNodeWidthRatio), bottom: 100 - (topOffset + childNode.heightInParent * rootToNodeHeightRatio), left: leftOffset};
      childNode.positionToRoot = childRootPosition;
      this.applyGridLayout(childNode);

      if (splitNode.direction === 'column') {
        topOffset += childNode.heightInParent * rootToNodeHeightRatio;
      } else {
        leftOffset += childNode.widthInParent * rootToNodeWidthRatio;
      }

      if (i < splittersNeeded) {
        const splitter = currentSplitters[i];
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

    splitter.addEventListener('mousedown', this.handleSplitterMouseDown);
    return splitter;
  }

  /**
   * @param {SplitNode} parentNode
   * @param {number|undefined} splittersNeeded if provided the amount of splitters for node will be adjusted to match
   */
  getSplitters(parentNode, splittersNeeded) {
    let currentSplitters = this._splitNodeToSplitters.get(parentNode) || [];
    if (!splittersNeeded || currentSplitters.length === splittersNeeded) return currentSplitters;
    for (let i = currentSplitters?.length || 0; i < splittersNeeded; i++) {
      currentSplitters.push(
        this.createSplitter(parentNode.direction === 'column' ? 'horizontal' : 'vertical', parentNode, i)
      );
      currentSplitters[i].parentSplitNode = parentNode;
    }
    if (currentSplitters.length > splittersNeeded) {
      currentSplitters.slice(splittersNeeded - currentSplitters.length).forEach(s => s.remove());
      currentSplitters = currentSplitters.slice(0, splittersNeeded);
    }
    this._splitNodeToSplitters.set(parentNode, currentSplitters);
    return currentSplitters;
  }

  removeSplitters() {
    Array.from(this._splitNodeToSplitters.values()).flatMap(v => v).forEach(e => e.remove());
    this._splitNodeToSplitters.clear();
  }

  /**
   * Styles the container for a tab.
   *
   * @param {Element} container - The container element.
   */
  styleContainer(container) {
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
    const isVertical = event.target.getAttribute('orient') === 'vertical';
    const dimension = isVertical ? 'width' : 'height';
    const dimensionInParent = dimension + 'InParent';
    const clientAxis = isVertical ? 'screenX' : 'screenY';

    const gridIdx = parseInt(event.target.getAttribute('gridIdx'));
    const startPosition = event[clientAxis];
    const splitNode = event.target.parentSplitNode;
    let rootToNodeSize;
    if (isVertical) rootToNodeSize = 100 / (100 - splitNode.positionToRoot.right - splitNode.positionToRoot.left);
    else rootToNodeSize = 100 / (100 - splitNode.positionToRoot.bottom - splitNode.positionToRoot.top);
    const originalSizes = splitNode.children.map(c => c[dimensionInParent]);

    const dragFunc = (dEvent) => {
      requestAnimationFrame(() => {
        originalSizes.forEach((s, i) => splitNode.children[i][dimensionInParent] = s); // reset changes

        const movement = dEvent[clientAxis] - startPosition;
        let movementPercent = (movement / this.tabBrowserPanel.getBoundingClientRect()[dimension] * rootToNodeSize) * 100;

        let reducingMovement = Math.max(movementPercent, -movementPercent);
        for (let i = gridIdx + (movementPercent < 0 ? 0 : 1); 0 <= i && i < originalSizes.length; i += movementPercent < 0 ? -1 : 1) {
          const current = originalSizes[i];
          const newSize = Math.max(this.minResizeWidth, current - reducingMovement);
          splitNode.children[i][dimensionInParent] = newSize;
          const amountReduced = current - newSize;
          reducingMovement -= amountReduced;
          if (reducingMovement <= 0) break;
        }
        const increasingMovement = Math.max(movementPercent, - movementPercent) - reducingMovement;
        const increaseIndex = gridIdx + (movementPercent < 0 ? 1 : 0);
        splitNode.children[increaseIndex][dimensionInParent] = originalSizes[increaseIndex] + increasingMovement;
        this.applyGridLayout(splitNode);
      });
    }

    setCursor(isVertical ? 'ew-resize' : 'n-resize');
    document.addEventListener('mousemove', dragFunc);
    document.addEventListener('mouseup', () => {
      document.removeEventListener('mousemove', dragFunc);
      setCursor('auto');
    }, {once: true});
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
    container.removeAttribute('zen-split');
    container.style.inset = '';
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
      const group = this._data[this.currentView];
      group.gridType = gridType;
      group.layoutTree = this.calculateLayoutTree(group.tabs, gridType);
      this.activateSplitView(group, true);
    }
    panel.hidePopup();
  }

  /**
   * @description unsplit the current view.]
   */
  unsplitCurrentView() {
    if (this.currentView < 0) return;
    this.removeGroup(this.currentView);
    const currentTab = window.gBrowser.selectedTab;
    window.gBrowser.selectedTab = currentTab;
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