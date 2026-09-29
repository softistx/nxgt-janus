---
'@nxgt/janus-hono': patch
---

Docs: the routes guide's sign-in link page is sent with `Referrer-Policy: strict-origin` instead of `no-referrer`. With `no-referrer` the browser posts the page's form with `Origin: null`, so `csrf({ origin })` answered 403 wherever it fell back to the `Origin` (no `Sec-Fetch-Site` on plain HTTP off `localhost`, or an older browser). `strict-origin` still keeps the token out of any `Referer` — only the origin is sent. The troubleshooting entry for that `403` points to it.
