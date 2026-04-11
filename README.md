# GitHub Stats (GitHub Pages + Actions)

This repo generates `stats.json` + `stats.svg` using the GitHub API (via GitHub Actions), then serves them on GitHub Pages.

GitHub README files **cannot run JavaScript** (and iframes/scripts are blocked), so the safe way to “embed” live stats in a `README.md` is an **image** (SVG).

## Setup

1. **Do not expose tokens in HTML/JS**
   - If you pasted a token anywhere (even briefly), **revoke it now** in GitHub → Settings → Developer settings → Personal access tokens.

2. Create a PAT (classic)
   - Scopes (minimum): `read:user` (optional: `public_repo`)

3. Add repo secret
   - Repo → Settings → Secrets and variables → Actions → **New repository secret**
   - Name: `GH_TOKEN`
   - Value: your PAT

4. (Optional) Set username if different from repo owner
   - Repo → Settings → Secrets and variables → Actions → **Variables**
   - Variable name: `GITHUB_USER`
   - Value: e.g. `charlespura`

5. Enable GitHub Pages
   - Repo → Settings → Pages
   - Source: **Deploy from a branch**
   - Branch: `main` / root

6. Run the workflow once
   - Actions → “Update GitHub stats (JSON + SVG)” → Run workflow

## Use in README.md

After Pages is enabled, embed the SVG:

```md
![GitHub Stats](https://<username>.github.io/<repo>/stats.svg)
```

And link the dashboard:

```md
[Live dashboard](https://<username>.github.io/<repo>/)
```

## Local preview

Open `index.html` in a browser (or serve the folder with any static server). The UI reads `stats.json`.
