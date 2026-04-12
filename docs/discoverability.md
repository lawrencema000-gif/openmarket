# Discoverability — What Gets Ranked and Featured

## Ranking Signals

Apps are ranked by a weighted combination of:

| Signal | Weight | Direction |
|--------|--------|-----------|
| Search query relevance | High | Positive |
| Trust tier (audited > verified > experimental) | High | Positive |
| Crash-free device rate | Medium | Positive |
| Recent install success rate (30d) | Medium | Positive |
| Abuse report rate (per 1k installs) | High | Negative |
| Update freshness | Low | Positive |
| Review quality (rating + count) | Medium | Positive |
| 30-day retention estimate | Medium | Positive |

Experimental-lane apps receive a -30% ranking penalty in main search results. They appear at full weight in the Experimental Lab section.

## Trust Badges

| Badge | Condition |
|-------|-----------|
| Verified Developer | Identity confirmed |
| Experimental | Unverified developer |
| New | Published within 30 days |
| Recently Updated | Updated within 14 days |
| Security Reviewed | Risk score < 20 |
| High-Risk Permissions | Uses sensitive permission combinations |
| Ads/Trackers Declared | Developer declared ad content |
| Open Source | Source code URL provided |

## Featured Apps

Editorially curated. Must be from verified or audited developers. Selected for quality, utility, and category diversity.
