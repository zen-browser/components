
export class ZenThemeMarketplaceParent extends JSWindowActorParent {
  constructor() {
    super();
  }

  async receiveMessage(message) {
    switch (message.name) {
      case "ZenThemeMarketplace:InstallTheme": {
        console.info("ZenThemeMarketplaceParent: Updating themes");
        const theme = message.data.theme;
        const themes = await this.getThemes();
        themes[theme.id] = theme;
        this.updateThemes(themes);
        break;
      }
    }
  }

  async getThemes() {
    if (!this._themes) {
      if (!(await IOUtils.exists(this.themesDataFile))) {
        await IOUtils.writeJSON(this.themesDataFile, {});
      }
      this._themes = await IOUtils.readJSON(this.themesDataFile);
    }
    return this._themes;
  }

  updateThemes(themes) {
    this._themes = themes;
    IOUtils.writeJSON(this.themesDataFile, themes);
    this.checkForThemeChanges();
  }

  async downloadUrlToFile(url, path) {
    try {
      console.info("ZenThemeMarketplaceParent: Downloading file from ", url);
      const response = await fetch(url);
      const data = await response.text();
      // convert the data into a Uint8Array
      let buffer = new TextEncoder().encode(data);
      await IOUtils.write(path, buffer);
    } catch (e) {
      console.error("ZenThemeMarketplaceParent: Error downloading file", e);
    }
  }

  async downloadThemeFileContents(theme) {
    const themePath = PathUtils.join(this.themesRootPath, theme.id);
    await IOUtils.makeDirectory(themePath, { ignoreExisting: true });
    await this.downloadUrlToFile(theme.style, PathUtils.join(themePath, "chrome.css"));
    await this.downloadUrlToFile(theme.readme, PathUtils.join(themePath, "readme.md"));
  }

  get themesRootPath() {
    return PathUtils.join(
      PathUtils.profileDir,
      "chrome",
      "zen-themes"
    );
  }

  get themesDataFile() {
    return PathUtils.join(
      PathUtils.profileDir,
      "zen-themes.json"
    );
  }

  async installTheme(theme) {
    await this.downloadThemeFileContents(theme);
    this.sendAsyncMessage("ZenThemeMarketplace:ThemeInstalled", { theme });
  }

  async checkForThemeChanges() {
    const themes = await this.getThemes();
    const themeIds = Object.keys(themes);
    for (const themeId of themeIds) {
      const theme = themes[themeId];
      if (!theme) {
        continue;
      }
      const themePath = PathUtils.join(this.themesRootPath, themeId);
      if (!(await IOUtils.exists(themePath))) {
        console.info("ZenThemeMarketplaceParent: Installing theme ", themeId);
        this.installTheme(theme);
      }
    }
  }
};
