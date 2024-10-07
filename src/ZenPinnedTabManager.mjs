class ZenPinnedTabsObserver {
  static ALL_EVENTS = ['TabPinned', 'TabUnpinned'];

  #listeners = [];

  constructor() {
    this.#listenPinnedTabEvents();
  }

  #listenPinnedTabEvents() {
    const eventListener = this.#eventListener.bind(this);
    for (const event of ZenPinnedTabsObserver.ALL_EVENTS) {
      window.addEventListener(event, eventListener);
    }
    window.addEventListener('unload', () => {
      for (const event of ZenPinnedTabsObserver.ALL_EVENTS) {
        window.removeEventListener(event, eventListener);
      }
    });
  }

  #eventListener(event) {
    for (const listener of this.#listeners) {
      listener(event.type, event);
    }
  }

  addPinnedTabListener(listener) {
    this.#listeners.push(listener);
  }
}

class ZenPinnedTabManager {
  init() {
    this.observer = new ZenPinnedTabsObserver();
    this.initClosePinnedTabShortcut();
    this.insertResetTabIntoContextMenu();
    this.observer.addPinnedTabListener(this.onPinnedTabEvent.bind(this));
  }

  onPinnedTabEvent(action, event) {
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
      default:
        console.warn('ZenPinnedTabManager: Unhandled tab event', action);
        break;
    }
  }

  resetPinnedTab(tab) {

    if(!tab){
      tab = TabContextMenu.contextTab;
    }

    if (!tab || !tab.pinned) {
      return;
    }

    const url = tab.getAttribute("zen-pinned-url");
    const title = tab.getAttribute("zen-pinned-title");

    if (url) {
      const tabState = SessionStore.getTabState(tab);
      const state = JSON.parse(tabState);

      let activeIndex = (state.index || state.entries.length) - 1;
      activeIndex = Math.min(activeIndex, state.entries.length - 1);
      activeIndex = Math.max(activeIndex, 0);
      state.entries[activeIndex].url = url;
      state.entries[activeIndex].title = title;
      SessionStore.setTabState(tab, state);
    }
  }

  initClosePinnedTabShortcut() {
    let cmdClose = document.getElementById('cmd_close');

    if (cmdClose) {
      cmdClose.addEventListener('command', this.onCloseTabShortcut.bind(this));
    }
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
        nextTab = gBrowser.tabContainer.findNextTab(selectedTab, {
          direction: -1,
          filter: tab => !tab.hidden && !tab.pinned,
        });
      }

      if (selectedTab) {
        gBrowser.selectedTab = nextTab;

        if (url && Services.prefs.getBoolPref('zen.pinned-tab-manager.reset-pinned-tab-on-close-shortcut',false)) {
          const tabState = SessionStore.getTabState(selectedTab);
          const state = JSON.parse(tabState);
          let activeIndex = (state.index || state.entries.length) - 1;
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

  insertResetTabIntoContextMenu() {
    console.log('insertResetTabIntoContextMenu');
    const element = window.MozXULElement.parseXULToFragment(`
            <menuitem id="context_zen-reset-pinned-tab"
                      data-lazy-l10n-id="tab-context-zen-reset-pinned-tab"
                      hidden="true"
                      oncommand="gZenPinnedTabManager.resetPinnedTab();"/>
        `);
    document.getElementById('tabContextMenu').appendChild(element);
  }
}

window.gZenPinnedTabManager = new ZenPinnedTabManager();
