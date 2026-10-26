# HOLY HORNET — Full Static Website

Pages:
- index.html — Home
- fleet.html — Fleet (28 aircraft with full specifications)
- solutions.html — Solutions
- industries.html — Industries
- technology.html — Technology
- education.html — Education
- about.html — About
- contact.html — Contact (form sends through Formspree)

Shared files:
- styles.css — colours, layout and components for every page (dark mode by default, light/dark switch)
- script.js — menu, theme switch, status clock, fleet filters, course search, contact form

Assets:
- assets/fleet/ — transparent aircraft photos (WebP)
- assets/hero-uav.jpg — homepage photo
- assets/og-image.jpg — image shown when a page is shared on social media or in chat apps
- assets/logo-mark-full.png — master Holy Hornet logo mark, transparent, full resolution
- assets/logo-mark.png — header/footer size of the mark
- assets/logo.png — full logo with "HOLY HORNET / UAV SYSTEMS" text, for dark backgrounds
- assets/logo-light-bg.png — full logo with dark text, for white or light backgrounds
- favicon.ico, favicon-32.png, apple-touch-icon.png, icon-192.png, icon-512.png, site.webmanifest — browser and phone icons

Search and AI (SEO / GEO):
- Every page has a title, description, canonical link, social share tags and schema.org structured data
  (organisation, FAQ, fleet products, services, courses, breadcrumbs).
- robots.txt — allows search engines and AI assistants; keeps the design/ drafts out.
- sitemap.xml — list of all pages for search engines.
- llms.txt — plain-text summary of the company, fleet and courses for AI assistants.
- All of these assume the site lives at https://holyhornet.com. If the address is different, it has to be
  changed in the page heads, robots.txt, sitemap.xml and llms.txt.

Open `index.html` directly, or run:
python3 -m http.server 8000

After the site is live:
- Add the site to Google Search Console and Bing Webmaster Tools and submit https://holyhornet.com/sitemap.xml.
- Check the structured data with Google's Rich Results Test (search.google.com/test/rich-results).

Important before production:
- Verify the aircraft specifications and that the catalogue photos may be used.
- Add privacy/cookie/legal pages appropriate to the operating jurisdiction.
- Verify all claims, certifications, regulatory permissions and capabilities.
