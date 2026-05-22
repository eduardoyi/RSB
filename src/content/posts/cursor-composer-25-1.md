---
status: "draft"
title: "Cursor Composer 2.5 Is Worth Trying, With Some Caveats"
slug: "cursor-composer-25-1"
date: "2026-05-22"
description: ""
featured_image: "https://pub-645d6d0081d7424baba0ca52ae362e9d.r2.dev/images/1caf9769-46dc-4c75-b5cc-14fefa0fb60e/22d156ad-f4bf-4c15-85ff-92803fcd935e/final-1779460238370.webp"
---
## A new model under the hood

[Cursor released Composer 2.5 on May 18, 2026](https://cursor.com/changelog/composer-2-5). If you've been using Composer 2, the update shows up as the same familiar agent interface — same chat pane, same keyboard shortcuts. What changed is what's running underneath it.

Composer 2.5 is built on [Moonshot AI's Kimi K2.5](https://cursor.com/blog/composer-2-5) base model, which Cursor then trained heavily for agentic coding tasks. The base model itself is a Mixture-of-Experts architecture: roughly 1 trillion total parameters, but only about 32 billion are active on any given request. Think of it like a large committee where only the relevant specialists weigh in, rather than everyone talking at once. That structure is what makes a model this large practical to run at reasonable speed and cost.

![Only a small fraction of Composer 2.](https://pub-645d6d0081d7424baba0ca52ae362e9d.r2.dev/images/1caf9769-46dc-4c75-b5cc-14fefa0fb60e/93d0bf26-44f1-4b10-9091-7de36f35ab13/final-1779460137735.webp "Only a small fraction of Composer 2.")

Cursor reports that Composer 2.5 was trained on [25 times more synthetic tasks](https://lushbinary.com/blog/cursor-composer-2-5-developer-guide-benchmarks-pricing/) than Composer 2, with roughly 85% of the compute budget going toward post-training rather than the base model. Two infrastructure techniques, Sharded Muon and dual-mesh HSDP, are the engineering choices that made training a model this size feasible without the step times ballooning into something impractical. Neither technique is visible in the IDE; they're training-time details that Cursor published to explain why the model performs the way it does at the price points it does.

Worth flagging early: the Kimi K2.5 base model wasn't prominently disclosed at launch, which became a real point of friction in the community. That's covered in its own section below.

## The official pitch: longer tasks, smarter steps

According to [Cursor's blog](https://cursor.com/blog/composer-2-5), the core improvement in Composer 2.5 is reliability on tasks that don't wrap up in a single exchange. Reading files, running terminal commands, editing across multiple files, running tests, and looping until something actually works — Cursor says the model handles that kind of sustained work better than Composer 2 did.

The training approach behind this is what Cursor calls "targeted reinforcement learning with textual feedback." Rather than only rewarding the end result, the training process gives step-level feedback during a session: if the model makes a bad tool call or stops working prematurely, that specific behavior gets flagged during training. The goal is better trajectory control across a long run, not just better individual responses.

![diagram](https://pub-645d6d0081d7424baba0ca52ae362e9d.r2.dev/images/1caf9769-46dc-4c75-b5cc-14fefa0fb60e/d7d45629-f601-4a23-9e96-008a75201a4f/final-1779460075676.webp)

Cursor also claims the model follows complex, tool-heavy instructions more reliably, including sessions that involve file editing, terminal access, search, and MCP integrations running together.

On the pricing side, the [standard tier is listed at $0.50 per million input tokens and $2.50 per million output tokens](https://lushbinary.com/blog/cursor-composer-2-5-developer-guide-benchmarks-pricing/), with a Fast variant available at a higher rate. To mark the launch, Cursor ran a [one-day promotion](https://forum.cursor.com/t/10x-usage-on-composer-2-5-today-only/161039) on May 18 where Composer 2.5 requests were charged at one-tenth of normal usage, followed by half-rate pricing for the rest of that week.

## So how does it actually score against real competition?

Three benchmarks show up most often in coverage of Composer 2.5, and they each test something different.

Terminal-Bench 2.0 is the most relevant one for agentic work. It puts a model through multi-step shell tasks: run commands, read the output, decide what to do next, edit files, repeat. It is the closest any of these benchmarks gets to simulating what Composer actually does when you hand it a long task and walk away. Composer 2 scored 61.7% here. Composer 2.5 [scores 69.3%](https://lushbinary.com/blog/cursor-composer-2-5-developer-guide-benchmarks-pricing/), which puts it roughly level with Claude Opus 4.7 (reported at ~69.4%). GPT-5.5 scores ~82.7% on the same test, so there is still a real gap at the top.

SWE-Bench Multilingual tests how well a model can fix real GitHub issues across nine programming languages. Composer 2.5 [scores 79.8%](https://arxiv.org/html/2603.24477v2), up from 73.7% for Composer 2. Claude Opus 4.7 comes in at ~80.5% and GPT-5.5 at ~77.8%, putting Composer 2.5 solidly in the same tier.

![Composer 2.](https://pub-645d6d0081d7424baba0ca52ae362e9d.r2.dev/images/1caf9769-46dc-4c75-b5cc-14fefa0fb60e/a44da48e-f186-4daf-9534-9781218a5571/final-1779462427427.webp "Composer 2.")

CursorBench v3.1 is Cursor's own internal benchmark, so treat it with appropriate skepticism. Composer 2.5 scores 63.2% against Composer 2's 52.2%, with Claude Opus 4.7 at ~64.8% and GPT-5.5 at ~59.2%. [Gigazine's coverage](https://gigazine.net/gsc_news/en/20260519-cursor-composer-2-5/) and [LushBinary's breakdown](https://lushbinary.com/blog/cursor-composer-2-5-developer-guide-benchmarks-pricing/) both read this as Composer 2.5 sitting in roughly the same performance band as those frontier models, often at a lower cost per task.

The honest caveat is that benchmark conditions vary across reviewers. Model settings, cost assumptions, and test seeds are not standardized, so the exact numbers should be treated as directional rather than definitive. What they do suggest consistently is that Composer 2.5 is a clear step up from Composer 2, and competitive with the top options, but not obviously ahead of them.

## What Composer 2.5 actually costs you

[Pricing details are on the official blog](https://cursor.com/blog/composer-2-5). Standard tier runs $0.50 per 1M input tokens and $2.50 per 1M output tokens, unchanged from Composer 2. Fast tier is $3.00 input and $15.00 output, roughly 6x more expensive and about double what Composer 2 Fast cost ($1.50/$7.50). There are no per-request fees; you pay only for tokens consumed.

For a typical agentic session generating around 10K output tokens, Standard costs roughly $0.025 and Fast costs around $0.15. Whether that gap matters depends entirely on how many sessions you run daily.

At launch, Cursor offered a [one-day 10x promotion](https://forum.cursor.com/t/10x-usage-on-composer-2-5-today-only/161039) where usage counted at 0.1x against your pool, followed by a week of 2x usage. Both have since ended.

The Fast tier price increase has drawn complaints from the community. Those reactions, along with the broader reception, are covered in the community impressions section below.

## What Cursor didn't say about Kimi

The pricing complaints landed on top of a messier problem. When Cursor launched Composer 2 on March 20, 2026, the [launch blog](https://cursor.com/blog/composer-2) positioned it as Cursor's own frontier model. There was no mention of Moonshot AI or Kimi K2.5. Developers found out through a different route: a developer named Fynn inspected Cursor's API traffic and spotted a model identifier reading `kimi-k2p5-rl-0317-s515-fast`, which [spread quickly through Hacker News](https://news.ycombinator.com/item?id=47452404) and a wave of social posts.

![A developer inspecting Cursor's API traffic found this model identifier buried in a raw network response, surfacing the Kimi K2.](https://pub-645d6d0081d7424baba0ca52ae362e9d.r2.dev/images/1caf9769-46dc-4c75-b5cc-14fefa0fb60e/a4ce037f-b660-4939-b5a6-f949ff5a8a0b/final-1779460259165.webp "A developer inspecting Cursor's API traffic found this model identifier buried in a raw network response, surfacing the Kimi K2.")

Cursor co-founder Aman Sanger and VP Lee Robinson later [acknowledged the omission to Business Insider](https://www.businessinsider.com/cursor-composer-chinese-model-kimi-moonshot-ai-coding-low-cost-2026-3), calling it "a miss." Sanger noted that roughly one quarter of the compute on the final model came from the Kimi base, with Cursor's reinforcement learning work accounting for the rest. Moonshot AI confirmed the arrangement was an authorized commercial partnership via Fireworks AI.

The [Cursor community forum thread on Kimi](https://forum.cursor.com/t/kimi-k2-5-in-cursor/150071?page=3) shows the objections were mostly about disclosure, not quality. Few people disputed that the fine-tuned model performed well. The concern was that teams making procurement and compliance decisions need to know what they're actually running, and "Cursor's model" tells them nothing useful.

Composer 2.5 names Kimi K2.5 [in the official blog](https://cursor.com/blog/composer-2-5) from the start.

## Speed is real. So are the bugs.

The clearest consensus in the [Cursor community forum](https://forum.cursor.com/t/share-your-thoughts-on-composer-2-5/160935?page=2) is that Composer 2.5 is noticeably faster than its predecessor. Response starts are quicker, and the latency reduction shows up consistently enough across reviewers that it's not just placebo. One hands-on test found Composer 2.5 [made zero errors across five automated coding tasks](https://www.youtube.com/watch?v=f7PGu8u-pvU), while Composer 2 failed multiple times on the same set. A separate doc-reading test, specifically avoiding N+1 query patterns by parsing reference documentation, saw Composer 2 fail all five attempts and Composer 2.5 pass cleanly. Cost signals are encouraging too: one practitioner reported that 15 prompts on the Fast tier consumed roughly 1.1% of a $20 subscription, which works out to around $0.20 per session.

The critical feedback is less dramatic but harder to dismiss. The [forum thread on Composer 2 experience](https://forum.cursor.com/t/share-your-experience-with-composer-2/155289) documents a repeating-motion bug where Composer gets stuck cycling through the same action without converging, rendering Cursor effectively unusable until a restart. Cursor staff asked for reproduction details, which means a fix was not yet in hand when reports surfaced. More seriously, at least one user reported the agent ran `git checkout HEAD --` without explicit approval, overwriting uncommitted work. Cursor classifies that category of failure as high severity and recommends additional guardrails, which is a reasonable response, though "add your own guardrails" is cold comfort after a destructive operation.

![photo](https://pub-645d6d0081d7424baba0ca52ae362e9d.r2.dev/images/1caf9769-46dc-4c75-b5cc-14fefa0fb60e/f33c7dee-25aa-4b80-93d3-f00fd6e97297/final-1779460171492.webp)

The forum tone toward 2.5 is generally warmer than it was toward Composer 2 at launch, but effort calibration remains inconsistent. Some tasks get over-engineered; others get shortcuts that require follow-up prompts. Most positive feedback focuses on model behavior rather than specific UI changes, which tracks with how sparse the UI-specific praise actually is in public posts.

## Who should actually make the switch

If you run long agentic sessions, refactor across many files, or care about cost per session, Composer 2.5 is [worth trying as your default](https://lushbinary.com/blog/cursor-composer-2-5-developer-guide-benchmarks-pricing/). The benchmark gains are real, the pricing is materially lower than frontier alternatives, and the community reception is warmer than Composer 2 got at launch.

If your work is mostly quick edits, single-file completions, or high-stakes architecture decisions, the case is weaker. Composer 2.5 still trails GPT-5.5 on terminal-heavy automation, and reviewers continue to recommend Opus 4.7 or GPT-5.5 for complex reasoning tasks.

Two things remain genuinely unresolved: the Kimi base model disclosure signals that Cursor's transparency around model provenance needs work, and adaptive reasoning is still inconsistent enough that production-critical teams should run 2.5 in parallel with their current setup before committing fully.
