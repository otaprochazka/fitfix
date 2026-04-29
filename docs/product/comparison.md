> **Status:** reference — short, public-facing comparison  
> **Audience:** anyone deciding between FitFix and other tools  
> **TL;DR:** what FitFix covers vs. competitors, plus an honest list of "if you need X, go elsewhere."

# Tool comparison

This used to live on the homepage. Moved here to keep the landing page
focused on the upload + editor flow.

## How FitFix compares

We're not trying to be GoldenCheetah. We're not trying to be Strava.
Here's what we cover and what we send people elsewhere for.

| Tool             | License | Local-only?       | Merge                   | Trim       | Loop / GPS-glitch detection | Elevation fix | Privacy zones | Multi-format I/O | UX in 3 words            |
| ---------------- | ------- | ----------------- | ----------------------- | ---------- | --------------------------- | ------------- | ------------- | ---------------- | ------------------------ |
| **FitFix**       | MIT     | yes (browser)     | yes                     | yes        | yes                         | yes           | yes           | FIT/GPX/TCX      | advisor-led, simple      |
| fitfiletools.com | closed  | no (cloud upload) | yes                     | yes        | no                          | no            | no            | partial          | tile per tool            |
| GOTOES           | closed  | no (cloud upload) | yes (de-facto standard) | partial    | no                          | no            | no            | yes              | 2010-era utility         |
| GoldenCheetah    | GPL     | yes (desktop)     | yes                     | yes        | no                          | yes (manual)  | no            | partial          | power-user analytics     |
| Garmin Connect   | closed  | cloud             | no                      | yes        | no                          | no            | limited       | no               | vendor-locked            |
| Strava           | closed  | cloud             | no (sends you to GOTOES)| crop only  | no                          | no            | limited       | no               | social, polished, limited|
| fitfileviewer.com| closed  | yes (browser)     | no                      | yes        | no                          | no            | no            | partial          | clean but narrow         |

## It's not us, go here

- **Want full training analytics (FTP, TSS, power curves, PMC)?**
  Use [GoldenCheetah](https://www.goldencheetah.org/) — open-source desktop,
  the gold standard.
- **Need just one cloud-based merge and you don't mind uploading?**
  Use [GOTOES](https://gotoes.org/) — the long-standing utility Strava
  itself recommends.
- **Want a one-off cloud edit for an obscure FIT field?**
  Use [fitfiletools.com](https://www.fitfiletools.com/) — closed source,
  but covers the long tail.
