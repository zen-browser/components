
{
  class ZenThemePicker {
    #containerNode;

    #color1;
    #color2;
    #color3;
    #color4;

    constructor(containerNode) {
      return;
      this.#containerNode = containerNode;
      this.init();
    }

    // Getters
    get zenColors() {
      return [
        '#aac7ff',
        '#74d7cb',
        '#a0d490',
        '#dec663',
        '#ffb787',
      ]
    }

    // Methods
    init() {
      const wrapper = this.generateWrapper();
      this.generateGradientPicker(wrapper);
      this.injectWrapper(wrapper);
    }

    injectWrapper(wrapper) {
      this.#containerNode.replaceChildren(wrapper);
    }

    generateWrapper() {
      const wrapper = document.createXULElement('hbox');
      wrapper.classList.add('zen-theme-picker');
      return wrapper;
    }

    generateGradientPicker(wrapper) {
      const gradientPicker = window.MozXULElement.parseXULToFragment(`
        <hbox class="zen-theme-picker-gradient">
          <hbox class="zen-theme-picker-gradient-container">
            <hbox style="top: 50%; left: 50%;" primary="true" class="zen-theme-picker-gradient-color zen-theme-picker-gradient-color-1"></hbox>
            <hbox style="top: 50%; left: 50%;" class="zen-theme-picker-gradient-color zen-theme-picker-gradient-color-2"></hbox>
            <hbox style="top: 50%; left: 50%;" class="zen-theme-picker-gradient-color zen-theme-picker-gradient-color-3"></hbox>
            <hbox style="top: 50%; left: 50%;" class="zen-theme-picker-gradient-color zen-theme-picker-gradient-color-4"></hbox>
          </hbox>
          <html:canvas class="zen-theme-picker-gradient-canvas" width="180" height="180"></html:canvas>
        </hbox>
      `);
      const canvas = gradientPicker.querySelector('.zen-theme-picker-gradient-canvas');
      const ctx = canvas.getContext('2d');

      // Canvas dimensions
      const width = canvas.width;
      const height = canvas.height;

      ctx.globalCompositeOperation = 'lighter';
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      for (let i = 0; i < this.zenColors.length; i++) {
        gradient.addColorStop(i / (this.zenColors.length - 1), this.zenColors[i]);
      }
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      // Event listeners, each color can be dragged
      const colors = gradientPicker.querySelectorAll('.zen-theme-picker-gradient-color');
      for (const color of colors) {
        this.addColorDragListener(color, ctx);
      }

      wrapper.appendChild(gradientPicker);
    }

    addColorDragListener(color, ctx) {
      const padding = 10;
      color.addEventListener('mousedown', (event) => {
        const colorIndex = Array.from(color.parentElement.children).indexOf(color);
        color.setAttribute('dragging', 'true');
        const onMouseMove = (event) => {
          const rect = color.parentElement.getBoundingClientRect();
          let x = event.clientX - rect.left;
          let y = event.clientY - rect.top;
          const width = rect.width;
          const height = rect.height;

          // If x is out of bounds, set it to the padding
          if (x < padding) {
            x = padding;
          }
          if (x > width - padding) {
            x = width - padding;
          }

          // If y is out of bounds, set it to the padding
          if (y < padding) {
            y = padding;
          }
          if (y > height - padding) {
            y = height - padding;
          }

          let xRatio = Math.min(1, Math.max(0, x / width));
          let yRatio = Math.min(1, Math.max(0, y / height));          

          // Get the color from the canvas
          const pixel = ctx.getImageData(x, y, 1, 1).data;
          const rgb = `rgb(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`;
          color.style.left = `${xRatio * 100}%`;
          color.style.top = `${yRatio * 100}%`;
          color.style.setProperty("--zen-chosen-color", rgb);
        }
        const onMouseUp = (event) => {
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
          color.removeAttribute('dragging');
        }
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      });
    }
  }

  window.ZenThemePicker = ZenThemePicker;
}
