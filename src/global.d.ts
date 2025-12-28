/** Global type declarations */
import type { App } from "obsidian";
import type { JSX as ReactJSX } from "react";

declare global {
  /** Obsidian app instance - available globally in plugin context */
  const app: App;

  namespace JSX {
    interface Element extends ReactJSX.Element {}
    interface IntrinsicElements extends ReactJSX.IntrinsicElements {}
  }
}
