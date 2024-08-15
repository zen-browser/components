
const kZenThemesPreference = "zen.themes.data"; 
export class ZenThemeMarketplaceChild extends JSWindowActorChild {
  constructor() {
    super();
  }

  handleEvent(event) {
    switch (event.type) {
      case "DOMContentLoaded":
        this.initiateThemeMarketplace();
        break;
      default:
    }
  }

  initiateThemeMarketplace() {
    this.contentWindow.setTimeout(() => {
      this.addIntallButtons();
    }, 1000);
  }

  async addIntallButtons() {
    const actionButtons = this.contentWindow.document.querySelectorAll(".install-theme");
    const errorMessages = this.contentWindow.document.querySelectorAll(".install-theme-error");
    if (actionButtons.length !== 0) {
      console.info("ZenThemeMarketplaceChild: Initiating theme marketplace");
    }

    for (let error of errorMessages) {
      error.remove();
    }

    for (let button of actionButtons) {
      button.classList.remove("hidden");
      button.addEventListener("click", this.installTheme.bind(this));
    }
  }

  get themes() {
    if (!this._themes) {
      this._themes = JSON.parse(Services.prefs.getStringPref(kZenThemesPreference, "{}"));
    }
    return this._themes;
  }

  set themes(themes) {
    this._themes = themes;
    this.sendAsyncMessage("ZenThemeMarketplace:UpdateThemes", { themes });
  }

  addTheme(theme) {
    this.themes[theme.id] = theme;
    this.themes = this.themes;
  }

  async getThemeInfo(themeId) {
    const url = `https://zen-browser.app/api/get-theme?id=${themeId}`;
    console.info("ZTM: Fetching theme info from: ", url);
    const data = await fetch(url, {
      mode: "no-cors",
    });

    if (data.ok) {
      try {
        const obj = await data.json();
        return obj;
      } catch (e) {
        console.error("ZTM: Error parsing theme info: ", e);
      }
    }
    return null; 
  }

  async installTheme(event) {
    const button = event.target;
    const themeId = button.getAttribute("zen-theme-id");
    console.info("ZTM: Installing theme with id: ", themeId);

    const theme = await this.getThemeInfo(themeId);
    if (!theme) {
      console.error("ZTM: Error fetching theme info");
      return;
    }
    this.addTheme(theme);
  }
};
