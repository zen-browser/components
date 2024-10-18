{
  const lazy = {};

  class ZenPinnedTabsObserver {
    static ALL_EVENTS = ['TabPinned', 'TabUnpinned'];

    #listeners = [];

    constructor() {
      XPCOMUtils.defineLazyPreferenceGetter(lazy, 'zenPinnedTabRestorePinnedTabsToPinnedUrl', 'zen.pinned-tab-manager.restore-pinned-tabs-to-pinned-url', false);
      XPCOMUtils.defineLazyPreferenceGetter(lazy, 'zenPinnedTabCloseShortcutBehavior', 'zen.pinned-tab-manager.close-shortcut-behavior', 'switch');
      ChromeUtils.defineESModuleGetters(lazy, {E10SUtils: "resource://gre/modules/E10SUtils.sys.mjs"});
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
          tab._zenClickEventListener = this._onTabClick.bind(this, tab);
          tab.addEventListener("click", tab._zenClickEventListener);
          break;
        case "TabUnpinned":
          this._removePinnedAttributes(tab);
          if (tab._zenClickEventListener) {
            tab.removeEventListener("click", tab._zenClickEventListener);
            delete tab._zenClickEventListener;
          }
          break;
        default:
          console.warn('ZenPinnedTabManager: Unhandled tab event', action);
          break;
      }
    }

    _onTabClick(tab, e) {
      if (e.button === 1) {
        this._onCloseTabShortcut(e, tab);
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
      const browser = tab.linkedBrowser;
      const entry = {
        url: browser.currentURI.spec,
        title: tab.label || browser.contentTitle,
        triggeringPrincipal_base64: lazy.E10SUtils.SERIALIZED_SYSTEMPRINCIPAL
      };

      tab.setAttribute("zen-pinned-entry", JSON.stringify(entry));
      tab.setAttribute("zen-pinned-icon", browser.mIconURL);
    }

    _removePinnedAttributes(tab) {
      tab.removeAttribute("zen-pinned-entry");
      tab.removeAttribute("zen-pinned-icon");
    }

    _initClosePinnedTabShortcut() {
      let cmdClose = document.getElementById('cmd_close');

      if (cmdClose) {
        cmdClose.addEventListener('command', this._onCloseTabShortcut.bind(this));
      }
    }

    setPinnedTabState(tabData, tab) {
      tabData.zenPinnedEntry = tab.getAttribute("zen-pinned-entry");
      tabData.zenPinnedIcon = tab.getAttribute("zen-pinned-icon");
    }

    updatePinnedTabForSessionRestore(tabData, tab) {
      if (tabData.zenPinnedEntry) {
        tab.setAttribute("zen-pinned-entry", tabData.zenPinnedEntry);
      } else {
        tab.removeAttribute("zen-pinned-entry");
      }
      if (tabData.zenPinnedIcon) {
        tab.setAttribute("zen-pinned-icon", tabData.zenPinnedIcon);
      } else {
        tab.removeAttribute("zen-pinned-icon");
      }
    }

    _onCloseTabShortcut(event, selectedTab = gBrowser.selectedTab) {
      if (
          !selectedTab?.pinned
      ) {
        return;
      }

      event.stopPropagation();
      event.preventDefault();

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


    }

    _handleTabSwitch(selectedTab) {
      if(selectedTab !== gBrowser.selectedTab) {
        return;
      }
      const findNextTab = (direction) =>
          gBrowser.tabContainer.findNextTab(selectedTab, {
            direction,
            filter: tab => !tab.hidden && !tab.pinned,
          });

      let nextTab = findNextTab(1) || findNextTab(-1);

      if (!nextTab) {
        ZenWorkspaces._createNewTabForWorkspace({ uuid: ZenWorkspaces.activeWorkspace  });

        nextTab = findNextTab(1) || findNextTab(-1);
      }

      if (nextTab) {
        gBrowser.selectedTab = nextTab;
      }
    }

    _resetTabToStoredState(tab) {
      const entry = tab.getAttribute("zen-pinned-entry");
      const icon = tab.getAttribute("zen-pinned-icon");

      if (entry) {
        const tabState = SessionStore.getTabState(tab);
        const state = JSON.parse(tabState);

        state.entries = [JSON.parse(entry)];
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
      if (lazy.zenPinnedTabRestorePinnedTabsToPinnedUrl && tabData.pinned && tabData.zenPinnedEntry) {
        tabData.entries = [JSON.parse(tabData.zenPinnedEntry)];
        tabData.image = tabData.zenPinnedIcon;
        tabData.index = 0;
      }
    }

    updatePinnedTabContextMenu(contextTab) {
      const isVisible = contextTab.pinned  && !contextTab.multiselected;
      document.getElementById("context_zen-reset-pinned-tab").hidden = !isVisible || !contextTab.getAttribute("zen-pinned-entry");
      document.getElementById("context_zen-replace-pinned-url-with-current").hidden = !isVisible;
    }
  }

  window.gZenPinnedTabManager = new ZenPinnedTabManager();
}