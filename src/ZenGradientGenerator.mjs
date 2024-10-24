
{
  class ZenThemePicker extends ZenDOMOperatedFeature {
    init() {
      ChromeUtils.defineLazyGetter(this, 'panel', () => document.getElementById('PanelUI-zen-gradient-generator'));
      ChromeUtils.defineLazyGetter(this, 'toolbox', () => document.getElementById('navigator-toolbox'));

      this.initContextMenu();
      this.initThemePicker();
    }

    initContextMenu() {
      const menu = window.MozXULElement.parseXULToFragment(`
        <menuitem id="zenToolbarThemePicker"
                  data-lazy-l10n-id="zen-workspaces-change-gradient"
                  oncommand="gZenThemePicker.openThemePicker(event);"/>
      `);
      document.getElementById('toolbar-context-customize').before(menu);
    }

    openThemePicker(event) {
      PanelMultiView.openPopup(this.panel, this.toolbox, {
        position: 'topright topleft',
        triggerEvent: event,
      });
    }

    initThemePicker() {
      const themePicker = this.panel.querySelector('.zen-theme-picker-gradient');
      themePicker.addEventListener('mousemove', this.onDotMouseMove.bind(this));
      themePicker.addEventListener('mouseup', this.onDotMouseUp.bind(this));
    }

    calculateInitialPosition(color) {
      const [r, g, b] = color;
      // get the x and y position of the color
      const x = r / 255;
      const y = g / 255;
      return { x, y };
    }

    getColorFromPosition(x, y) {
      // get the color from the x and y position
      const r = x * 255;
      const g = y * 255;
      const b = 0;
      return [r, g, b];
    }

    createDot(color) {
      const [r, g, b] = color;
      const dot = document.createElement('div');
      dot.classList.add('zen-theme-picker-dot');
      dot.style.setProperty('--zen-theme-picker-dot-color', `rgb(${r}, ${g}, ${b})`);
      const { x, y } = this.calculateInitialPosition(color);
      dot.style.left = `${x * 100}%`;
      dot.style.top = `${y * 100}%`;
      dot.addEventListener('mousedown', this.onDotMouseDown.bind(this));
      this.panel.querySelector('.zen-theme-picker-gradient').appendChild(dot);
    }

    onDotMouseDown(event) {
      event.preventDefault();
      if (event.button === 2) {
        this.draggedDot.remove();
        return;
      }
      this.dragging = true;
      this.draggedDot = event.target;
      this.draggedDot.style.zIndex = 1;
      this.draggedDot.classList.add('dragging');
    }

    onDotMouseMove(event) {
      if (this.dragging) {
        event.preventDefault();
        const rect = this.panel.getBoundingClientRect();
        let x = (event.clientX - rect.left) / rect.width;
        let y = (event.clientY - rect.top) / rect.height;
        // percentage to pixel
        const dotSize = 16;
        const maxX = rect.width - dotSize;
        const maxY = rect.height - dotSize;
        if (x < 0) {
          x = 0;
        } else if (x > 1) {
          x = 1;
        }
        if (y < 0) {
          y = 0;
        } else if (y > 1) {
          y = 1;
        }
        const pixelX = x * rect.width - dotSize*2;
        const pixelY = y * rect.height - dotSize*2;
        this.draggedDot.style.left = `${Math.min(maxX, Math.max(0, pixelX))}px`;
        this.draggedDot.style.top = `${Math.min(maxY, Math.max(0, pixelY))}px`;
        const color = this.getColorFromPosition(x, y);
        this.draggedDot.style.setProperty('--zen-theme-picker-dot-color', `rgb(${color[0]}, ${color[1]}, ${color[2]})`);
      }
    }

    onDotMouseUp(event) {
      if (this.dragging) {
        event.preventDefault();
        this.dragging = false;
        this.draggedDot.style.zIndex = 0;
        this.draggedDot.classList.remove('dragging');
        this.draggedDot = null;
        return;
      }
      this.createDot([Math.random() * 255, Math.random() * 255, Math.random() * 255]);
    }
  }

  window.gZenThemePicker = new ZenThemePicker();
}
