
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
    }, 0);
  }

  async addIntallButtons() {
    
    const actionButton = this.contentWindow.document.getElementById("install-theme");
    const errorMessage = this.contentWindow.document.getElementById("install-theme-error");
    if (actionButton) {
      console.info("ZenThemeMarketplaceChild: Initiating theme marketplace");
    }

    errorMessage.classList.add("hidden");
    actionButton.classList.remove("hidden");
    actionButton.addEventListener("click", this.installTheme.bind(this));
  }

  addTheme(theme) {
    this.sendAsyncMessage("ZenThemeMarketplace:InstallTheme", { theme });
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