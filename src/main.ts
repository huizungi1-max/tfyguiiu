import '@fontsource-variable/archivo/wdth.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './styles/base.css';
import './styles/stage.css';
import './styles/chrome.css';
import './styles/sections.css';
import './styles/world.css';
import './styles/portrait.css';

import { App } from './app';

// Upright screens get the re-stacked layout; same test the 3D compositions use.
const setPortrait = () => document.documentElement.classList.toggle('portrait', innerHeight > innerWidth * 1.08);
setPortrait();
addEventListener('resize', setPortrait);

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Without WebGL the page is the plain document — the same one shown without JavaScript. */
function fallBack() {
  const root = document.documentElement;
  root.classList.remove('js', 'portrait', 'intro');
  root.classList.add('no-webgl', 'is-loaded');
  removeEventListener('resize', setPortrait);
}

if (!webglAvailable()) {
  fallBack();
} else {
  const app = new App();
  app.init().catch((err) => {
    console.error(err);
    fallBack();
  });
  (window as unknown as { __app: App }).__app = app;
}
