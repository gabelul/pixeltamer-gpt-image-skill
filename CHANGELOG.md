# Changelog

All notable changes to pixeltamer get logged here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning follows [SemVer](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial release.
- Two backends with auto-detect: OpenAI API (Python, zero-dep) and Codex CLI (bash, dual invocation pattern with fallback).
- Three modes: one-shot generation, multi-image batch with state-machine verification, multi-reference composition (up to 16 inputs via /images/edits).
- References folder covering prompting doctrine, both backends, multi-reference composition, post-processing, UI-mockup-specific patterns.
- Recipes for infographic, meta-ad, viral-linkedin, ui-mockup, editorial-cover, product-photo.
- SKILL.md for full-context environments and SKILL-OC.md token-optimized variant for OpenClaw.
- Multi-image batch verifier with state-machine `prompts.md` format and a 29-test node:test suite.

[Unreleased]: https://github.com/gabelul/pixeltamer/compare/v0.1.0...HEAD
