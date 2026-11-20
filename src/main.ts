import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { handleRedirectReturn, preloadAuth } from './lib/auth/google';
import { router } from './lib/router.svelte';
import { library } from './lib/store/library.svelte';
import { polyfillCountryFlagEmojis } from 'country-flag-emoji-polyfill';
import flagFontUrl from 'country-flag-emoji-polyfill/dist/TwemojiCountryFlags.woff2?url';

// Windows doesn't draw flag emoji; this adds a small flag-only font when needed (bundled, not from a CDN).
polyfillCountryFlagEmojis('Twemoji Country Flags', flagFontUrl);

// The OAuth redirect (iPhone Home Screen sign-in) comes back with the token in
// the URL hash; take it out before the router looks at the hash.
const redirect = handleRedirectReturn();
if (redirect.handled) router.sync();

preloadAuth();
library.start(redirect.error);

mount(App, { target: document.getElementById('app')! });
