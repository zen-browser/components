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
    this._initClosePinnedTabShortcut();
    this.insertItemsIntoTabContextMenu();
    this.observer.addPinnedTabListener(this._onPinnedTabEvent.bind(this));
  }

  _onPinnedTabEvent(action, event) {
    const tab = event.target;
    switch (action) {
      case "TabPinned":
        this._setPinnedAttributes(tab);
        break;
      case "TabUnpinned":
        this._removePinnedAttributes(tab);
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
    const icon = tab.getAttribute("zen-pinned-icon");

    if (url) {
      const tabState = SessionStore.getTabState(tab);
      const state = JSON.parse(tabState);

      if(!!state.entries.length) {
        let activeIndex = (state.index || state.entries.length) - 1;
        activeIndex = Math.min(activeIndex, state.entries.length - 1);
        activeIndex = Math.max(activeIndex, 0);

        state.entries[activeIndex].url = url;
        state.entries[activeIndex].title = title;
        state.image = icon;
      } else {
        state.entries.push({ url, title, image: icon });
      }


      SessionStore.setTabState(tab, state);
    }
  }

  replacePinnedUrlWithCurrent(){
    const tab = TabContextMenu.contextTab;
    if (!tab || !tab.pinned) {
      return;
    }

    this._setPinnedAttributes(tab);
  }

  _setPinnedAttributes(tab) {
    tab.setAttribute("zen-pinned-url", tab.linkedBrowser.currentURI.spec);
    tab.setAttribute("zen-pinned-title", tab.getAttribute("label"));
    tab.setAttribute("zen-pinned-icon", tab.linkedBrowser.mIconURL);
  }

  _removePinnedAttributes(tab) {
    tab.removeAttribute("zen-pinned-url");
    tab.removeAttribute("zen-pinned-title");
    tab.removeAttribute("zen-pinned-icon");
  }

  _initClosePinnedTabShortcut() {
    let cmdClose = document.getElementById('cmd_close');

    if (cmdClose) {
      cmdClose.addEventListener('command', this._onCloseTabShortcut.bind(this));
    }
  }

  _onCloseTabShortcut(event) {
    if (
        event &&
        (event.ctrlKey || event.metaKey || event.altKey) &&
        gBrowser.selectedTab.pinned
    ) {
      const selectedTab = gBrowser.selectedTab;
      const url = selectedTab.getAttribute("zen-pinned-url");
      const title = selectedTab.getAttribute("zen-pinned-title");
      const icon = selectedTab.getAttribute("zen-pinned-icon");

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

          if(!!state.entries.length) {
            let activeIndex = (state.index || state.entries.length) - 1;
            activeIndex = Math.min(activeIndex, state.entries.length - 1);
            activeIndex = Math.max(activeIndex, 0);

            state.entries[activeIndex].url = url;
            state.entries[activeIndex].title = title;
            state.image = icon;
          } else {
            state.entries.push({ url, title, image: icon });
          }

          SessionStore.setTabState(selectedTab, state);
        }

        gBrowser.discardBrowser(selectedTab);

        event.stopPropagation();
        event.preventDefault();
      }
    }
  }

  insertItemsIntoTabContextMenu() {
    const elements = window.MozXULElement.parseXULToFragment(`
            <menuitem id="context_zen-replace-pinned-url-with-current"
                      data-lazy-l10n-id="tab-context-zen-replace-pinned-url-with-current"
                      hidden="true"
                      oncommand="gZenPinnedTabManager.replacePinnedUrlWithCurrent();"/>
            <menuitem id="context_zen-reset-pinned-tab"
                      data-lazy-l10n-id="tab-context-zen-reset-pinned-tab"
                      hidden="true"
                      oncommand="gZenPinnedTabManager.resetPinnedTab();"/>
        `);
    document.getElementById('tabContextMenu').appendChild(elements);
  }
}

window.gZenPinnedTabManager = new ZenPinnedTabManager();
