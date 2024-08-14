
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

  addIntallButtons() {
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

  installTheme(event) {
    const button = event.target;
    const themeId = button.getAttribute("zen-theme-id");
    console.info("Installing theme with id: ", themeId);
  }
};
