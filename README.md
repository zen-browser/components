# components
Some components used by @zen-browser and @Floorp-Projects as an attempt to make firefox forks a better place

## Example usage

```js
import("chrome://../browser-splitView.mjs").then(
  ({ SplitViews }) => {
    window.gSplitView = new SplitViews({
      splitIndicator: "zen-splitted",
      browserName: "zen",
      defaultSplitView: "grid",
    });
  }
);
```