
class SplitViewsBase {
  /**
   * @type {SplitView[]}
   */
  data;

  /**
   * @param {SplitViewConfig} config
   */
  constructor(config) {
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
   * @param {number} viewId
   * @protected
   */
  updateSplitView(viewId) {
    let view = this.data.find(view => view.id === viewId);
    if (!view) {
      return;
    }
    // TODO: Update tab DOM here
  }

  /**
   * @param {MockedExports.BrowserTab[]} tabs
   * @param {SplitType} type
   * @protected
   */
  createOrChangeSplitView(tabs, type) {
    let activeTab = tabs.find(tab => this.isTabSplit(tab));
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
  onTabClose(event) {
  }

  /**
   * @param {MockedExports.Browser} browser
   */
  onLocationChange(browser) {
    this.log('onLocationChange');
  }

  /**
   * @param {SplitType} type
   */
  tileCurrentView(type) {
    this.log('tileCurrentView');
  }

  closeCurrentView() {
    this.log('closeCurrentView');
  }

  /**
   * @param {MockedExports.BrowserTab} tab
   */
  tabIsInActiveView(tab) {
    this.log('tabIsInActiveView');
    return false;
  }

  getActiveViewTabs() {
    this.log('getActiveViewTabs');
    return [];
  }

  /**
   * @param {MockedExports.BrowserTab[]} tabs
   * @param {SplitType} type
   * @private
   */
  createSplitView(tabs, type = this.config.defaultSplitView) {
    if (tabs.length < 2) {
      return;
    }
    this.createOrChangeSplitView(tabs, type);
  }
};
