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

function unsupported(msg: string) {
  const b = document.getElementById('enter') as HTMLButtonElement | null;
  if (b) {
    b.textContent = msg;
    b.disabled = true;
  }
}

const probe = document.createElement('canvas');
if (!probe.getContext('webgl2')) {
  unsupported('this room needs WebGL2, which this browser does not offer');
} else {
  new App().boot().catch((e) => {
    console.error(e);
    unsupported('the room could not be built in this browser');
  });
}
