# WoW Rotation Trainer

A browser-based World of Warcraft Windwalker Monk rotation trainer built to explore how far AI-assisted coding workflows can be pushed in a real project.

This repository exists first and foremost as an experiment in AI tooling. Its primary goal was to try building a playable, simulation-driven training experience by leaning heavily on coding agents rather than on traditional hand-written implementation.

## What it is

The project turns rotation practice into an interactive training loop instead of a static reference. It combines simulation-inspired decision making with a UI focused on quick feedback, timing pressure, and action sequencing.

At a high level, the trainer includes:
- a simulation-backed rotation engine for Windwalker Monk behavior
- action recommendations driven by an Action Priority List (APL)
- an interface designed for real-time practice rather than spreadsheet-style analysis
- a challenge mode inspired by rhythm games, where timing and execution matter as much as knowing the next button

## AI-assisted development

This project should be read in the context of AI experimentation.

Large parts of the codebase were produced with coding agents, including GPT-5.4, Codex, and Claude-family models. Manual coding and manual review were intentionally limited. In practice, the workflow relied mostly on agent-to-agent iteration, self-review, and repeated adversarial review passes to pressure-test behavior and implementation choices.

That does not mean the code was accepted blindly, but it does mean the project was intentionally used to evaluate what modern AI tools can do when given broad autonomy over architecture, implementation, and review.

## Main inspirations

### SimulationCraft / SimC

The behavior model takes heavy inspiration from SimulationCraft.

SimC was treated as the main gameplay reference for simulation behavior, and the project leans on an APL-driven approach for recommendations and rotation logic. The goal was not to clone SimC, but to adapt its style of modeling and decision priority into an interactive browser trainer.

### ElvUI

The visual presentation takes clear inspiration from ElvUI.

The UI aims for a clean, information-dense World of Warcraft addon feel, using that style as a reference point for layout, readability, and combat-facing presentation.

### Rhythm games

The challenge mode is inspired by rhythm games.

Rather than presenting the rotation only as a theoretical priority system, the trainer tries to make execution feel like a timing challenge, where maintaining flow, pace, and precision is part of the experience.

## Scope

This is a focused public snapshot of the app itself. It contains the code and assets needed to run and publish the trainer, without the broader private development environment or supporting internal materials.

## Running locally

Install dependencies and start the Vite dev server:

```bash
npm install
npm run dev
```

To verify the production build locally:

```bash
npm run build
npm run preview
```

## GitHub Pages

The repository includes a GitHub Actions workflow that builds the app and deploys the generated Vite site to GitHub Pages.

Only the generated `dist/` site artifact is published. Repository metadata, GitHub workflow files, local environment files, and source maps are not uploaded as part of the Pages deployment.

To enable it:

1. Push the repository to GitHub.
2. In GitHub, open `Settings -> Pages`.
3. Set `Source` to `GitHub Actions`.
4. Push to `main` or run the workflow manually.

The Vite base path is resolved automatically during GitHub Actions builds, so the app works both locally and when served from a repository Pages URL.

## Acknowledgements

- SimulationCraft, for the simulation philosophy and APL-centered modeling approach
- ElvUI, for visual inspiration
- The broader AI coding ecosystem, for making this experiment possible
- Gemini was used for music generation

## License

This project is licensed under the GNU General Public License v3.0 or later. See `LICENSE` for the full text.
