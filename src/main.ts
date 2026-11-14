import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/700.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "./ui/styles.css";
import { App } from "./ui/app";

const app = new App();
void app.boot();

// Exposed for automated playtests in development builds only.
if (import.meta.env.DEV) (window as unknown as { __orbyx: App }).__orbyx = app;
