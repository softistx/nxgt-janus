---
'@nxgt/janus': patch
---

Docs: the sign-in link guide sends the link's page with `Referrer-Policy: strict-origin` instead of `no-referrer`, and says why. Under `no-referrer` the browser posts the page's form with `Origin: null`, so the guide's own `confirmLink` route, which checks `Origin` alone, refused every sign-in behind that page — and a check that tries `Sec-Fetch-Site` first refused it wherever the browser sends none. With `strict-origin` a `Referer` holds the origin only, never the token. The README's sign-in link trap names the header, and troubleshooting has an entry for the `403` on the link's own button.
