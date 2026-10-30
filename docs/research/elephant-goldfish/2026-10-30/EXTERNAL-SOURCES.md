# External evidence ledger

Retrieved **2026-10-30**. This ledger separates EGM-specific accounts from adjacent mechanism research. Search snippets are not full-paper inspection; a transcript excerpt is not a claim to have watched or listened. Quotes below are short retrieved passages; everything else is a bounded summary.

## Method and provenance

Two independent bounded Luna/medium researchers used the connected public Exa Search/Contents tools: #26373 searched official/author/practitioner/critical EGM material; #26427 searched related primary research and counterevidence. The coordinator inspected their actual tool history, followed decisive primary sources and authored the synthesis on the task-specific Astra/high model. Searches included fresh-context review, self-correction, multiagent debate failure, correlated errors, EGM critiques and talks/podcasts. Sources were deduplicated; repeated launch summaries were not treated as independent confirmations.

Useful retained execution locators: #26373/26460 (official/author pages), #26373/26459 (talk/video), #26427/26509 and #26427/26532 (related retrieval), #26153/26525–26527 (independent launch-post fetch), #26153/26816–26818 (CCR and Stephens Contents). The second worker called two failed requests “Contents” in its prose; actual #26427/26494 and /26495 were **Search** calls. We use tool records rather than that label.

Several calls returned “Public documentation read failed.” This is not sufficient evidence of rate limiting. There was no credential extraction, account/API-key workaround, paywall bypass or external support contact. Direct public retrieval of the author’s Medium essay returned HTTP403; it was not retried through a bypass. Public CCR HTML and Stephens PDF were subsequently downloaded successfully for method/limitation checks; the PDF was read with installed `pdftotext`, not executed.

## EGM-specific evidence

### E1 — Official launch

- **URL:** https://opensource.googleblog.com/2026/10/introducing-elephant-goldfish-model-plugin.html
- **Title:** Introducing the Elephant-Goldfish Model plugin: scaling design-driven AI software development.
- **Byline/date:** Brian Suchy and Dave Rensin, on behalf of the EGM team; **October 22, 2026**, verified from content, not guessed from URL.
- **Kind/access:** official announcement; primary text retrieved by worker and coordinator.
- **Excerpt:** “The ‘Elephant’ is a context-rich, long-horizon AI session”; “Goldfish are stateless, zero-context sessions used strictly to validate specifications.”
- **Establishes:** authors’ intended role split and their reported internal adoption.
- **Does not establish:** causal speed/quality gains, independent confirmation of adoption, or absence of shared blind spots. The actual pinned review skill has five stages; the article’s conceptual simplification is not the executable/prompt specification.

### E2 — Author’s experience

- **URL:** https://drensin.medium.com/elephants-goldfish-and-the-new-golden-age-of-software-engineering-c33641a48874
- **Title:** Elephants, Goldfish and the New Golden Age of Software Engineering.
- **Byline/date:** Dave Rensin; **April 27, 2026**, with **October 21, 2026** update in retrieved text.
- **Kind/access:** first-person essay; Exa retrieved the first 10,000 characters; direct full-page retrieval failed HTTP403.
- **Content inspected:** design-centered workflow and the author’s personal-perspective/skepticism caveats.
- **Establishes:** the author’s rationale and reported practice.
- **Limit:** a “30% highly valuable” anecdote appeared in worker/search evidence, but the complete passage was not independently verified here; no quantitative usefulness claim is based on it. Not a controlled study or independent replication.

### E3 — Practitioner video

- **URL:** https://www.youtube.com/watch?v=xxf6D9jynFw
- **Title/channel:** EGM: Google’s New Way To Use Claude Code Is Insane — **AI LABS**.
- **Publication date:** not verified.
- **Kind/access:** Exa transcript excerpt; no verified timestamps; not watched/listened in this research.
- **Excerpt:** opening says they “tried it on our own app with a new feature, and it caught a real bug that the usual review missed.”
- **Establishes:** a creator’s claimed hands-on catch.
- **Does not establish:** the bug’s reproducible evidence, baseline review method, false positives, total cost, or causal effectiveness. Do not repeat the promotional title as our judgment.

### E4 — Talk listing

- **URL:** https://www.meetup.com/acm-oc/events/316132346/
- **Title/speaker:** Gen AI: Design is the New Code — **Elise Ewing**, Orange County ACM Chapter.
- **Scheduled date:** **September 16, 2026**.
- **Kind/access:** event announcement, not a transcript or verified recording.
- **Content inspected:** speaker described as co-leading EGM; listing calls it “battle-tested.”
- **Establishes:** a scheduled event and attributed speaker role/theme.
- **Does not establish:** what was said in the talk, that the event occurred as described, or evidence for the marketing adjective.

The repository itself is a separate primary source, pinned and audited in the main report. Its FAQ explicitly acknowledges review/documentation cost, small-change exceptions, and that completing the workflow is not evidence of improved productivity.

## Related research — not EGM evaluations

### E5 — Self-Refine

- **URL:** https://arxiv.org/abs/2303.17651
- **Title/authors:** Self-Refine: Iterative Refinement with Self-Feedback — **Aman Madaan et al.**
- **Date:** submitted **March 30, 2023**; retrieved page lists revision **May 25, 2023**.
- **Kind/access:** research paper; abstract inspected, not full methods/tables in this pass.
- **Excerpt:** “Across all evaluated tasks, outputs generated with Self-Refine are preferred … over those generated with … one-step generation.”
- **Supports:** feedback-and-revision can help selected generation tasks under the paper’s procedure.
- **Limit:** not a fresh-spec-review experiment; same-model refinement is not proof of independent defect finding. No numerical gains are transferred to EGM.

### E6 — Limits of intrinsic self-correction

- **URL:** https://arxiv.org/abs/2310.01798
- **Title/authors:** Large Language Models Cannot Self-Correct Reasoning Yet — **Jie Huang, Xinyun Chen, Swaroop Mishra, Huaixiu Steven Zheng, Adams Wei Yu, Xinying Song, Denny Zhou**.
- **Date:** submitted **October 3, 2023**; revision **March 14, 2024**; ICLR2024.
- **Kind/access:** research paper; abstract inspected.
- **Excerpt:** for intrinsic self-correction without external feedback, models “struggle to self-correct … and at times, their performance even degrades.”
- **Supports:** repetition alone should not be presumed corrective.
- **Limit:** does not demonstrate that independent review succeeds; reasoning-task results are not specification-review results.

### E7 — Long-context positioning

- **URL:** https://arxiv.org/abs/2307.03172
- **Title/authors:** Lost in the Middle: How Language Models Use Long Contexts — **Nelson F. Liu et al.**
- **Date:** submitted **July 6, 2023**; revision **November 20, 2023** on inspected page.
- **Kind/access:** research paper; abstract inspected.
- **Excerpt:** performance “can degrade significantly” when relevant information is in the middle of long contexts.
- **Supports:** context length/position can affect retrieval use; careful packet design is reasonable.
- **Limit:** multi-document QA/key-value retrieval, not EGM; no universal context-size threshold or freshness superiority follows.

### E8 — Multiagent debate can help

- **URL:** https://proceedings.mlr.press/v235/du24e.html
- **Title/authors:** Improving Factuality and Reasoning in Language Models through Multiagent Debate — **Yilun Du, Shuang Li, Antonio Torralba, Joshua B. Tenenbaum, Igor Mordatch**.
- **Date/venue:** **2024**, ICML, PMLR235:11733–11763.
- **Kind/access:** conference primary page/abstract.
- **Content inspected:** multiple model instances propose/debate over rounds; improvements reported for studied reasoning and factual tasks.
- **Supports:** structured multiagent interaction can improve specific tasks.
- **Limit:** independent parallel review is not the same as agents seeing and debating each other’s reasoning; not universal benefit from added agents/rounds.

### E9 — Debate failure and conformity

- **URL:** https://arxiv.org/html/2509.05396v2
- **Title/authors:** Talk Isn’t Always Cheap: Understanding Failure Modes in Multi-Agent Debate — **Andrea Wynn, Harsh Satija, Gillian K. Hadfield**.
- **Version date:** **October 13, 2025**.
- **Kind/access:** primary paper HTML; abstract/introduction excerpts inspected by worker.
- **Excerpt:** debate “can lead to a decrease in accuracy over time.”
- **Supports:** peer reasoning can move agents from correct to incorrect; weaker agents can harm stronger agents in some settings.
- **Limit:** counterevidence to automatic debate benefits, not evidence that independent non-debating review is harmful.

### E10 — Common-mode errors

- **URL:** https://arxiv.org/abs/2506.07962
- **Title/authors:** Correlated Errors in Large Language Models — **Elliot Kim, Avi Garg, Kenny Peng, Nikhil Garg**.
- **Date:** **June 9, 2025**.
- **Kind/access:** primary abstract.
- **Content inspected:** correlations across many models/tasks, including agreement when models err.
- **Supports:** model-family changes do not guarantee error independence.
- **Limit:** dataset-specific correlations are not this workflow’s correlation coefficient. The worker’s quoted dataset percentage is deliberately not used as an EGM estimate.

### E11 — Fresh-session review with a materially narrowed result

- **URL:** https://arxiv.org/html/2603.12123
- **Title/author:** Cross-Context Review: Improving LLM Output Quality by Separating Production and Review Sessions — **Song Tae-Eun**.
- **Date/version:** March2026 identifier; retrieved HTML explicitly includes **“Update in Version 2.”** Exact latest revision timestamp was not independently established; use retrieval date plus version heading, not a fabricated timestamp.
- **Kind/access:** primary preprint; Exa Contents plus direct public HTML. Abstract, §§6–8 and conclusion/limitations inspected.
- **Excerpt:** “CCR is not significantly ahead of context-aware subagent review … or of a single same-session review”; the broader earlier advantages “came from run1.”
- **Reported setting:** 30 artifacts/150 injected errors; one model, synthetic Korean software-engineering material; same-session, repeated same-session, context-aware subagent and fresh-session conditions.
- **Supports:** in this study, the fresh second look outperformed repeated same-session review; the revised result is narrower than the intuitive headline.
- **Major limitations:** one unverifiable SR run excluded, other records unverified rather than demonstrated clean; no raw model outputs in the retained review records; Korean/English review-language confound; heuristic location/keyword matcher without threshold-sensitivity analysis; no quantitative human baseline; synthetic error distribution. Matching-language bias may oppose the hypothesized model-language effect, so direction is uncertain.
- **Use here:** motivation for controlled trials, not proof that removing user context is generally better or that EGM wins.

### E12 — Freshness versus family, and placement of the second look

- **URL:** https://stephens.page/blog/fresh-eyes-beat-a-second-family/paper/fresh-eyes-beat-a-second-family.pdf
- **Title/author:** Fresh Eyes Beat a Second Family: A Preregistered Replay Study of Cross-Family AI Code Review in an Unattended Coding Pipeline — **Jacob Stephens**.
- **Date:** experiments **October10–12,2026**; PDF version **October12,2026**, including post-hoc follow-ups.
- **Kind/access:** practitioner research PDF; Exa Contents, then direct public PDF converted by installed `pdftotext`; abstract, methods §§4.5–4.6, discussion, threats/availability inspected.
- **Excerpt:** “where the second look is placed matters more than who takes it.”
- **Reported setting:** 183 historical review replays plus24 follow-up sessions; isolated repositories truncated at reviewed commits, different pipeline checkpoints, fresh same-family controls paired with cross-family arms.
- **Supports:** do not confound a different family with a fresh session; count author disposition failures as well as missed findings. The paper reports original reviewers raised two escaped defects that the authoring agent declined.
- **Major limitations:** all graders were Claude agents, one compared family, despite shuffled labels; style could reveal arm. One session per cell; no run-to-run variance. Freshness and review-skill version differ in one comparison. A fresh-Claude arm was added after initial results. Different checkpoints have different bars. One pipeline/six repositories/one developer, small samples. Per-finding private/unfixed-defect evidence withheld. These limitations are stated in the paper, not accusations of misconduct.
- **Use here:** a useful comparison design and a warning against model-diversity claims; not an EGM/Ultimate result, nor a justification for unattended merging.

## Search gaps and confidence discipline

No verified podcast transcript or attributable critical EGM-specific outcome study was found in the bounded search. We do not infer their nonexistence. Related papers were chosen to include both supportive mechanisms and counterevidence. Abstract-only sources support only the limited qualitative statements above. No secondary citation chain was treated as primary experimental verification. No experiment from this ledger was rerun; all results remain attributed to their authors.
