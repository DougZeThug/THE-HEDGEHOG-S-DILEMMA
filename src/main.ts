import '@fontsource/caveat/400.css';
import '@fontsource/caveat/500.css';
import '@fontsource/caveat/600.css';
import '@fontsource/caveat/700.css';
import '@fontsource/reenie-beanie/400.css';
import '@fontsource/nothing-you-could-do/400.css';
import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/400-italic.css';
import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/600.css';
import './style.css';
import { App } from './App';
import { setEnter } from './ui/dom';

/** The room cannot be built here: #enter says so (the one owner of what it says is ui/dom.ts). */
const unsupported = (msg: string) => setEnter(msg, false);

const probe = document.createElement('canvas');
if (!probe.getContext('webgl2')) {
  unsupported('this room needs WebGL2, which this browser does not offer');
} else {
  App.boot().catch((e) => {
    console.error(e);
    unsupported('the room could not be built in this browser');
  });
}
