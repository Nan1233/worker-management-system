# Login V1 — actual redesign + security hygiene

The visible login screen was previously still using the older custom split-screen presentation.
This revision replaces that presentation with a distinct Poketto-style enterprise card layout:
- centered desktop workspace
- rounded split card
- stronger hierarchy
- compact status badge
- responsive mobile layout
- accessible 44px-class controls
- reduced-motion support

Authentication state, login API, remembered-account behavior, role selection, and management password flow are unchanged.

Security note: Chrome's "Dangerous" / "possible phishing" warning is a Safe Browsing reputation/security classification and cannot be removed by CSS. The backend already has Helmet/HSTS/Permissions-Policy; the correct next step is to verify the domain in Google Search Console, inspect Security Issues, clean any flagged content, and request review.
