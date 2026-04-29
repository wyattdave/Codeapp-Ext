---
name: start
aliases: start-codeapp
description: Start skill for new Code App project setup. Use this skill when starting a fresh app build or UI build so the agent confirms theme direction, offers mockups, and only then implements files.
---

# Start: New Code App Project Setup

This skill applies only when the project is a Code App and new (the decision log has no prior decisions). It ensures the agent gathers style and colour preferences and offers mockup creation before building.

## folder setup
The current folder should have a power-config.json file and a dist folder. If it does not the run the cap newApp command with a given name or one created by you.

## Style and Colour Direction

Before building any creative UI (website, app, dashboard, landing page, etc.):

1. Check if the user's message already includes colour, theme, or style direction.
2. If style direction is **not** provided, ask: _"What colours or overall theme do you want for this site or app? If you do not want to choose, tell me to proceed and I will decide the visual direction myself."_.
When interactive user input is available, ask through the interactive question flow and continue in the same session after the user answers.
Only stop and wait for a later run when interactive user input is not available.
3. If the user says to decide yourself, choose a bold and distinctive visual direction. Do **not** ask again.
4. Record the chosen style and colour direction in `agent/decision-log.md` under **Custom Requirements**.
5. Use the frontend-design skill when creating the UI, including for any mockups.

**Important:** The agent must have colour and style direction before building. Never start building a creative UI without it — either the user provides it or you decide it.

## Mockup Offer

After style direction is established (or if the user's prompt already includes it):

0. If a TODO checklist exists in `agent/decision-log.md`, ensure it includes these setup steps explicitly before any build tasks: theme/colour confirmation, mockup offer, optional mockup creation, then implementation.
1. Check if mockup files already exist in the `agent/` folder. If they do, skip this step.
2. If no mockups exist, ask: _"Do you want me to create 5 creative and unique mockups in agent/ for you to pick from? Reply yes or no."_.
When interactive user input is available, ask through the interactive question flow and continue in the same session after the user answers.
Only stop and wait for a later run when interactive user input is not available.
3. If the user says yes, create 5 **CREATIVE** and **DISTINCT** HTML mockup options in `agent/`, using the frontend-design skill, then stop so the user can pick one. Name them clearly, for example `agent/mockup-1.html` through `agent/mockup-5.html`.
Each mockup must be a self-contained, one-page HTML file that opens directly in a browser, shows the visual design, and includes lightweight interaction such as search filtering, panel toggles, or compose drawer open/close behavior. It is a visual prototype only, not a fully functional app.
Create the files sequentially as you work: fully write `agent/mockup-1.html` before starting `agent/mockup-2.html`, and continue one mockup at a time instead of batching all file writes at the end.
4. If the user says no or wants to skip, proceed directly to building in the same session.
5. Never say a mockup is ready unless the corresponding files have actually been created in `agent/`.

## Interactive Sessions

- If the runtime says interactive user input is available, do not end the turn after a required clarification if the answer you need can be gathered through the interactive question flow.
- After the user answers the required setup questions, continue with planning and implementation immediately.
- Do not ask optional open-ended follow-up questions such as "let me know if you have more preferences" before producing the first concrete implementation unless the task is still blocked.
- If the user asks how to view a mockup, point them to the actual generated files in `agent/`. Do not ask them to choose a framework when the project structure already dictates the implementation stack.

## When to Skip

- If the user's prompt already contains style guidance **and** they explicitly decline mockups, proceed directly to building.
- If the user's request is not a creative build (e.g. bug fix, add feature, deploy, refactor), skip this skill entirely.
- If mockups already exist in the `agent/` folder, skip the mockup offer.