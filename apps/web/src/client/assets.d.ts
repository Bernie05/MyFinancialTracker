/** Bun bundles imported assets and stylesheets; an imported SVG resolves to its URL. */
declare module "*.svg" {
  const url: string;
  export default url;
}
declare module "*.css";
