
class SplitViewsUtils {
  /**
   * @returns {HTMLDivElement}
   */
  get tabBrowser() {
    if (!this._tabBrowser) {
      this._tabBrowser = document.getElementById('tabbrowser-tabpanels');
    }
    // @ts-ignore
    return this._tabBrowser;
  }
}

class SplitViewsBase extends SplitViewsUtils {
  /**
   * @type {SplitView[]}
   */
  data;

  /**
   * @param {SplitViewConfig} config
   */
  constructor(config) {
    super();
    this.config = config;
    this.data = [];
    this.currentView = -1;
    this.globalIdCounter = 0;
    // Added to "navigator-toolbox" element
    this.parentSplitIndicator = this.config.splitIndicator + '-view';
    this.log('SplitViewsBase initialized');
  }

  /**
   * @param {string} message
   * @protected
   */
  log(message) {
    console.log(`SplitViews: ${message}`);
  }

  get isActivated() {
    return this.currentView !== -1;
  }

  get activeView() {
    if (!this.isActivated) {
      throw new Error('No active view');
    }
    return this.data[this.currentView];
  }

  /**
   * @param {MockedExports.BrowserTab} tab
   */
  getTabView(tab) {
    return this.data.find(view => view.tabs.includes(tab));
  }

  /**
   * @param {MockedExports.BrowserTab} tab
   */
  isTabSplit(tab) {
    return tab.hasAttribute(this.config.splitIndicator);
  }

  /**
   * @param {MockedExports.BrowserTab} tab
   * @param {SplitType} type
   * @param {MockedExports.BrowserTab[]} tabs
   */
  changeSplitViewBase(tab, type, tabs) {
    let view = this.getTabView(tab);
    if (!view) {
      return -1;
    }
    view.type = type;
    view.tabs.push(...tabs.filter(t => !view.tabs.includes(t)));
    return view.id;
  }

  /**
   * @param {MockedExports.BrowserTab[]} tabs
   * @param {SplitType} type
   */
  createSplitViewBase(tabs, type) {
    let view = {
      id: this.globalIdCounter++,
      type,
      tabs,
    };
    this.data.push(view);
    this.currentView = this.data.length - 1;
    return view.id;
  }

  /**
   * Applies the grid layout to the tabs.
   *
   * @param {MockedExports.BrowserTab[]} tabs - The tabs to apply the grid layout to.
   * @param {string} gridType - The type of grid layout.
   * @param {MockedExports.BrowserTab} activeTab - The active tab.
   */
  applyGridLayout(tabs, gridType, activeTab) {
    const gridAreas = this.calculateGridAreas(tabs, gridType);
    this.tabBrowser.style.gridTemplateAreas = gridAreas;

    tabs.forEach((tab, index) => {
      tab.setAttribute(this.config.splitIndicator, "true");
      const container = tab.linkedBrowser.closest(".browserSidebarContainer");
      if (!container) {
        throw new Error("Container not found");
      }
      this.styleContainer(container, tab === activeTab, index, gridType);
    });
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
    container.removeAttribute("split-active");
    if (isActive) {
      container.setAttribute("split-active", "true");
    }
    container.setAttribute("split-anim", "true");
    container.addEventListener("click", this.handleTabClick);

    if (gridType === "grid") {
      // @ts-ignore
      container.style.gridArea = `tab${index + 1}`;
    }
  }

  /**
   * Calculates the grid areas for the tabs.
   *
   * @param {MockedExports.BrowserTab[]} tabs - The tabs.
   * @param {string} gridType - The type of grid layout.
   * @returns {string} The calculated grid areas.
   */
  calculateGridAreas(tabs, gridType) {
    if (gridType === "grid") {
      return this.calculateGridAreasForGrid(tabs);
    }
    if (gridType === "vsep") {
      return `'${tabs.map((_, j) => `tab${j + 1}`).join(" ")}'`;
    }
    if (gridType === "hsep") {
      return tabs.map((_, j) => `'tab${j + 1}'`).join(" ");
    }
    return "";
  }

  /**
   * Handles the tab click event.
   *
   * @param {Event} event - The click event.
   */
  handleTabClick(event) {
    const container = event.currentTarget;
    // @ts-ignore
    const tab = window.gBrowser.tabs.find(
      // @ts-ignore
      t => t.linkedBrowser.closest(".browserSidebarContainer") === container
    );
    if (tab) {
      // @ts-ignore
      window.gBrowser.selectedTab = tab;
    }
  };

  /**
   * Calculates the grid areas for the tabs in a grid layout.
   *
   * @param {MockedExports.BrowserTab[]} tabs - The tabs.
   * @returns {string} The calculated grid areas.
   */
  calculateGridAreasForGrid(tabs) {
    const rows = ["", ""];
    tabs.forEach((_, i) => {
      if (i % 2 === 0) {
        rows[0] += ` tab${i + 1}`;
      } else {
        rows[1] += ` tab${i + 1}`;
      }
    });

    if (tabs.length === 2) {
      return "'tab1 tab2'";
    }

    if (tabs.length % 2 !== 0) {
      rows[1] += ` tab${tabs.length}`;
    }

    return `'${rows[0].trim()}' '${rows[1].trim()}'`;
  }

  /**
   * @param {number} viewId
   * @protected
   */
  updateSplitView(viewId) {
    let view = this.data.find(view => view.id === viewId);
    this.log(`updateSplitView: ${viewId}`);
    this.currentView = viewId;
    if (!view) {
      this.tabBrowser.removeAttribute(this.parentSplitIndicator);
      throw new Error('TODO: Remove split view');
      return;
    }
    this.tabBrowser.setAttribute(this.parentSplitIndicator, "true");
    this.applyGridLayout(view.tabs, view.type, view.tabs[0]);
  }

  /**
   * @param {MockedExports.BrowserTab[]} tabs
   * @param {SplitType} type
   * @protected
   */
  createOrChangeSplitView(tabs, type) {
    let activeTab = tabs.find(tab => this.isTabSplit(tab));
    this.log(`createOrChangeSplitView: ${type}`);
    let viewId = -1;
    if (activeTab) {
      viewId = this.changeSplitViewBase(activeTab, type, tabs);
    } else {
      viewId = this.createSplitViewBase(tabs, type);
    }
    this.updateSplitView(viewId);
  }
}

// Public API exposed by the module
export class SplitViews extends SplitViewsBase {
  /**
   * @param {SplitViewConfig} config
   */
  constructor(config) {
    super(config);
    this.addEventListeners();
  }

  addEventListeners() {
    window.addEventListener('TabClose', this);
  }

  /**
   * @param {Event} event
   */
  handleEvent(event) {
    switch (event.type) {
      case 'TabClose':
        this.onTabClose(event);
        break;
    }
  }

  /**
   * @param {Event} event
   */
  // @ts-ignore
  // @ts-ignore
  onTabClose(event) {
  }

  /**
   * @param {MockedExports.Browser} browser
   */
  // @ts-ignore
  // @ts-ignore
  onLocationChange(browser) {
    this.log('onLocationChange');
  }

  /**
   * @param {SplitType} type
   */
  // @ts-ignore
  // @ts-ignore
  tileCurrentView(type) {
    this.log('tileCurrentView');
  }

  closeCurrentView() {
    this.log('closeCurrentView');
  }

  /**
   * @param {MockedExports.BrowserTab} tab
   */
  // @ts-ignore
  // @ts-ignore
  tabIsInActiveView(tab) {
    this.log('tabIsInActiveView');
    return false;
  }

  getActiveViewTabs() {
    this.log('getActiveViewTabs');
    return [];
  }

  getActiveViewType() {
    if (!this.isActivated) {
      return undefined;
    }
    return this.activeView.type;
  }

  /**
   * @param {MockedExports.BrowserTab[]} tabs
   * @param {SplitType} type
   * @public
   */
  createSplitView(tabs, type = this.config.defaultSplitView) {
    if (tabs.length < 2) {
      return;
    }
    this.createOrChangeSplitView(tabs, type);
  }
};
