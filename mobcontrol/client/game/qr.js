// Drawing the pairing QR code.
//
// The contract is one method:  render(element, text, size) -> Promise<void>
//
// The default fetches a library from a CDN, which is convenient and also the
// only outbound dependency in the whole module. A project that cannot reach a
// CDN, or wants its code styled differently, supplies its own renderer to
// PhoneController instead of patching this one.

const CDN = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';

export class CdnQrRenderer {
  #loading = null;

  constructor({ src = CDN, dark = '#0b1020', light = '#ffffff' } = {}) {
    this.src = src;
    this.dark = dark;
    this.light = light;
  }

  async render(element, text, size = 220) {
    await this.#load();
    element.innerHTML = '';
    new window.QRCode(element, {
      text, width: size, height: size,
      colorDark: this.dark, colorLight: this.light
    });
  }

  #load() {
    if (window.QRCode) return Promise.resolve();
    this.#loading ??= new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = this.src;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`could not load a QR library from ${this.src}`));
      document.head.appendChild(script);
    });
    return this.#loading;
  }
}

/** Fallback when no QR can be drawn: the URL is still readable and typable. */
export class TextQrRenderer {
  async render(element, text) {
    element.textContent = text;
  }
}
