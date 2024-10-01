{
  const lazy = {};

  XPCOMUtils.defineLazyPreferenceGetter(lazy, 'zenTabUnloaderEnabled', 'zen.tab-unloader.enabled', false);

  XPCOMUtils.defineLazyPreferenceGetter(lazy, 'zenTabUnloaderTimeout', 'zen.tab-unloader.timeout-minutes', 20);

  XPCOMUtils.defineLazyPreferenceGetter(lazy, 'zenTabUnloaderExcludedUrls', 'zen.tab-unloader.excluded-urls', '');

  XPCOMUtils.defineLazyPreferenceGetter(
      lazy,
      "zenPinnedTabResetOnCloseShortcutEnabled",
      "zen.tab-unloader.reset-pinned-tab-on-close-shortcut",
      false
  );

  const ZEN_TAB_UNLOADER_DEFAULT_EXCLUDED_URLS = [
    '^about:',
    '^chrome:',
    '^devtools:',
    '^file:',
    '^resource:',
    '^view-source:',
    '^view-image:',
  ];

  class ZenTabsObserver {
    static ALL_EVENTS = [
      'TabAttrModified',
      'TabPinned',
      'TabUnpinned',
      'TabBrowserInserted',
      'TabBrowserDiscarded',
      'TabShow',
      'TabHide',
      'TabOpen',
      'TabClose',
      'TabSelect',
      'TabMultiSelect',
    ];

    #listeners = [];

    constructor() {
      this.#listenAllEvents();
    }

    #listenAllEvents() {
      const eventListener = this.#eventListener.bind(this);
      for (const event of ZenTabsObserver.ALL_EVENTS) {
        window.addEventListener(event, eventListener);
      }
      window.addEventListener('unload', () => {
        for (const event of ZenTabsObserver.ALL_EVENTS) {
          window.removeEventListener(event, eventListener);
        }
      });
    }

    #eventListener(event) {
      for (const listener of this.#listeners) {
        listener(event.type, event);
      }
    }

    addTabsListener(listener) {
      this.#listeners.push(listener);
    }
  }

  class ZenTabsIntervalUnloader {
    static INTERVAL = 1000 * 60; // 1 minute

    interval = null;
    unloader = null;

    #excludedUrls = [];
    #compiledExcludedUrls = [];

    constructor(unloader) {
      this.unloader = unloader;
      this.interval = setInterval(this.intervalListener.bind(this), ZenTabsIntervalUnloader.INTERVAL);
      this.#excludedUrls = this.lazyExcludeUrls;
    }

    get lazyExcludeUrls() {
      return [
        ...ZEN_TAB_UNLOADER_DEFAULT_EXCLUDED_URLS,
        ...lazy.zenTabUnloaderExcludedUrls.split(',').map((url) => url.trim()),
      ];
    }

    arraysEqual(a, b) {
      if (a === b) return true;
      if (a == null || b == null) return false;
      if (a.length !== b.length) return false;

      // If you don't care about the order of the elements inside
      // the array, you should sort both arrays here.
      // Please note that calling sort on an array will modify that array.
      // you might want to clone your array first.

      for (var i = 0; i < a.length; ++i) {
        if (a[i] !== b[i]) return false;
      }
      return true;
    }

    get excludedUrls() {
      // Check if excludedrls is the same as the pref value
      const excludedUrls = this.lazyExcludeUrls;
      if (!this.arraysEqual(this.#excludedUrls, excludedUrls) || !this.#compiledExcludedUrls.length) {
        this.#excludedUrls = excludedUrls;
        this.#compiledExcludedUrls = excludedUrls.map((url) => new RegExp(url));
      }
      return this.#compiledExcludedUrls;
    }

    intervalListener() {
      const currentTimestamp = Date.now();
      const excludedUrls = this.excludedUrls;
      for (const tab of this.unloader.tabs) {
        if (this.unloader.canUnloadTab(tab, currentTimestamp, excludedUrls)) {
          tab.ownerGlobal.gBrowser.discardBrowser(tab);
        }
      }
    }
  }

  class ZenTabUnloader extends ZenDOMOperatedFeature {
    static ACTIVITY_MODIFIERS = ['muted', 'soundplaying', 'label', 'attention'];

    init() {
      if (!lazy.zenTabUnloaderEnabled) {
        return;
      }
      this.insertIntoContextMenu();

      this.insertResetTabIntoContextMenu();
      this.initClosePinnedTabShortcut();
      this.observer = new ZenTabsObserver();
      this.intervalUnloader = new ZenTabsIntervalUnloader(this);
      this.observer.addTabsListener(this.onTabEvent.bind(this));
    }

    onCloseTabShortcut(event) {
      if (
          event &&
          (event.ctrlKey || event.metaKey || event.altKey) &&
          gBrowser.selectedTab.pinned
      ) {
        const selectedTab = gBrowser.selectedTab;
        const url = selectedTab.getAttribute("zen-pinned-url");
        const title = selectedTab.getAttribute("zen-pinned-title");

        let nextTab = gBrowser.tabContainer.findNextTab(selectedTab, {
          direction: 1,
          filter: tab => !tab.hidden && !tab.pinned,
        });

        if (!nextTab) {
          // If there's no next tab, try to find the previous one
          nextTab = gBrowser.tabContainer.findNextTab(selectedTab, {
            direction: -1,
            filter: tab => !tab.hidden && !tab.pinned,
          });
        }

        if (selectedTab) {
          // Switch to the next tab
          gBrowser.selectedTab = nextTab;

          if (url && this.zenPinnedTabResetOnCloseShortcutEnabled) {
            const tabState = SessionStore.getTabState(selectedTab);
            const state = JSON.parse(tabState);
            let activeIndex = (state.index || state.entries.length) - 1;
            // Ensure the index is in bounds.
            activeIndex = Math.min(activeIndex, state.entries.length - 1);
            activeIndex = Math.max(activeIndex, 0);
            state.entries[activeIndex].url = url;
            state.entries[activeIndex].title = title;
            SessionStore.setTabState(selectedTab, state);
          }

          gBrowser.discardBrowser(selectedTab);

          event.stopPropagation();
          event.preventDefault();
        }
      }
    }

    initClosePinnedTabShortcut() {
      let cmdClose = document.getElementById('cmd_close');

      if (cmdClose) {
        cmdClose.addEventListener('command', this.onCloseTabShortcut.bind(lazy));
      }
    }

    ResetPinnedTab(){
      const selectedTab = TabContextMenu.contextTab;

      const url = selectedTab.getAttribute("zen-pinned-url");
      const title = selectedTab.getAttribute("zen-pinned-title");

      if (url) {
        const tabState = SessionStore.getTabState(selectedTab);
        const state = JSON.parse(tabState);

        let activeIndex = (state.index || state.entries.length) - 1;
        // Ensure the index is in bounds.
        activeIndex = Math.min(activeIndex, state.entries.length - 1);
        activeIndex = Math.max(activeIndex, 0);
        state.entries[activeIndex].url = url;
        state.entries[activeIndex].title = title;
        SessionStore.setTabState(selectedTab, state);
      }
    }

    insertResetTabIntoContextMenu() {
      const element = window.MozXULElement.parseXULToFragment(`
        <menuitem id="context_zen-reset-pinned-tab"
                  data-lazy-l10n-id="tab-context-zen-reset-pinned-tab"
                  hidden="true"
                  oncommand="gZenTabUnloader.ResetPinnedTab();"/>
      `);
      document.getElementById('context_zenUnloadTab').before(element);
    }

    onTabEvent(action, event) {
      const tab = event.target;
      switch (action) {
        case "TabPinned":
          tab.setAttribute("zen-pinned-url", tab.linkedBrowser.currentURI.spec);
          tab.setAttribute("zen-pinned-title", tab.getAttribute("label"));
          break;
        case "TabUnpinned":
          tab.removeAttribute("zen-pinned-url");
          tab.removeAttribute("zen-pinned-title");
          break;
        case "TabBrowserInserted":
        case "TabBrowserDiscarded":
        case "TabShow":
        case "TabHide":
          break;
        case 'TabAttrModified':
          this.handleTabAttrModified(tab, event);
          break;
        case 'TabOpen':
          this.handleTabOpen(tab);
          break;
        case 'TabClose':
          this.handleTabClose(tab);
          break;
        case 'TabSelect':
        case 'TabMultiSelect':
          this.updateTabActivity(tab);
          break;
        default:
          console.warn('ZenTabUnloader: Unhandled tab event', action);
          break;
      }
    }

    onLocationChange(browser) {
      const tab = browser.ownerGlobal.gBrowser.getTabForBrowser(browser);
      this.updateTabActivity(tab);
    }

    handleTabClose(tab) {
      // Nothing yet
    }

    handleTabOpen(tab) {
      if (!lazy.zenTabUnloaderEnabled) {
        return;
      }
      this.updateTabActivity(tab);
    }

    handleTabAttrModified(tab, event) {
      for (const modifier of ZenTabUnloader.ACTIVITY_MODIFIERS) {
        if (event.detail.changed.includes(modifier)) {
          this.updateTabActivity(tab);
          break;
        }
      }
    }

    updateTabActivity(tab) {
      const currentTimestamp = Date.now();
      tab.lastActivity = currentTimestamp;
    }

    get tabs() {
      return gBrowser.tabs;
    }

    insertIntoContextMenu() {
      const element = window.MozXULElement.parseXULToFragment(`
        <menuseparator/>
        <menuitem id="context_zenUnloadTab"
                  data-lazy-l10n-id="tab-zen-unload"
                  oncommand="gZenTabUnloader.unloadTab();"/>
        <menu data-lazy-l10n-id="zen-tabs-unloader-tab-actions" id="context_zenTabActions">
          <menupopup>
            <menuitem id="context_zenPreventUnloadTab"
                      data-lazy-l10n-id="tab-zen-prevent-unload"
                      oncommand="gZenTabUnloader.preventUnloadTab();"/>
            <menuitem id="context_zenIgnoreUnloadTab"
                      data-lazy-l10n-id="tab-zen-ignore-unload"
                      oncommand="gZenTabUnloader.ignoreUnloadTab();"/>
          </menupopup>
        </menu>
      `);
      document.getElementById('context_closeDuplicateTabs').parentNode.appendChild(element);
    }

    unloadTab() {
      const tabs = TabContextMenu.contextTab.multiselected ? gBrowser.selectedTabs : [TabContextMenu.contextTab];
      for (const tab of tabs) {
        gBrowser.discardBrowser(tab);
      }
    }

    preventUnloadTab() {
      const tabs = TabContextMenu.contextTab.multiselected ? gBrowser.selectedTabs : [TabContextMenu.contextTab];
      for (const tab of tabs) {
        tab.zenIgnoreUnload = true;
      }
    }

    ignoreUnloadTab() {
      const tabs = TabContextMenu.contextTab.multiselected ? gBrowser.selectedTabs : [TabContextMenu.contextTab];
      for (const tab of tabs) {
        tab.zenIgnoreUnload = false;
      }
    }

    canUnloadTab(tab, currentTimestamp, excludedUrls) {
      if (
        tab.pinned ||
        tab.selected ||
        tab.multiselected ||
        tab.hasAttribute('busy') ||
        tab.hasAttribute('pending') ||
        !tab.linkedPanel ||
        tab.splitView ||
        tab.attention ||
        tab.pictureinpicture ||
        tab.soundPlaying ||
        tab.zenIgnoreUnload ||
        excludedUrls.some((url) => url.test(tab.linkedBrowser.currentURI.spec))
      ) {
        return false;
      }
      const lastActivity = tab.lastActivity;
      if (!lastActivity) {
        return false;
      }
      const diff = currentTimestamp - lastActivity;
      // Check if the tab has been inactive for more than the timeout
      return diff > lazy.zenTabUnloaderTimeout * 60 * 1000;
    }
  }

  window.gZenTabUnloader = new ZenTabUnloader();
}
