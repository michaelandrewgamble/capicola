// Ambient types for CSS imported as an inline string (Vite/tsup `?inline` query).
// Used by the web-component adapter to adopt `capicola.css` into a shadow root.
declare module "*.css?inline" {
  const css: string
  export default css
}
