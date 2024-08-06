
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
    this.addEventListeners();
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

  get isActivated() {
    return this.currentView !== -1;
  }

  get activeView() {
    if (!this.isActivated) {
      throw new Error('No active view');
    }
    return this.data[this.currentView];
  }
}

// Public API exposed by the module
export class SplitViews extends SplitViewsBase {
  /**
   * @param {SplitViewConfig} config
   */
  constructor(config) {
    super(config);
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
    this.log('createSplitView');
  }
};
