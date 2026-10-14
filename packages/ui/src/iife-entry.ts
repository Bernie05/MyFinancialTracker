/**
 * Browser-global entry, used only by the IIFE build (`dist/iife/mft-ui.js`).
 * Exposes the library as `window.MFT` for design-system previews and plain
 * <script> pages. Apps import from "@mft/ui" instead.
 */
import * as MFT from "./index";

declare global {
  interface Window {
    MFT: typeof MFT;
  }
}

window.MFT = MFT;
