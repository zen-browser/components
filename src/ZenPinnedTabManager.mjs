{
  const lazy = {};

  class ZenPinnedTabsObserver {
    static ALL_EVENTS = ['TabPinned', 'TabUnpinned'];

    #listeners = [];

    constructor() {
      XPCOMUtils.defineLazyPreferenceGetter(lazy, 'zenPinnedTabRestorePinnedTabsToPinnedUrl', 'zen.pinned-tab-manager.restore-pinned-tabs-to-pinned-url', false);
      XPCOMUtils.defineLazyPreferenceGetter(lazy, 'zenPinnedTabCloseShortcutBehavior', 'zen.pinned-tab-manager.close-shortcut-behavior', 'switch');
    
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

  class ZenPinnedTabManager extends ZenPreloadedFeature {
    init() {
      this.observer = new ZenPinnedTabsObserver();
      this._initClosePinnedTabShortcut();
      this._insertItemsIntoTabContextMenu();
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

      if (!tab) {
        tab = TabContextMenu.contextTab;
      }

      if (!tab || !tab.pinned) {
        return;
      }

      this._resetTabToStoredState(tab);
    }

    replacePinnedUrlWithCurrent() {
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

    setPinnedTabState(tabData, tab) {
      tabData.zenPinnedUrl = tab.getAttribute("zen-pinned-url");
      tabData.zenPinnedTitle = tab.getAttribute("zen-pinned-title");
      tabData.zenPinnedIcon = tab.getAttribute("zen-pinned-icon");
    }

    updatePinnedTabForSessionRestore(tabData, tab) {
      if (tabData.zenPinnedUrl) {
        tab.setAttribute("zen-pinned-url", tabData.zenPinnedUrl);
      }

      if (tabData.zenPinnedTitle) {
        tab.setAttribute("zen-pinned-title", tabData.zenPinnedTitle);
      }

      if(tabData.zenPinnedIcon) {
        tab.setAttribute("zen-pinned-icon", tabData.zenPinnedIcon);
      }
    }

    _onCloseTabShortcut(event) {
      if (
          !event ||
          !(event.ctrlKey || event.metaKey || event.altKey) ||
          !gBrowser.selectedTab?.pinned
      ) {
        return;
      }

      const selectedTab = gBrowser.selectedTab;
      if (!selectedTab) return;

      const behavior = lazy.zenPinnedTabCloseShortcutBehavior;

      switch (behavior) {
        case 'close':
          gBrowser.removeTab(selectedTab, { animate: true });
          break;
        case 'reset-unload-switch':
        case 'unload-switch':
        case 'reset-switch':
        case 'switch':
          this._handleTabSwitch(selectedTab);
          if (behavior.includes('reset')) {
            this._resetTabToStoredState(selectedTab);
          }
          if (behavior.includes('unload')) {
            gBrowser.discardBrowser(selectedTab);
          }
          break;
        case 'reset':
          this._resetTabToStoredState(selectedTab);
          break;
        default:
          return;
      }

      event.stopPropagation();
      event.preventDefault();
    }

    _handleTabSwitch(selectedTab) {
      const findNextTab = (direction) =>
          gBrowser.tabContainer.findNextTab(selectedTab, {
            direction,
            filter: tab => !tab.hidden && !tab.pinned,
          });

      const nextTab = findNextTab(1) || findNextTab(-1);
      if (nextTab) {
        gBrowser.selectedTab = nextTab;
      }
    }

    _resetTabToStoredState(tab) {
      const url = tab.getAttribute("zen-pinned-url");
      const title = tab.getAttribute("zen-pinned-title");
      const icon = tab.getAttribute("zen-pinned-icon");

      if (url) {
        const tabState = SessionStore.getTabState(tab);
        const state = JSON.parse(tabState);

        state.entries = [{url, title}];
        state.image = icon;
        state.index = 0;

        SessionStore.setTabState(tab, state);
      }
    }

    _insertItemsIntoTabContextMenu() {
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

    resetPinnedTabData(tabData) {
      if (lazy.zenPinnedTabRestorePinnedTabsToPinnedUrl && tabData.pinned && tabData.zenPinnedUrl) {
        tabData.entries = [{url: tabData.zenPinnedUrl, title: tabData.zenPinnedTitle}];
        tabData.image = tabData.zenPinnedIcon;
        tabData.index = 0;
      }
    }

    updatePinnedTabContextMenu(contextTab) {
      const isVisible = contextTab.pinned && contextTab.getAttribute("zen-pinned-url") && !contextTab.multiselected;
      document.getElementById("context_zen-reset-pinned-tab").hidden = !isVisible;
      document.getElementById("context_zen-replace-pinned-url-with-current").hidden = !isVisible;
    }
  }

  window.gZenPinnedTabManager = new ZenPinnedTabManager();
}